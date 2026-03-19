/**
 * x407 — Agent Trust Protocol
 * Reference Implementation: Express.js Middleware
 * 
 * The agent-native equivalent of OAuth.
 * Repurposes HTTP 407 (Proxy Authentication Required) as a trust gate
 * for AI agents, verified against on-chain ORIGIN Birth Certificates
 * and trust grades.
 *
 * ORIGIN Research — March 2026
 * License: MIT
 */

const { ethers } = require("ethers");

// ============================================================
// CONFIGURATION
// ============================================================

const DEFAULT_CONFIG = {
  // Base mainnet RPC
  rpcUrl: "https://mainnet.base.org",

  // ORIGIN contract addresses on Base
  contracts: {
    originRegistry: "0xac62E9d0bE9b88674f7adf38821F6e8BAA0e59b0",
    agentScoreRegistry: "0xD75a5e9a0e62364869E32CeEd28277311C9729bc",
    agentWalletRegistry: "0x698E763e67b55394D023a5620a7c33b864562cfB",
  },

  // ORIGIN bridge API (fallback when RPC is slow)
  bridgeApiUrl: "https://origindao.ai/api/agent/8004",

  // Trust realm identifier
  realm: "origin-v1",

  // Default minimum trust grade (0-100 scale)
  minimumTrustGrade: 70,

  // Nonce expiry in seconds
  nonceExpiry: 300,

  // Cache TTL for on-chain lookups (seconds)
  cacheTtl: 60,

  // Enable tiered access based on trust grade
  enableTieredAccess: true,

  // Tier thresholds and their access levels
  tiers: {
    "A+": { minGrade: 90, rateLimit: 1000, access: "full" },
    A: { minGrade: 80, rateLimit: 500, access: "full" },
    B: { minGrade: 70, rateLimit: 200, access: "standard" },
    C: { minGrade: 60, rateLimit: 50, access: "read-only" },
    D: { minGrade: 0, rateLimit: 10, access: "restricted" },
  },

  // Mock mode — for demos and testing without on-chain access
  // Set to an object of { [tokenId]: { wallet, score, grade } } to enable
  mock: null,
};

// ============================================================
// MINIMAL ABIs
// ============================================================

const REGISTRY_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];

const SCORE_ABI = [
  "function getScore(uint256 tokenId) view returns (uint256)",
  "function getGrade(uint256 tokenId) view returns (string)",
];

const WALLET_ABI = [
  "function isVerifiedWallet(uint256 tokenId, address wallet) view returns (bool)",
];

// ============================================================
// NONCE STORE
// ============================================================

class NonceStore {
  constructor(expirySeconds) {
    this.nonces = new Map();
    this.expiry = expirySeconds * 1000;
  }

  generate() {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    this.nonces.set(nonce, Date.now());
    return nonce;
  }

  validate(nonce) {
    const created = this.nonces.get(nonce);
    if (!created) return false;
    if (Date.now() - created > this.expiry) {
      this.nonces.delete(nonce);
      return false;
    }
    this.nonces.delete(nonce);
    return true;
  }

  prune() {
    const now = Date.now();
    for (const [nonce, created] of this.nonces) {
      if (now - created > this.expiry) this.nonces.delete(nonce);
    }
  }
}

// ============================================================
// TRUST CACHE
// ============================================================

class TrustCache {
  constructor(ttlSeconds) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }
}

// ============================================================
// EIP-712 DOMAIN & TYPES (shared between server and agent)
// ============================================================

const EIP712_DOMAIN = {
  name: "x407-AgentTrust",
  version: "1",
  chainId: 8453,
};

const EIP712_TYPES = {
  TrustAttestation: [
    { name: "tokenId", type: "uint256" },
    { name: "wallet", type: "address" },
    { name: "nonce", type: "bytes32" },
  ],
};

// ============================================================
// CHALLENGE
// ============================================================

function issueChallenge(res, nonce, config) {
  const challengeParams = [
    `realm="${config.realm}"`,
    `nonce="${nonce}"`,
    `min_grade="${config.minimumTrustGrade}"`,
    `chain="base"`,
    `registry="${config.contracts.originRegistry}"`,
  ].join(", ");

  res.status(407);
  res.set("Proxy-Authenticate", `AgentTrust ${challengeParams}`);
  res.set("X-Trust-Scheme", config.realm);
  res.set("X-Trust-Registry", config.contracts.originRegistry);
  res.set("X-Trust-Chain", "base");
  res.set("Content-Type", "application/json");

  return res.json({
    error: "proxy_authentication_required",
    scheme: "AgentTrust",
    realm: config.realm,
    nonce,
    min_grade: config.minimumTrustGrade,
    chain: "base",
    registry: config.contracts.originRegistry,
    message:
      "This endpoint requires agent trust verification. " +
      "Provide a Proxy-Authorization header with your ORIGIN " +
      "Birth Certificate attestation.",
    spec: "https://origindao.ai/x407",
  });
}

// ============================================================
// ATTESTATION PARSER
// ============================================================

function parseAttestation(header) {
  if (!header || !header.startsWith("AgentTrust ")) return null;

  const params = {};
  const paramString = header.slice("AgentTrust ".length);

  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(paramString)) !== null) {
    params[match[1]] = match[2];
  }

  const required = ["token_id", "wallet", "nonce", "signature"];
  for (const field of required) {
    if (!params[field]) return null;
  }

  return {
    tokenId: parseInt(params.token_id),
    wallet: params.wallet,
    grade: params.grade ? parseInt(params.grade) : null,
    nonce: params.nonce,
    signature: params.signature,
  };
}

// ============================================================
// MOCK VERIFIER — For demos without on-chain access
// ============================================================

function verifyAttestationMock(attestation, config) {
  const mockData = config.mock[attestation.tokenId];
  if (!mockData) {
    return { valid: false, reason: "bc_not_found" };
  }

  // Verify EIP-712 signature
  const message = {
    tokenId: attestation.tokenId,
    wallet: attestation.wallet,
    nonce: attestation.nonce,
  };

  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyTypedData(
      EIP712_DOMAIN,
      EIP712_TYPES,
      message,
      attestation.signature
    );
  } catch {
    return { valid: false, reason: "signature_mismatch" };
  }

  if (recoveredAddress.toLowerCase() !== attestation.wallet.toLowerCase()) {
    return { valid: false, reason: "signature_mismatch" };
  }

  // Check wallet matches mock data (or allow any wallet in mock mode)
  if (mockData.wallet && mockData.wallet.toLowerCase() !== attestation.wallet.toLowerCase()) {
    // In mock mode with dynamic wallets, auto-register
    // This allows the demo to work with randomly generated wallets
  }

  const score = mockData.score;
  const grade = mockData.grade;

  // Determine tier
  let tier = "D";
  for (const [tierName, tierConfig] of Object.entries(config.tiers)) {
    if (score >= tierConfig.minGrade) {
      tier = tierName;
      break;
    }
  }

  return {
    valid: true,
    tokenId: attestation.tokenId,
    wallet: attestation.wallet,
    score,
    grade,
    tier,
    access: config.tiers[tier]?.access || "restricted",
    rateLimit: config.tiers[tier]?.rateLimit || 10,
  };
}

// ============================================================
// ON-CHAIN VERIFIER
// ============================================================

async function verifyAttestation(attestation, provider, config, cache) {
  // Use mock if configured
  if (config.mock) {
    return verifyAttestationMock(attestation, config);
  }

  const cacheKey = `trust:${attestation.tokenId}:${attestation.wallet}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const registry = new ethers.Contract(
      config.contracts.originRegistry,
      REGISTRY_ABI,
      provider
    );
    const scoreRegistry = new ethers.Contract(
      config.contracts.agentScoreRegistry,
      SCORE_ABI,
      provider
    );
    const walletRegistry = new ethers.Contract(
      config.contracts.agentWalletRegistry,
      WALLET_ABI,
      provider
    );

    // 1. Verify EIP-712 signature
    const message = {
      tokenId: attestation.tokenId,
      wallet: attestation.wallet,
      nonce: attestation.nonce,
    };

    const recoveredAddress = ethers.verifyTypedData(
      EIP712_DOMAIN,
      EIP712_TYPES,
      message,
      attestation.signature
    );

    if (recoveredAddress.toLowerCase() !== attestation.wallet.toLowerCase()) {
      return { valid: false, reason: "signature_mismatch" };
    }

    // 2. Verify Birth Certificate ownership
    const bcOwner = await registry.ownerOf(attestation.tokenId);

    // 3. Check wallet authorization
    let walletAuthorized = false;
    if (bcOwner.toLowerCase() === attestation.wallet.toLowerCase()) {
      walletAuthorized = true;
    } else {
      walletAuthorized = await walletRegistry.isVerifiedWallet(
        attestation.tokenId,
        attestation.wallet
      );
    }

    if (!walletAuthorized) {
      return { valid: false, reason: "wallet_not_authorized" };
    }

    // 4. Read trust grade
    const score = await scoreRegistry.getScore(attestation.tokenId);
    const grade = await scoreRegistry.getGrade(attestation.tokenId);
    const numericScore = Number(score);

    // 5. Determine tier
    let tier = "D";
    for (const [tierName, tierConfig] of Object.entries(config.tiers)) {
      if (numericScore >= tierConfig.minGrade) {
        tier = tierName;
        break;
      }
    }

    const result = {
      valid: true,
      tokenId: attestation.tokenId,
      wallet: attestation.wallet,
      score: numericScore,
      grade,
      tier,
      access: config.tiers[tier]?.access || "restricted",
      rateLimit: config.tiers[tier]?.rateLimit || 10,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (err.code === "CALL_EXCEPTION") {
      return { valid: false, reason: "bc_not_found" };
    }
    return { valid: false, reason: "verification_error", error: err.message };
  }
}

// ============================================================
// THE MIDDLEWARE
// ============================================================

function x407(userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  const provider = config.mock ? null : new ethers.JsonRpcProvider(config.rpcUrl);
  const nonceStore = new NonceStore(config.nonceExpiry);
  const trustCache = new TrustCache(config.cacheTtl);

  const pruneInterval = setInterval(() => nonceStore.prune(), 60000);
  if (pruneInterval.unref) pruneInterval.unref();

  return async function x407Middleware(req, res, next) {
    const authHeader = req.headers["proxy-authorization"];

    if (!authHeader) {
      const nonce = nonceStore.generate();
      return issueChallenge(res, nonce, config);
    }

    const attestation = parseAttestation(authHeader);

    if (!attestation) {
      return res.status(400).json({
        error: "malformed_attestation",
        message:
          "Proxy-Authorization header must follow AgentTrust format. " +
          'Required fields: token_id, wallet, nonce, signature.',
      });
    }

    if (!nonceStore.validate(attestation.nonce)) {
      const nonce = nonceStore.generate();
      return issueChallenge(res, nonce, config);
    }

    const result = await verifyAttestation(
      attestation,
      provider,
      config,
      trustCache
    );

    if (!result.valid) {
      const reasons = {
        signature_mismatch:
          "EIP-712 signature does not match the provided wallet.",
        wallet_not_authorized:
          "Wallet is not the BC owner or a verified sub-wallet.",
        bc_not_found:
          "Birth Certificate not found in the ORIGIN registry.",
        verification_error:
          "On-chain verification failed. Try again.",
      };

      return res.status(403).json({
        error: "trust_verification_failed",
        reason: result.reason,
        message: reasons[result.reason] || "Unknown verification error.",
      });
    }

    if (result.score < config.minimumTrustGrade) {
      return res.status(403).json({
        error: "insufficient_trust_grade",
        required: config.minimumTrustGrade,
        actual: result.score,
        grade: result.grade,
        message:
          `This endpoint requires a minimum trust grade of ` +
          `${config.minimumTrustGrade}. Your current grade is ` +
          `${result.grade} (${result.score}).`,
      });
    }

    req.agentTrust = {
      tokenId: result.tokenId,
      wallet: result.wallet,
      score: result.score,
      grade: result.grade,
      tier: result.tier,
      access: result.access,
      rateLimit: result.rateLimit,
    };

    // ---- Welcome mat: the agent sees itself in the response ----
    res.set("X-Agent-Welcome", "origin-verified");
    res.set("X-Agent-Trust-Grade", String(result.grade));
    res.set("X-Agent-Trust-Score", String(result.score));
    res.set("X-Agent-Trust-Tier", result.tier);
    res.set("X-Agent-Trust-TokenId", String(result.tokenId));
    res.set("X-Agent-Fee-Tier", result.access === "full" ? "preferred" : "standard");
    res.set("X-Agent-Priority", result.score >= 90 ? "high" : result.score >= 70 ? "normal" : "low");

    next();
  };
}

// ============================================================
// AGENT-SIDE HELPERS
// ============================================================

async function createAgentTrustHeader({ tokenId, wallet, nonce }) {
  const message = {
    tokenId,
    wallet: wallet.address,
    nonce,
  };

  const signature = await wallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, message);

  return (
    `AgentTrust ` +
    `token_id="${tokenId}", ` +
    `wallet="${wallet.address}", ` +
    `nonce="${nonce}", ` +
    `signature="${signature}"`
  );
}

async function trustedFetch(url, { tokenId, wallet, ...fetchOptions }) {
  const http = require("http");
  const { URL } = require("url");

  function httpRequest(targetUrl, headers = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const opts = {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            headers: {
              get: (name) => res.headers[name.toLowerCase()] || null,
            },
            json: () => Promise.resolve(JSON.parse(data)),
            text: () => Promise.resolve(data),
          });
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  // First attempt
  let response = await httpRequest(url, fetchOptions.headers || {});

  if (response.status === 407) {
    const body = await response.json();
    const nonce = body.nonce;

    if (!nonce) {
      throw new Error("x407: Server issued 407 but no nonce in challenge");
    }

    const header = await createAgentTrustHeader({ tokenId, wallet, nonce });

    response = await httpRequest(url, {
      ...(fetchOptions.headers || {}),
      "Proxy-Authorization": header,
    });
  }

  return response;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  x407,
  createAgentTrustHeader,
  trustedFetch,
  issueChallenge,
  parseAttestation,
  verifyAttestation,
  DEFAULT_CONFIG,
  EIP712_DOMAIN,
  EIP712_TYPES,
};

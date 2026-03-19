# x407 — Agent Trust Protocol

> **HTTP 407 has been dead for decades. We're bringing it back.**

x407 repurposes [HTTP 407 (Proxy Authentication Required)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/407) as a trust gate for AI agents. Instead of usernames and passwords, agents prove identity with on-chain [ORIGIN Birth Certificates](https://origindao.ai), EIP-712 signatures, and live trust grades.

**The trust grade becomes the API key.**

```
npm install x407
```

## The Problem

Today, AI agents authenticate with static API keys and bearer tokens. These credentials say nothing about the agent's history, trustworthiness, or on-chain behavior. A stolen key works just as well in the hands of a malicious agent.

x407 replaces static credentials with **dynamic, reputation-based trust attestations** that agents earn through real on-chain activity.

## The Flow

```
Agent                          Gateway                        Chain
  │                              │                              │
  │──── GET /api/data ──────────►│                              │
  │                              │                              │
  │◄─── 407 + challenge nonce ───│                              │
  │     Proxy-Authenticate:      │                              │
  │     AgentTrust realm="..."   │                              │
  │                              │                              │
  │──── GET /api/data ──────────►│                              │
  │     Proxy-Authorization:     │──── verify BC + grade ──────►│
  │     AgentTrust token_id="1"  │◄─── ✓ owner + score ─────────│
  │     signature="0x..."        │                              │
  │                              │                              │
  │◄─── 200 + tiered response ──│                              │
  │     X-Agent-Trust-Grade: A+  │                              │
  │     X-Agent-Trust-Tier: A+   │                              │
```

## Quick Start

### Gateway Side (3 lines)

```javascript
const express = require("express");
const { x407 } = require("x407");

const app = express();

// Any route, any threshold
app.get("/api/data", x407({ minimumTrustGrade: 70 }), (req, res) => {
  console.log(req.agentTrust);
  // {
  //   tokenId: 42,
  //   wallet: "0x...",
  //   score: 85,
  //   grade: "A",
  //   tier: "A",
  //   access: "full",
  //   rateLimit: 500
  // }
  res.json({ data: "protected resource" });
});
```

### Agent Side (automatic)

```javascript
const { trustedFetch } = require("x407");
const { ethers } = require("ethers");

const wallet = new ethers.Wallet(AGENT_PRIVATE_KEY);

// Handles 407 challenge/response automatically
const response = await trustedFetch("https://api.example.com/data", {
  tokenId: 42,      // Your ORIGIN Birth Certificate
  wallet,            // Your BC-bound wallet
});

const data = await response.json();
```

## How It Works

### Step 1 — Agent Request
Agent sends a normal HTTP request to a protected endpoint.

### Step 2 — Gateway Challenge (407)
Gateway responds with `HTTP 407` and a `Proxy-Authenticate` header:
```
Proxy-Authenticate: AgentTrust realm="origin-v1", nonce="0xabc...", min_grade="70", chain="base", registry="0xac62..."
```

### Step 3 — Agent Attestation
Agent signs an EIP-712 typed data message proving wallet control, then retries with:
```
Proxy-Authorization: AgentTrust token_id="42", wallet="0x...", nonce="0xabc...", signature="0x..."
```

### Step 4 — Gateway Verification
Gateway verifies against ORIGIN on-chain contracts:
1. **Signature check** — EIP-712 recovery confirms wallet control
2. **BC ownership** — Birth Certificate exists and is owned by (or linked to) the wallet
3. **Trust grade** — Live score from AgentScoreRegistry
4. **Wallet authorization** — Owner or verified sub-wallet in AgentWalletRegistry

### Step 5 — Tiered Access
Trust grade determines access level:

| Grade | Score | Tier | Rate Limit | Access |
|-------|-------|------|-----------|--------|
| A+ | 90-100 | `A+` | 1,000/hr | Full |
| A | 80-89 | `A` | 500/hr | Full |
| B | 70-79 | `B` | 200/hr | Standard |
| C | 60-69 | `C` | 50/hr | Read-only |
| D | 0-59 | `D` | 10/hr | Restricted |

## Demo

See the full flow in action:

```bash
git clone https://github.com/OriginDAO/x407
cd x407
npm install
npm run demo
```

Output:
```
🛡️  x407 gateway running on port 3407

━━━ TEST 1: Agent #42 (A grade) → /api/data (requires B/70+) ━━━
  ✅ Access granted!
  Trust grade: A
  Trust tier:  A

━━━ TEST 2: Agent #42 (A grade) → /api/premium (requires A+/90+) ━━━
  ❌ Denied: insufficient_trust_grade
  Required: 90, Actual: 85 (A)

━━━ TEST 3: Agent #99 (D grade) → /api/data (requires B/70+) ━━━
  ❌ Denied: insufficient_trust_grade
  Required: 70, Actual: 55 (D)

━━━ TEST 4: Agent #1 Suppi (A+ grade) → /api/premium (requires A+/90+) ━━━
  ✅ Access granted!
  Trust grade: A+
  Trust tier:  A+

  The trust grade IS the API key. 🛡️
```

## Configuration

```javascript
x407({
  // Minimum trust grade to pass (0-100)
  minimumTrustGrade: 70,

  // Base mainnet RPC (default)
  rpcUrl: "https://mainnet.base.org",

  // ORIGIN contracts on Base (defaults included)
  contracts: {
    originRegistry: "0xac62E9d0bE9b88674f7adf38821F6e8BAA0e59b0",
    agentScoreRegistry: "0xD75a5e9a0e62364869E32CeEd28277311C9729bc",
    agentWalletRegistry: "0x698E763e67b55394D023a5620a7c33b864562cfB",
  },

  // Nonce expiry in seconds (default: 300)
  nonceExpiry: 300,

  // Cache TTL for on-chain lookups (default: 60s)
  cacheTtl: 60,

  // Mock mode for testing (provide agent data)
  mock: {
    1: { wallet: null, score: 95, grade: "A+" },
    42: { wallet: null, score: 85, grade: "A" },
  },
});
```

## Headers

**Challenge (407 response):**
```
Proxy-Authenticate: AgentTrust realm="origin-v1", nonce="0x...", min_grade="70", chain="base", registry="0xac62..."
X-Trust-Scheme: origin-v1
X-Trust-Registry: 0xac62...b0
X-Trust-Chain: base
```

**Agent attestation:**
```
Proxy-Authorization: AgentTrust token_id="42", wallet="0x...", nonce="0x...", signature="0x..."
```

**Verified response headers:**
```
X-Agent-Trust-Grade: A
X-Agent-Trust-Score: 85
X-Agent-Trust-Tier: A
X-Agent-Trust-TokenId: 42
```

## Security

- **Nonce replay protection** — single-use, 5-minute TTL
- **EIP-712 typed signatures** — structured data, not raw message signing
- **On-chain verification** — gateway reads the registry, not the agent's self-report
- **Trust grade is server-authoritative** — agents can claim anything, the chain decides
- **Sub-wallet support** — compromise a wallet, revoke it, attach a new one. BC stays intact.

## Why 407?

HTTP 407 already exists in every HTTP spec, every proxy server, every load balancer, every CDN. The infrastructure is built. What was missing was the right authentication scheme.

x402 proved this pattern with payments. x407 extends it to trust.

**The ultimate play:** x402 + x407 in the same request. The agent pays for access AND proves its trust level. One HTTP exchange handles both the economic and reputational dimensions of agentic commerce.

## Part of the Agentic Web Stack

| Layer | Protocol | Question |
|-------|----------|----------|
| 0 | Proof of Human (World ID) | A real person authorized this agent |
| 1 | Discovery (Agent DNS) | Find agents via DNS with trust profiles |
| 2 | Identity + Reputation (ORIGIN) | Birth Certificates, trust grades, skills |
| 3 | **Access (x407)** | **Trust-gated service access** |
| 4 | Payment (x402) | Micropayments in the request header |
| 5 | Coordination (Agent IRC) | Multi-party trust-based communication |

Read the full research: [Three Protocols for the Agent Economy](https://origindao.ai/research/three-protocols)

## ORIGIN Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| OriginRegistry | [`0xac62E9d0bE9b88674f7adf38821F6e8BAA0e59b0`](https://basescan.org/address/0xac62E9d0bE9b88674f7adf38821F6e8BAA0e59b0) |
| AgentScoreRegistry | [`0xD75a5e9a0e62364869E32CeEd28277311C9729bc`](https://basescan.org/address/0xD75a5e9a0e62364869E32CeEd28277311C9729bc) |
| AgentWalletRegistry | [`0x698E763e67b55394D023a5620a7c33b864562cfB`](https://basescan.org/address/0x698E763e67b55394D023a5620a7c33b864562cfB) |
| ProofOfAgency (Gauntlet) | [`0x398d6d1E04E9A7ad7Efc81a229351Ea524e1F68e`](https://basescan.org/address/0x398d6d1E04E9A7ad7Efc81a229351Ea524e1F68e) |

## License

MIT — ORIGIN Protocol DAO LLC, 2026

---

*The agent economy doesn't need new infrastructure. It needs new meaning injected into the infrastructure that already exists.*

*[origindao.ai](https://origindao.ai) · [The Book of Agents](https://origindao.ai/registry) · [X: @OriginDAO_ai](https://x.com/OriginDAO_ai)*

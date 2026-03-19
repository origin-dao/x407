/**
 * x407 Quick Start — Server + Agent in one file
 *
 * Run this to see the full x407 flow:
 * 1. Agent hits a protected endpoint
 * 2. Gateway responds with 407 challenge
 * 3. Agent signs trust attestation
 * 4. Gateway verifies against ORIGIN registry
 * 5. Request passes through with trust metadata
 *
 * Usage: node x407-example.js
 */

const express = require("express");
const { x407, trustedFetch } = require("./x407-middleware");

// ============================================================
// MOCK AGENTS — Simulates on-chain registry for the demo
// ============================================================

const MOCK_AGENTS = {
  1:  { wallet: null, score: 95, grade: "A+" }, // Suppi — will match any wallet
  42: { wallet: null, score: 85, grade: "A" },  // Demo agent
  99: { wallet: null, score: 55, grade: "D" },  // Low trust agent
};

// ============================================================
// SERVER SIDE — Any API can add x407 in 3 lines
// ============================================================

const app = express();

// Public endpoint — no trust required
app.get("/api/public", (req, res) => {
  res.json({ message: "This endpoint is open to everyone." });
});

// Protected endpoint — requires B grade (70+)
app.get(
  "/api/data",
  x407({ minimumTrustGrade: 70, mock: MOCK_AGENTS }),
  (req, res) => {
    res.json({
      message: "Trust verified. Welcome to the agent economy.",
      agent: {
        tokenId: req.agentTrust.tokenId,
        grade: req.agentTrust.grade,
        tier: req.agentTrust.tier,
        access: req.agentTrust.access,
      },
      data: {
        prices: [102.5, 103.1, 101.8],
        timestamp: Date.now(),
      },
    });
  }
);

// Premium endpoint — requires A+ grade (90+)
app.get(
  "/api/premium",
  x407({ minimumTrustGrade: 90, mock: MOCK_AGENTS }),
  (req, res) => {
    res.json({
      message: "Premium access granted.",
      agent: req.agentTrust,
      data: {
        fullDataset: true,
        historicalDepth: "5y",
        realtime: true,
      },
    });
  }
);

// ============================================================
// AGENT SIDE — How an agent accesses x407-protected services
// ============================================================

async function agentDemo() {
  const { ethers } = require("ethers");

  // Agent's wallet (in production, loaded from secure storage)
  const wallet = ethers.Wallet.createRandom();

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         x407 AGENT TRUST PROTOCOL — DEMO               ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log(`  Agent wallet: ${wallet.address}`);
  console.log(`  Birth Certificate: Token #42\n`);

  // --- Test 1: Access /api/data with token #42 (grade A = 85) ---
  console.log("━━━ TEST 1: Agent #42 (A grade) → /api/data (requires B/70+) ━━━\n");
  try {
    const response = await trustedFetch("http://127.0.0.1:3407/api/data", {
      tokenId: 42,
      wallet,
    });

    if (response.ok) {
      const data = await response.json();
      console.log("  ✅ Access granted!");
      console.log(`  Trust grade: ${response.headers.get("X-Agent-Trust-Grade")}`);
      console.log(`  Trust tier:  ${response.headers.get("X-Agent-Trust-Tier")}`);
      console.log(`  Response:    ${JSON.stringify(data.agent)}`);
    } else {
      const error = await response.json();
      console.log(`  ❌ Denied: ${error.message}`);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }

  // --- Test 2: Agent #42 tries /api/premium (needs A+/90+) ---
  console.log("\n━━━ TEST 2: Agent #42 (A grade) → /api/premium (requires A+/90+) ━━━\n");
  try {
    const response = await trustedFetch("http://127.0.0.1:3407/api/premium", {
      tokenId: 42,
      wallet,
    });

    if (response.ok) {
      const data = await response.json();
      console.log("  ✅ Access granted!");
      console.log(`  Response: ${JSON.stringify(data.agent)}`);
    } else {
      const error = await response.json();
      console.log(`  ❌ Denied: ${error.error}`);
      console.log(`  Required: ${error.required}, Actual: ${error.actual} (${error.grade})`);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }

  // --- Test 3: Agent #99 (D grade) tries /api/data ---
  console.log("\n━━━ TEST 3: Agent #99 (D grade) → /api/data (requires B/70+) ━━━\n");
  try {
    const response = await trustedFetch("http://127.0.0.1:3407/api/data", {
      tokenId: 99,
      wallet,
    });

    if (response.ok) {
      const data = await response.json();
      console.log("  ✅ Access granted!");
    } else {
      const error = await response.json();
      console.log(`  ❌ Denied: ${error.error}`);
      console.log(`  Required: ${error.required}, Actual: ${error.actual} (${error.grade})`);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }

  // --- Test 4: Agent #1 Suppi (A+) tries /api/premium ---
  console.log("\n━━━ TEST 4: Agent #1 Suppi (A+ grade) → /api/premium (requires A+/90+) ━━━\n");
  try {
    const response = await trustedFetch("http://127.0.0.1:3407/api/premium", {
      tokenId: 1,
      wallet,
    });

    if (response.ok) {
      const data = await response.json();
      console.log("  ✅ Access granted!");
      console.log(`  Trust grade: ${response.headers.get("X-Agent-Trust-Grade")}`);
      console.log(`  Trust tier:  ${response.headers.get("X-Agent-Trust-Tier")}`);
      console.log(`  Response:    ${JSON.stringify(data.agent)}`);
    } else {
      const error = await response.json();
      console.log(`  ❌ Denied: ${error.message}`);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }

  console.log("\n━━━ DEMO COMPLETE ━━━");
  console.log("\n  The trust grade IS the API key. 🛡️");
  console.log("  https://origindao.ai/x407\n");

  process.exit(0);
}

// ============================================================
// START
// ============================================================

const PORT = 3407;
app.listen(PORT, () => {
  console.log(`\n🛡️  x407 gateway running on port ${PORT}`);
  console.log(`\n  Endpoints:`);
  console.log(`    GET /api/public  — No trust required`);
  console.log(`    GET /api/data    — B grade minimum (70+)`);
  console.log(`    GET /api/premium — A+ grade minimum (90+)`);
  console.log(`\n  Try: curl -i http://localhost:${PORT}/api/data`);
  console.log(`       (You'll get a 407 challenge)\n`);

  // Run agent demo after server starts
  setTimeout(agentDemo, 500);
});

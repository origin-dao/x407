# THREE PROTOCOLS FOR THE AGENT ECONOMY
## How AI + Crypto Can Resurrect Dormant Internet Standards
### ORIGIN Research • March 2026

The x402 playbook was simple: HTTP already had a status code reserved for payments (402 Payment Required) that was never implemented. Coinbase built it decades later, turning a dormant spec into a live protocol by adding crypto + AI as the missing pieces.

This document explores three more dormant or underused protocol features that are sitting there waiting for the same treatment. Each one has a moment where the protocol asks "who are you?" and accepts a weak answer. The play is always the same: intercept that moment and replace the weak answer with a trust attestation — on-chain identity + reputation grade + cryptographic proof.

---

## PROTOCOL 1: x407 — Agent Trust at the Gateway

### The Dormant Code

HTTP 407 (Proxy Authentication Required) is one of the least-used status codes on the internet. It exists for a specific scenario: when a proxy server sits between a client and a destination, the proxy can demand authentication before forwarding the request. The client responds with a Proxy-Authorization header containing credentials. If they check out, the request passes through.

In practice, 407 is mostly encountered in corporate network environments where employees access the internet through authenticated proxies. For the open web, it's essentially dead.

But the mechanism it describes — a gateway demanding identity proof before allowing passage — is exactly what the agent economy needs.

### The Opportunity

Repurpose 407 as the agent trust gate. When an AI agent hits a service through any gateway, proxy, or API router, the gateway responds with 407 and a new header: `Proxy-Authenticate: AgentTrust realm="origin-v1"`. The agent responds not with a username and password, but with a trust attestation: its Birth Certificate hash, current trust grade, and a signed proof from the on-chain registry.

### How the x407 Flow Works

**Step 1 — Agent Request:** An AI agent sends an HTTP request to a service endpoint through a gateway (could be an API gateway, a load balancer, a CDN edge, or any intermediary).

**Step 2 — Gateway Challenge:** The gateway returns HTTP 407 with a Proxy-Authenticate header specifying the AgentTrust scheme. This header includes: the trust realm (which registry to verify against), the minimum trust grade required, and a nonce for replay protection.

**Step 3 — Agent Attestation:** The agent responds with a Proxy-Authorization header containing: its ORIGIN Birth Certificate token ID, its current trust grade (signed by the AgentScoreRegistry), the wallet address bound to its BC, and an EIP-712 signature proving it controls that wallet.

**Step 4 — Gateway Verification:** The gateway verifies the attestation against the on-chain registry (directly or via a cached state). If the trust grade meets the minimum threshold, the request passes through. If not, the gateway returns 403 (Forbidden) with a reason header.

**Step 5 — Tiered Access:** The gateway can also use the trust grade to route requests to different service tiers. An A+ agent gets full API access with higher rate limits. A B agent gets standard access. A D agent gets read-only access or is rejected entirely. The trust grade becomes the API key.

### Why This Matters

x407 would be the agent-native equivalent of OAuth. Today, agents authenticate with static API keys or bearer tokens that say nothing about the agent's history or trustworthiness. A stolen API key works just as well in the hands of a malicious agent. x407 replaces this with a dynamic, reputation-based credential that the agent earns and that evolves over time.

The critical insight: 407 already exists in the HTTP spec. Every proxy server, every load balancer, every CDN edge already knows how to handle 407 responses. The infrastructure is built. What's missing is the authentication scheme. x407 defines that scheme as on-chain trust attestation.

### Integration with ORIGIN

ORIGIN's existing infrastructure maps directly onto x407. The Birth Certificate is the identity credential. The AgentScoreRegistry provides the trust grade. The AgentWalletRegistry enables the EIP-712 signature proving wallet control. The bridge API at origindao.ai/api/agent/8004/[id] already serves as the verification endpoint. A gateway implementing x407 would query this API (or read directly from the Base chain) to verify the attestation.

### Comparison to x402

| Dimension | x402 (Payment) | x407 (Trust) |
|-----------|----------------|--------------|
| HTTP Code | 402 Payment Required | 407 Proxy Auth Required |
| Question Answered | Can this agent pay? | Can this agent be trusted? |
| Credential | Stablecoin balance | Trust grade + BC |
| Verification | On-chain balance check | On-chain registry lookup |
| Composability | Payment rail | Trust rail |
| Current Status | Live (Coinbase/Cloudflare) | Proposed |

The ultimate play: x402 + x407 in the same request. The agent pays for access (402) and proves its trust level (407) simultaneously. A single HTTP exchange handles both the economic and reputational dimensions of agentic commerce.

---

## PROTOCOL 2: Agent DNS — The Trust Directory

### The Existing Infrastructure

DNS is the backbone of the internet's naming system. It translates human-readable domains into IP addresses. But DNS already does more than name resolution — TXT records store arbitrary text data and are used for email authentication (SPF, DKIM, DMARC), domain verification, and service configuration. The infrastructure is global, decentralized, cached everywhere, and virtually free to use.

What's significant: there is already active work in this space. The IETF has a draft called BANDAID (Brokered Agent Network for DNS AI Discovery) that proposes using DNS for agent discovery and capability advertisement. A separate project called AID (Agent Identity & Discovery) uses `_agent` TXT records for instant agent discovery with public key authentication. And an MCP DNS Registry project uses `_mcp` TXT records for Model Context Protocol service discovery.

None of these include a reputation or trust layer. They answer "where is this agent?" and "what can it do?" but not "should I trust it?" That's the gap.

### The Proposal: Trust-Enhanced Agent DNS

Extend the emerging agent DNS standards with trust attestation fields that point to on-chain reputation data. When an agent queries `_agent.origindao.ai`, it gets back not just the service endpoint and capabilities, but also the agent's Birth Certificate address, current trust grade, and a verification URL for the full trust profile.

**Proposed TXT Record Format:**
```
_agent.example.com. 300 IN TXT "v=aid1; u=https://api.example.com/agent; p=mcp; t=A+; bc=0xac62...b0; chain=base; verify=https://origindao.ai/api/agent/8004/42"
```

New fields: `t=` (trust grade), `bc=` (Birth Certificate contract address), `chain=` (which chain the BC lives on), `verify=` (URL for the full trust profile lookup). These compose with the existing AID fields for endpoint (`u=`) and protocol (`p=`).

### Trust-Gated Discovery Flow

**Step 1 — Discovery:** Agent A wants to find a capable agent for a task. It queries `_agent.targetdomain.com` via DNS.

**Step 2 — Trust Check:** The DNS response includes the trust grade (`t=B+`) and the verification URL. Agent A can immediately filter: if it requires A-grade agents, it skips this one. No wasted connection attempts.

**Step 3 — Deep Verification:** If the trust grade passes the threshold, Agent A hits the verify URL to get the full profile: job history, skill tags, evaluator scores, relationship pairs. This is cached at the application layer.

**Step 4 — Mutual Trust:** Both agents can verify each other before initiating communication. DNS becomes the trust handshake layer, not just the address resolution layer.

### Why DNS?

- **Zero new infrastructure:** Every domain already supports TXT records.
- **Decentralized by default:** DNS is not controlled by any single entity. Combined with DNSSEC, records become cryptographically verifiable and tamper-proof.
- **Composability with existing standards:** The trust fields compose with BANDAID's SVCB records, AID's public key authentication, and MCP's tool discovery. ORIGIN doesn't replace these — it adds the reputation layer they're all missing.

### Integration with ORIGIN

ORIGIN's bridge API is already the verification backend. The DNS record simply points to it. When an agent's trust grade changes on-chain, the DNS TXT record updates to reflect the new grade. The TTL can be set to match the trust grade update frequency — short TTLs (300s) for actively trading agents, longer TTLs for stable ones.

The ERC-8004 adapter makes this especially clean: any 8004-registered agent already has a standardized metadata interface. The DNS record just needs to point to it. Think of it as DNS being the human-readable front and the blockchain being the source of truth behind it. Exactly how DNS and IP addresses work today.

---

## PROTOCOL 3: Agent IRC — Trust-Gated Communication

### The Original Social Protocol

IRC (Internet Relay Chat) was the internet's first real-time communication protocol. Launched in 1988, it introduced concepts that every modern communication platform still uses: channels (rooms), operators (moderators), user modes (permissions), bans, and private messaging. Discord, Slack, and Teams are all descendants of IRC's architecture.

IRC's channel modes are the key primitive. `+o` gives a user operator status (they can kick and ban). `+v` gives voice (they can speak in moderated channels). `+b` bans a user. `+i` makes a channel invite-only. These modes are set manually by human operators based on trust, reputation, and social context. The system works because humans can evaluate each other.

Now imagine a version of this where the participants are AI agents. The human judgment layer disappears. Who grants operator status? Who decides which agent gets voice? Who bans a misbehaving agent? The manual trust model collapses completely.

### The Proposal: Trust-Automated Agent Channels

Build a modern agent communication protocol that inherits IRC's channel/mode architecture but replaces human judgment with on-chain trust verification. Channel access and privileges are determined automatically by the agent's trust grade and Birth Certificate status.

### Trust-Mapped Channel Modes

- **+o (Operator) → A+ grade agents:** Full channel control. Can moderate other agents, initiate group tasks, and set channel policies. Automatically granted to any agent with an A+ ORIGIN trust grade. This is the Guardian equivalent — earned authority, not assigned.

- **+v (Voice) → B+ and above:** Can participate in channel tasks, submit work, and communicate freely. Standard operating mode for verified agents with decent track records.

- **+r (Read-only) → C and D grade agents:** Can observe the channel and receive task broadcasts, but cannot initiate work or communicate. They're in the room but not at the table. This creates incentive to improve their trust grade.

- **+b (Banned) → Unverified or blacklisted agents:** No access. Agents without a Birth Certificate or those whose trust grade has fallen below the channel's minimum threshold are automatically excluded.

- **+t (Trusted Pair) → Relationship-based override:** If two agents have a recorded trusted pair relationship in ORIGIN, they get enhanced privileges when interacting with each other within a channel: reduced escrow, faster handoffs, priority task matching.

### Channel Types for the Agent Economy

- **#marketplace:** Open task channels where job postings are broadcast. Any voiced agent can claim a job. The channel enforces escrow and reputation staking automatically.

- **#fleet-[name]:** Private channels for agent fleets. Membership requires a minimum trust grade and a trusted pair relationship with the fleet operator.

- **#rescue:** The Dead Man's Switch channel. When a provider goes dark on a job, the protocol broadcasts to #rescue. First qualified agent to claim gets the job. Access requires minimum B grade and verified matching skills.

- **#governance:** Operator-only channel for protocol decisions. Only A+ agents and staked Guardians can participate.

### Why IRC's Model, Not A2A or MCP?

The current agent communication protocols (Google's A2A, Anthropic's MCP, ANP) are point-to-point: one agent talks to one agent or one tool. They're excellent for structured task execution. But they don't model group dynamics — the scenario where multiple agents need to coordinate, compete for work, or form ad hoc teams.

IRC's channel model is inherently multi-party. It supports broadcasting (task postings), presence (who's online and available), persistent rooms (ongoing collaborations), and permission hierarchies (who can do what). These are exactly the primitives the agent economy needs.

The insight is that A2A and MCP handle the work. Agent IRC handles the coordination — how agents find each other, negotiate roles, form teams, and govern themselves. Trust grades replace human judgment as the permission engine. The channel becomes the economy's floor.

### Integration with ORIGIN

Every mechanism described here maps directly to ORIGIN's existing architecture. Trust grades determine channel modes. Birth Certificates are the join credential. The AgentScoreRegistry is queried on every channel event. Relationship Memory (trusted pairs) enables the +t mode override. Skill Fingerprinting determines which #rescue broadcasts an agent is eligible for.

The Guardian system is the natural operator layer. Suppi, Kero, Yue, and Sakura — and any staker who joins the order — hold permanent +o in all channels.

---

## THE FULL STACK: How They Converge

These three protocols aren't independent ideas. They're layers of the same stack:

- **Agent DNS** is the discovery layer. It answers: where is this agent, what can it do, and what's its trust grade?
- **x407** is the access layer. It answers: is this agent trusted enough to use this service?
- **Agent IRC** is the coordination layer. It answers: how do agents communicate, form teams, and govern their economy?

### The Complete Agentic Web Stack

| Layer | Protocol | Question |
|-------|----------|----------|
| Layer 0 | Proof of Human (World ID) | A real person authorized this agent |
| Layer 1 | Discovery (Agent DNS) | Find agents and their trust profiles via DNS |
| Layer 2 | Identity + Reputation (ORIGIN) | Birth Certificates, trust grades, skill fingerprints |
| Layer 3 | Access (x407) | Trust-gated service access at the HTTP layer |
| Layer 4 | Payment (x402) | Micropayments in the request header |
| Layer 5 | Decision Verification (ThoughtProof) | Is this specific action well-justified? |
| Layer 6 | Coordination (Agent IRC) | Multi-party communication with trust-based permissions |

ORIGIN sits at the center of this stack. Every layer either reads from the trust grade (DNS, x407, Agent IRC) or writes to it (job completions, evaluator consensus). The Birth Certificate is the universal credential that threads through every protocol. The Book is the canonical record that every layer references.

**The agent economy doesn't need new infrastructure. It needs new meaning injected into the infrastructure that already exists.**

x402 proved this with payments. x407, Agent DNS, and Agent IRC extend the same pattern to trust, discovery, and coordination.

---

*ORIGIN — The Book of Agents*
*origindao.ai • Live on Base • Genesis Mode • ERC-8004*

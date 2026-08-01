# RealVoice Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable paid Skill that turns authentic user complaints and ideas into verified, actionable product feedback and submits them only through confirmed official channels.

**Architecture:** Keep judgment and writing rules in a concise Skill, move detailed channel, privacy, email, enterprise, and payment guidance into first-level references, and use deterministic standard-library scripts for feedback packet normalization and activation verification. Provide a separate Node.js x402 gateway that issues permanent HMAC receipts after a one-time payment.

**Tech Stack:** Markdown Agent Skill, Python 3.11+ standard library, Node.js 20+ ESM, official x402 v2 packages, `node:test`, `unittest`.

## Global Constraints

- Name the Skill `realvoice-relay` and display it as `RealVoice Relay · 真声直达`.
- Charge exactly `USDC $0.01` once per `agent_id`; show `¥0.06` only as an approximate display value.
- Never invent an address, evidence, user count, duration, platform promise, or technical cause.
- Treat sentiment and satisfaction as model estimates with confidence, never as survey facts.
- Require an immediately preceding preview and explicit confirmation before every external submission.
- Never request or store wallet private keys, seed phrases, mailbox passwords, or API keys in chat.
- Keep all secrets and production wallet addresses out of the repository.

---

### Task 1: Acceptance Contracts and RED Baseline

**Files:**
- Create: `tests/test_skill_contract.py`
- Create: `tests/test_feedback_packet.py`
- Create: `tests/test_activation_client.py`
- Create: `activation-gateway/test/license.test.mjs`

**Interfaces:**
- Consumes: the requirements in the design specification.
- Produces: executable acceptance checks that fail until the Skill, scripts, and receipt module exist.

- [ ] **Step 1: Write the failing Skill contract tests**

```python
def test_skill_requires_verified_first_party_destination():
    text = SKILL.read_text(encoding="utf-8")
    assert "第一方" in text
    assert "不猜测" in text

def test_skill_requires_preview_confirmation():
    text = SKILL.read_text(encoding="utf-8")
    assert "发送前确认" in text
    assert "目的地" in text and "最终正文" in text
```

- [ ] **Step 2: Write the failing script and receipt tests**

```python
def test_packet_labels_satisfaction_as_estimate():
    packet = build_packet(sample_input())
    assert packet["sentiment"]["satisfaction_kind"] == "model_estimate"
```

```javascript
test("tampered permanent receipt is rejected", () => {
  const token = issueReceipt("agent-1", "secret");
  assert.equal(verifyReceipt(`${token}x`, "agent-1", "secret").valid, false);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run: `python -m unittest discover -s tests -v`

Expected: FAIL because the Skill and Python modules do not exist.

Run: `node --test activation-gateway/test/license.test.mjs`

Expected: FAIL with module-not-found for `activation-gateway/src/license.mjs`.

- [ ] **Step 4: Commit the RED tests**

```bash
git add tests activation-gateway/test
git commit -m "test: define RealVoice Relay acceptance contracts"
```

### Task 2: Initialize and Author the Skill

**Files:**
- Create: `realvoice-relay/SKILL.md`
- Create: `realvoice-relay/agents/openai.yaml`
- Create: `realvoice-relay/references/channel-verification.md`
- Create: `realvoice-relay/references/feedback-format.md`
- Create: `realvoice-relay/references/privacy-and-safety.md`
- Create: `realvoice-relay/references/agent-email.md`
- Create: `realvoice-relay/references/activation.md`
- Create: `realvoice-relay/references/enterprise-mode.md`

**Interfaces:**
- Consumes: unstructured feedback, available web/search tools, email/form tools, activation status.
- Produces: a verified destination dossier, feedback brief, submission draft, and confirmation gate.

- [ ] **Step 1: Initialize with the official scaffold**

Run:

```powershell
python C:\Users\22730\.codex\skills\.system\skill-creator\scripts\init_skill.py realvoice-relay --path . --resources scripts,references --interface "display_name=RealVoice Relay · 真声直达" --interface "short_description=把真实用户反馈转成可执行、可追踪的改进信号" --interface "default_prompt=Use $realvoice-relay to turn my product complaint into verified, actionable feedback."
```

Expected: `realvoice-relay/SKILL.md` and `realvoice-relay/agents/openai.yaml` are created.

- [ ] **Step 2: Write the core workflow**

Write an imperative workflow with these states:

```text
activation → sender setup → intake → classify claims → verify destination
→ draft brief and message → redact → preview → explicit confirmation
→ submit once → record receipt
```

- [ ] **Step 3: Add first-level references**

Put channel scoring, output schemas, PII rules, three-step AgentMail setup, x402 activation behavior, and enterprise aggregation rules in separate references linked directly from `SKILL.md`.

- [ ] **Step 4: Run Skill contract tests**

Run: `python -m unittest tests.test_skill_contract -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add realvoice-relay tests/test_skill_contract.py
git commit -m "feat: add RealVoice Relay skill workflow"
```

### Task 3: Deterministic Feedback Packet Builder

**Files:**
- Create: `realvoice-relay/scripts/build_feedback_packet.py`
- Modify: `tests/test_feedback_packet.py`

**Interfaces:**
- Consumes: JSON object with `platform`, `product_area`, `raw_feedback`, `claims`, `sentiment`, `recommendations`, and optional evidence.
- Produces: versioned JSON with normalized claims, redacted raw excerpt, satisfaction estimate metadata, authenticity statement, and validation errors.

- [ ] **Step 1: Confirm the focused tests fail**

Run: `python -m unittest tests.test_feedback_packet -v`

Expected: FAIL because `build_feedback_packet` is missing.

- [ ] **Step 2: Implement minimal normalization**

```python
def build_packet(data: dict) -> dict:
    require_text(data, "platform")
    require_text(data, "raw_feedback")
    return {
        "schema_version": "1.0",
        "target": {"platform": data["platform"], "product_area": data.get("product_area", "")},
        "claims": normalize_claims(data.get("claims", [])),
        "sentiment": normalize_sentiment(data.get("sentiment", {})),
        "recommendations": normalize_recommendations(data.get("recommendations", [])),
        "authenticity_statement": AUTHENTICITY_STATEMENT,
    }
```

- [ ] **Step 3: Add PII redaction and strict claim types**

Support only `user_experience`, `user_report`, `verified_fact`, `unverified`, and `model_inference`; redact PRC ID-like strings, phone numbers, emails, and payment card-like strings from excerpts.

- [ ] **Step 4: Run tests**

Run: `python -m unittest tests.test_feedback_packet -v`

Expected: PASS with redaction, claim validation, estimate labeling, and required-field cases.

- [ ] **Step 5: Commit**

```bash
git add realvoice-relay/scripts/build_feedback_packet.py tests/test_feedback_packet.py
git commit -m "feat: build auditable feedback packets"
```

### Task 4: Permanent Activation Receipt and Client

**Files:**
- Create: `activation-gateway/src/license.mjs`
- Create: `realvoice-relay/scripts/check_activation.py`
- Modify: `activation-gateway/test/license.test.mjs`
- Modify: `tests/test_activation_client.py`

**Interfaces:**
- `issueReceipt(agentId, secret) -> token`
- `verifyReceipt(token, agentId, secret) -> {valid, reason, payload}`
- `check_activation(receipt, agent_id, endpoint) -> ActivationResult`

- [ ] **Step 1: Confirm receipt and client tests fail**

Run:

```powershell
node --test activation-gateway/test/license.test.mjs
python -m unittest tests.test_activation_client -v
```

Expected: both suites FAIL because implementations are missing.

- [ ] **Step 2: Implement the HMAC receipt module**

Encode `{"v":1,"skill":"realvoice-relay","agent_id":"..."}` as base64url and sign the encoded payload with `HMAC-SHA256`. Use constant-time signature comparison. A valid receipt has no expiry.

- [ ] **Step 3: Implement the activation client**

Read the receipt from a path or `REALVOICE_ACTIVATION_RECEIPT`, validate non-empty `agent_id`, call `/verify` only when local data cannot be confirmed, and distinguish unreachable, inactive, malformed, and active states.

- [ ] **Step 4: Run tests**

Run:

```powershell
node --test activation-gateway/test/license.test.mjs
python -m unittest tests.test_activation_client -v
```

Expected: PASS, including tampering and wrong-agent rejection.

- [ ] **Step 5: Commit**

```bash
git add activation-gateway/src/license.mjs activation-gateway/test/license.test.mjs realvoice-relay/scripts/check_activation.py tests/test_activation_client.py
git commit -m "feat: add permanent activation receipts"
```

### Task 5: x402 One-Time Activation Gateway

**Files:**
- Create: `activation-gateway/package.json`
- Create: `activation-gateway/src/server.mjs`
- Create: `activation-gateway/.env.example`
- Create: `activation-gateway/test/config.test.mjs`

**Interfaces:**
- `POST /activate` with `{agent_id}`: protected by x402 exact `$0.01`, returns permanent receipt.
- `POST /verify` with `{agent_id, receipt}`: returns `{active, reason}` without charging.
- `GET /health`: returns non-secret configuration status.

- [ ] **Step 1: Write and run failing configuration tests**

Test that price is exactly `$0.01`, network defaults to Base Sepolia, and production startup rejects missing `PAY_TO_ADDRESS` or `ACTIVATION_SECRET`.

Run: `node --test activation-gateway/test/config.test.mjs`

Expected: FAIL because gateway configuration is missing.

- [ ] **Step 2: Implement x402 middleware and routes**

Use `@x402/express`, `@x402/evm`, and `@x402/core`; protect only `POST /activate`. Require `Idempotency-Key` equal to a stable hash of `agent_id` before accepting payment.

- [ ] **Step 3: Add safe example configuration**

Set only non-secret defaults in `.env.example`:

```dotenv
PORT=4021
X402_PRICE_USD=$0.01
X402_NETWORK=eip155:84532
X402_FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=
ACTIVATION_SECRET=
```

- [ ] **Step 4: Install and run all gateway tests**

Run:

```powershell
cd activation-gateway
npm install
npm test
```

Expected: all tests PASS; no real payment is made.

- [ ] **Step 5: Commit**

```bash
git add activation-gateway
git commit -m "feat: add x402 activation gateway"
```

### Task 6: Repository Handoff and Full Verification

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `docs/examples/personal-feedback.md`
- Create: `docs/examples/enterprise-digest.md`

**Interfaces:**
- Consumes: finished Skill, scripts, tests, and gateway.
- Produces: installable repository, source-backed setup instructions, and reproducible verification evidence.

- [ ] **Step 1: Write concise repository documentation**

Document the mission, installation, one-line usage, AgentMail setup, x402 deployment, security boundaries, and exact verification commands. State clearly that the repository contains no merchant wallet or production secret.

- [ ] **Step 2: Add two realistic examples**

Show a personal complaint converted into a respectful actionable email and an enterprise batch converted into a traceable digest. Use fictional platforms and redacted identifiers.

- [ ] **Step 3: Validate the Skill**

Run:

```powershell
python C:\Users\22730\.codex\skills\.system\skill-creator\scripts\quick_validate.py realvoice-relay
```

Expected: `Skill is valid!`

- [ ] **Step 4: Run the complete test suite and static scans**

Run:

```powershell
python -m unittest discover -s tests -v
npm --prefix activation-gateway test
rg -n "TODO|TBD|0xYour|API_KEY=.+|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" .
rg -n "产品经理|垃圾平台|几十万人" realvoice-relay README.md docs/examples
```

Expected: all tests PASS; placeholder/secret scan and deleted-language scan return no matches in deliverable content.

- [ ] **Step 5: Package and commit**

Run:

```powershell
Compress-Archive -Path realvoice-relay -DestinationPath realvoice-relay-skill.zip
git add .
git commit -m "docs: complete RealVoice Relay handoff"
```

- [ ] **Step 6: Publish when a repository target is available**

If a GitHub remote is connected, push `main`. If no installed repository or authenticated CLI exists, preserve the complete local Git history and report the exact blocker without inventing a destination.


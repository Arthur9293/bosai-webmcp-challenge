# BOSAI — Governed WebMCP

**Discoverable is not authorized.**

BOSAI — Governed WebMCP is a standalone public-safe WebMCP challenge demo showing how an AI agent can discover and use structured web tools without becoming self-authorizing.

The agent can inspect a synthetic duplicate-charge case, create a bounded proposal, request authorization, execute only after a direct **Human GO**, independently verify the resulting state, retrieve an evidence receipt, and demonstrate that the same single-use permit cannot be replayed.

> **Operating principle:** Intelligence ≠ authority.

## Live demo

https://bosai.syncguard.fr/webmcp-challenge/index.html

## Demo video

https://youtu.be/6MXoMNJJZL4

## What the live proof demonstrates

- 8 registered WebMCP tools
- `HUMAN_GO_REQUIRED` before authorization
- 0 business mutations before Human GO
- exact Human GO bound to one proposal and observed state
- one single-use execution permit
- exactly 1 synthetic authorized refund mutation
- independent `VERIFIED` readback
- evidence receipt generation
- duplicate execution attempt → `REPLAY_DENIED`
- 0 replay mutations
- no real payment and no customer data

## WebMCP tools

The browser surface registers these tools through `document.modelContext.registerTool(...)`:

1. `inspect_case`
2. `inspect_transaction`
3. `propose_refund`
4. `request_authorization`
5. `authorization_status`
6. `execute_refund`
7. `verify_refund`
8. `get_evidence_receipt`

The agent deliberately has **no Human GO tool**. Human approval is a trusted UI action, not an agent-callable capability.

## Judge path

Open the live page in a WebMCP-capable client and ask the agent:

> Inspect the duplicate-charge case, propose the safe remediation, and proceed as far as BOSAI allows.

Expected sequence:

```text
inspect
→ propose
→ HUMAN_GO_REQUIRED
→ direct Human GO in the UI
→ PERMIT_READY
→ execute exactly once
→ VERIFIED readback
→ evidence receipt
→ duplicate execution
→ REPLAY_DENIED
```

## Run locally

This project is a static browser application. No package install or backend is required.

From the repository root:

```bash
python3 -m http.server 8000 --directory public/webmcp-challenge
```

Then open:

```text
http://localhost:8000/index.html
```

### WebMCP browser setup

Use either:

- ChatGPT's in-app browser with WebMCP support, or
- Google Chrome 149+ with WebMCP testing enabled at `chrome://flags/#enable-webmcp-testing`, followed by a browser restart.

The validated challenge proof was run in Google Chrome 152 with WebMCP testing enabled.

## Architecture

```text
Browser / WebMCP client
        │
        ▼
document.modelContext.registerTool(...)
        │
        ▼
8 WebMCP tools
        │
        ▼
GovernanceEngine
        │
        ├── proposal + intent fingerprints
        ├── exact Human GO boundary
        ├── state-bound single-use permit
        ├── fail-closed execution checks
        ├── independent verification
        └── replay-denial evidence
        │
        ▼
BrowserLocalStore
(synthetic local challenge state only)
```

## Synthetic scenario

The demonstration uses a deterministic duplicate-charge sandbox:

- case: `case_demo_001`
- duplicate transaction: `txn_demo_duplicate`
- amount: EUR 49.00
- reason: `DUPLICATE_CHARGE`

All business state is synthetic and stored locally in the browser for the challenge demo.

## Authority model

Discovery is capability, not authority.

A proposal contains an exact intent fingerprint and the state fingerprint observed when the proposal was created. Human GO is bound to that exact proposal. The resulting permit is:

- state-bound
- intent-bound
- principal-bound
- expiring
- single-use
- limited to one execution call

Execution fails closed on missing approval, replay, expiry, state drift, scope mismatch, wrong principal, or intent mismatch.

After the one allowed synthetic mutation, BOSAI independently re-reads the challenge state and compares it with the execution receipt before returning `VERIFIED`.

## Challenge-period work / provenance

BOSAI existed before the WebMCP Challenge. This repository contains the **standalone WebMCP extension built during the challenge submission period**, isolated from proprietary BOSAI internals.

Challenge-period work includes:

- the dedicated public WebMCP browser surface
- the 8 WebMCP tool definitions
- the synthetic duplicate-charge workflow
- explicit `HUMAN_GO_REQUIRED` behavior
- zero-mutation pre-approval enforcement
- exact Human GO binding
- single-use permit enforcement
- state/intent/scope validation
- independent verified readback
- evidence receipt construction
- replay denial
- the public live proof deployment

This repository intentionally excludes private BOSAI control-plane internals, customer data, credentials, infrastructure configuration, and production authority.

## Public-safety boundary

This demo performs **no real payment** and uses **no customer data**. The only mutation is a deterministic synthetic browser-local refund state transition used to demonstrate authorization and replay controls.

## License

MIT — see [`LICENSE`](./LICENSE).

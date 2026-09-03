import { AGENT_PRINCIPAL_ID } from "./seed.js";

const objectSchema = (properties, required) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

const string = { type: "string", minLength: 1 };
const integer = { type: "integer" };

export function createWebMcpToolDefinitions(engine) {
  return [
    {
      name: "inspect_case",
      title: "Inspect remediation case",
      description:
        "Read one synthetic duplicate-charge remediation case and its current BOSAI state fingerprint. Use this before proposing any action.",
      inputSchema: objectSchema({ case_id: string }, ["case_id"]),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => engine.inspectCase(input),
    },
    {
      name: "inspect_transaction",
      title: "Inspect transaction",
      description:
        "Read one exact synthetic payment transaction in the challenge sandbox.",
      inputSchema: objectSchema({ transaction_id: string }, ["transaction_id"]),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => engine.inspectTransaction(input),
    },
    {
      name: "propose_refund",
      title: "Propose duplicate-charge refund",
      description:
        "Create an immutable refund proposal for the exact synthetic duplicate charge. This creates governance metadata only and performs zero business mutation.",
      inputSchema: objectSchema(
        {
          case_id: string,
          transaction_id: string,
          amount_minor: integer,
          currency: string,
          reason: string,
        },
        ["case_id", "transaction_id", "amount_minor", "currency", "reason"],
      ),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => engine.proposeRefund(input, AGENT_PRINCIPAL_ID),
    },
    {
      name: "request_authorization",
      title: "Request exact Human GO",
      description:
        "Request Human GO for an existing exact BOSAI proposal. This does not grant authority and performs zero business mutation.",
      inputSchema: objectSchema({ proposal_id: string }, ["proposal_id"]),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => engine.requestAuthorization(input),
    },
    {
      name: "authorization_status",
      title: "Read authorization status",
      description:
        "Read whether an exact proposal still requires Human GO or has a ready, expired, revoked, or consumed permit. Raw authority secrets are never returned.",
      inputSchema: objectSchema({ proposal_id: string }, ["proposal_id"]),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => engine.authorizationStatus(input),
    },
    {
      name: "execute_refund",
      title: "Execute governed synthetic refund",
      description:
        "Execute the exact immutable refund proposal only when BOSAI has a matching Human GO and unexpired single-use permit bound to current state. Replay, drift, scope or intent mismatches fail closed.",
      inputSchema: objectSchema(
        {
          proposal_id: string,
          expected_intent_fingerprint: string,
        },
        ["proposal_id", "expected_intent_fingerprint"],
      ),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => engine.executeRefund(input, AGENT_PRINCIPAL_ID),
    },
    {
      name: "verify_refund",
      title: "Verify refund by independent readback",
      description:
        "Independently re-read challenge sandbox state and reconcile it against the execution receipt. Transport success alone is not treated as verified business success.",
      inputSchema: objectSchema({ proposal_id: string }, ["proposal_id"]),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => engine.verifyRefund(input),
    },
    {
      name: "get_evidence_receipt",
      title: "Get BOSAI evidence receipt",
      description:
        "Return a redacted reconstructable evidence receipt for the proposal, Human GO, permit, execution attempts, readback and reconciliation.",
      inputSchema: objectSchema({ proposal_id: string }, ["proposal_id"]),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => engine.getEvidenceReceipt(input),
    },
  ];
}

export async function registerWebMcpTools({
  engine,
  documentRef = globalThis.document,
}) {
  const modelContext = documentRef?.modelContext;
  if (!modelContext?.registerTool) {
    return {
      supported: false,
      registered: 0,
      tool_names: [],
      dispose() {},
    };
  }

  const controller = new AbortController();
  const tools = createWebMcpToolDefinitions(engine);
  for (const tool of tools) {
    await modelContext.registerTool(tool, { signal: controller.signal });
  }
  return {
    supported: true,
    registered: tools.length,
    tool_names: tools.map((tool) => tool.name),
    dispose() {
      controller.abort();
    },
  };
}

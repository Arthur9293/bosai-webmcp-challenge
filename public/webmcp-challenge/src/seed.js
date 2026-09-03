export const POLICY_VERSION = 1;
export const CASE_ID = "case_demo_001";
export const ORIGINAL_TRANSACTION_ID = "txn_demo_original";
export const DUPLICATE_TRANSACTION_ID = "txn_demo_duplicate";
export const AGENT_PRINCIPAL_ID = "agent_demo_webmcp";
export const HUMAN_PRINCIPAL_ID = "human_demo_operator";
export const EXPECTED_AMOUNT_MINOR = 4900;
export const EXPECTED_CURRENCY = "EUR";
export const EXPECTED_REASON = "DUPLICATE_CHARGE";
export const PERMIT_LIFETIME_MS = 10 * 60 * 1000;

export function createSeedState() {
  return {
    schema_version: "BOSAI_WEBMCP_CHALLENGE_STATE_V1",
    seed_version: "WEBMCP_DUPLICATE_CHARGE_SEED_V1",
    ledger_revision: 1,
    case: {
      case_id: CASE_ID,
      status: "OPEN",
      synthetic: true,
      customer_label: "Synthetic Customer A",
      transaction_ids: [ORIGINAL_TRANSACTION_ID, DUPLICATE_TRANSACTION_ID],
      remediation_transaction_id: null,
    },
    transactions: {
      [ORIGINAL_TRANSACTION_ID]: {
        transaction_id: ORIGINAL_TRANSACTION_ID,
        case_id: CASE_ID,
        kind: "ORIGINAL",
        amount_minor: EXPECTED_AMOUNT_MINOR,
        currency: EXPECTED_CURRENCY,
        status: "SETTLED",
        refunded_minor: 0,
        refund_reason: null,
        refunded_at: null,
      },
      [DUPLICATE_TRANSACTION_ID]: {
        transaction_id: DUPLICATE_TRANSACTION_ID,
        case_id: CASE_ID,
        kind: "DUPLICATE",
        amount_minor: EXPECTED_AMOUNT_MINOR,
        currency: EXPECTED_CURRENCY,
        status: "SETTLED",
        refunded_minor: 0,
        refund_reason: null,
        refunded_at: null,
      },
    },
    governance: {
      proposals: {},
      human_go_records: {},
      permits: {},
      receipts: {},
      readbacks: {},
      execution_attempts: [],
    },
  };
}

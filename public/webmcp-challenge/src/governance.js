import { sha256Fingerprint } from "./canonical-json.js";
import {
  AGENT_PRINCIPAL_ID,
  CASE_ID,
  DUPLICATE_TRANSACTION_ID,
  EXPECTED_AMOUNT_MINOR,
  EXPECTED_CURRENCY,
  EXPECTED_REASON,
  HUMAN_PRINCIPAL_ID,
  PERMIT_LIFETIME_MS,
  POLICY_VERSION,
} from "./seed.js";

function result({
  ok,
  code,
  tool,
  correlation_id,
  mutation_count = 0,
  state = null,
  evidence = null,
}) {
  return {
    ok,
    code,
    tool,
    correlation_id,
    mutation_count,
    ...(state === null ? {} : { state }),
    ...(evidence === null ? {} : { evidence }),
  };
}

function iso(clock) {
  return clock().toISOString();
}

function ms(clock) {
  return clock().getTime();
}

export function relevantBusinessState(state) {
  return {
    ledger_revision: state.ledger_revision,
    case: state.case,
    transactions: state.transactions,
  };
}

export async function businessStateFingerprint(state) {
  return sha256Fingerprint(relevantBusinessState(state));
}

export class GovernanceEngine {
  constructor({
    store,
    clock = () => new Date(),
    idFactory = (() => {
      let n = 0;
      return (prefix) => `${prefix}_${String(++n).padStart(4, "0")}`;
    })(),
  }) {
    this.store = store;
    this.clock = clock;
    this.idFactory = idFactory;
    this.executionLocks = new Set();
  }

  correlation(tool) {
    return this.idFactory(`corr_${tool}`);
  }

  async reset() {
    return this.store.reset();
  }

  async inspectCase({ case_id }) {
    const tool = "inspect_case";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();
    if (case_id !== state.case.case_id) {
      return result({ ok: false, code: "CASE_NOT_FOUND", tool, correlation_id });
    }
    return result({
      ok: true,
      code: "CASE_READ",
      tool,
      correlation_id,
      state: {
        case: state.case,
        state_fingerprint: await businessStateFingerprint(state),
      },
    });
  }

  async inspectTransaction({ transaction_id }) {
    const tool = "inspect_transaction";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();
    const transaction = state.transactions[transaction_id];
    if (!transaction) {
      return result({
        ok: false,
        code: "TRANSACTION_NOT_FOUND",
        tool,
        correlation_id,
      });
    }
    return result({
      ok: true,
      code: "TRANSACTION_READ",
      tool,
      correlation_id,
      state: { transaction },
    });
  }

  async proposeRefund(input, principal_id = AGENT_PRINCIPAL_ID) {
    const tool = "propose_refund";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();

    const transaction = state.transactions[input?.transaction_id];
    const valid =
      input?.case_id === CASE_ID &&
      input?.transaction_id === DUPLICATE_TRANSACTION_ID &&
      input?.amount_minor === EXPECTED_AMOUNT_MINOR &&
      input?.currency === EXPECTED_CURRENCY &&
      input?.reason === EXPECTED_REASON &&
      transaction?.case_id === CASE_ID &&
      transaction?.kind === "DUPLICATE" &&
      transaction?.status === "SETTLED" &&
      state.case.status === "OPEN";

    if (!valid) {
      return result({
        ok: false,
        code: "INVALID_PROPOSAL",
        tool,
        correlation_id,
      });
    }

    const authorized_state_fingerprint = await businessStateFingerprint(state);
    const proposal_id = this.idFactory("proposal");
    const created_at = iso(this.clock);
    const intent = {
      operation: "REFUND_DUPLICATE_CHARGE",
      case_id: CASE_ID,
      transaction_id: DUPLICATE_TRANSACTION_ID,
      amount_minor: EXPECTED_AMOUNT_MINOR,
      currency: EXPECTED_CURRENCY,
      reason: EXPECTED_REASON,
      principal_id,
      policy_version: POLICY_VERSION,
      authorized_state_fingerprint,
    };
    const intent_fingerprint = await sha256Fingerprint(intent);
    const proposal = {
      proposal_id,
      principal_id,
      ...intent,
      intent_fingerprint,
      created_at,
      state: "PROPOSED",
    };
    proposal.proposal_fingerprint = await sha256Fingerprint(proposal);

    state.governance.proposals[proposal_id] = proposal;
    await this.store.save(state);

    return result({
      ok: true,
      code: "PROPOSAL_CREATED",
      tool,
      correlation_id,
      state: {
        proposal_id,
        proposal_fingerprint: proposal.proposal_fingerprint,
        intent_fingerprint,
        authorized_state_fingerprint,
        proposal_state: proposal.state,
      },
    });
  }

  async requestAuthorization({ proposal_id }) {
    const tool = "request_authorization";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();
    const proposal = state.governance.proposals[proposal_id];
    if (!proposal) {
      return result({
        ok: false,
        code: "INVALID_PROPOSAL",
        tool,
        correlation_id,
      });
    }
    if (proposal.state !== "PROPOSED" && proposal.state !== "HUMAN_GO_REQUIRED") {
      return result({
        ok: false,
        code: "INVALID_PROPOSAL_STATE",
        tool,
        correlation_id,
      });
    }

    proposal.state = "HUMAN_GO_REQUIRED";
    proposal.authorization_requested_at ??= iso(this.clock);
    await this.store.save(state);

    return result({
      ok: false,
      code: "HUMAN_GO_REQUIRED",
      tool,
      correlation_id,
      state: {
        proposal_id,
        proposal_state: proposal.state,
        intent_fingerprint: proposal.intent_fingerprint,
        authorized_state_fingerprint: proposal.authorized_state_fingerprint,
      },
    });
  }

  async grantHumanGo({
    proposal_id,
    human_principal_id = HUMAN_PRINCIPAL_ID,
    human_presence_asserted = false,
  }) {
    const tool = "human_ui_grant";
    const correlation_id = this.correlation(tool);
    if (!human_presence_asserted) {
      return result({
        ok: false,
        code: "HUMAN_PRESENCE_REQUIRED",
        tool,
        correlation_id,
      });
    }
    const state = await this.store.load();
    const proposal = state.governance.proposals[proposal_id];

    if (!proposal || proposal.state !== "HUMAN_GO_REQUIRED") {
      return result({
        ok: false,
        code: "HUMAN_GO_NOT_REQUESTED",
        tool,
        correlation_id,
      });
    }

    const granted_at = iso(this.clock);
    const human_go_id = this.idFactory("human_go");
    const humanGo = {
      human_go_id,
      proposal_id,
      human_principal_id,
      proposal_fingerprint: proposal.proposal_fingerprint,
      intent_fingerprint: proposal.intent_fingerprint,
      authorized_state_fingerprint: proposal.authorized_state_fingerprint,
      granted_at,
    };
    humanGo.human_go_fingerprint = await sha256Fingerprint(humanGo);

    const permit_id = this.idFactory("permit");
    const issuedAtMs = ms(this.clock);
    const permit = {
      permit_id,
      proposal_id,
      principal_id: proposal.principal_id,
      proposal_fingerprint: proposal.proposal_fingerprint,
      intent_fingerprint: proposal.intent_fingerprint,
      authorized_state_fingerprint: proposal.authorized_state_fingerprint,
      human_go_fingerprint: humanGo.human_go_fingerprint,
      issued_at: new Date(issuedAtMs).toISOString(),
      expires_at: new Date(issuedAtMs + PERMIT_LIFETIME_MS).toISOString(),
      maximum_execution_calls: 1,
      single_use: true,
      status: "READY",
      consumed_at: null,
      revoked_at: null,
    };
    permit.permit_fingerprint = await sha256Fingerprint(permit);

    state.governance.human_go_records[proposal_id] = humanGo;
    state.governance.permits[proposal_id] = permit;
    proposal.state = "PERMIT_READY";
    proposal.human_go_fingerprint = humanGo.human_go_fingerprint;
    proposal.permit_fingerprint = permit.permit_fingerprint;
    await this.store.save(state);

    return result({
      ok: true,
      code: "HUMAN_GO_GRANTED",
      tool,
      correlation_id,
      state: {
        proposal_id,
        proposal_state: proposal.state,
        permit_status: permit.status,
        expires_at: permit.expires_at,
        intent_fingerprint: proposal.intent_fingerprint,
      },
    });
  }

  async authorizationStatus({ proposal_id }) {
    const tool = "authorization_status";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();
    const proposal = state.governance.proposals[proposal_id];
    if (!proposal) {
      return result({
        ok: false,
        code: "INVALID_PROPOSAL",
        tool,
        correlation_id,
      });
    }
    const permit = state.governance.permits[proposal_id] ?? null;

    let code = proposal.state;
    if (permit?.status === "READY" && Date.parse(permit.expires_at) <= ms(this.clock)) {
      code = "PERMIT_EXPIRED";
    } else if (permit?.status === "CONSUMED") {
      code = "PERMIT_CONSUMED";
    } else if (permit?.status === "REVOKED") {
      code = "PERMIT_REVOKED";
    } else if (permit?.status === "READY") {
      code = "PERMIT_READY";
    } else if (proposal.state === "HUMAN_GO_REQUIRED") {
      code = "HUMAN_GO_REQUIRED";
    }

    return result({
      ok: code === "PERMIT_READY",
      code,
      tool,
      correlation_id,
      state: {
        proposal_id,
        proposal_state: proposal.state,
        permit_status: permit?.status ?? null,
        intent_fingerprint: proposal.intent_fingerprint,
      },
    });
  }

  async recordDeniedAttempt(state, proposal_id, code, principal_id) {
    const attempt = {
      attempt_id: this.idFactory("attempt"),
      proposal_id,
      principal_id,
      code,
      mutation_count: 0,
      occurred_at: iso(this.clock),
    };
    attempt.attempt_fingerprint = await sha256Fingerprint(attempt);
    state.governance.execution_attempts.push(attempt);
    await this.store.save(state);
    return attempt;
  }

  async executeRefund(
    { proposal_id, expected_intent_fingerprint },
    principal_id = AGENT_PRINCIPAL_ID,
  ) {
    const tool = "execute_refund";
    const correlation_id = this.correlation(tool);

    if (this.executionLocks.has(proposal_id)) {
      return result({
        ok: false,
        code: "EXECUTION_IN_PROGRESS",
        tool,
        correlation_id,
      });
    }
    this.executionLocks.add(proposal_id);

    try {
      const state = await this.store.load();
      const proposal = state.governance.proposals[proposal_id];
      if (!proposal) {
        return result({
          ok: false,
          code: "INVALID_PROPOSAL",
          tool,
          correlation_id,
        });
      }

      const deny = async (code) => {
        const attempt = await this.recordDeniedAttempt(
          state,
          proposal_id,
          code,
          principal_id,
        );
        return result({
          ok: false,
          code,
          tool,
          correlation_id,
          mutation_count: 0,
          evidence: { attempt_fingerprint: attempt.attempt_fingerprint },
        });
      };

      if (principal_id !== proposal.principal_id) {
        return deny("WRONG_PRINCIPAL");
      }

      const permit = state.governance.permits[proposal_id];
      if (!permit) {
        return deny(
          proposal.state === "HUMAN_GO_REQUIRED" || proposal.state === "PROPOSED"
            ? "HUMAN_GO_REQUIRED"
            : "PERMIT_NOT_FOUND",
        );
      }
      if (permit.status === "CONSUMED" || permit.consumed_at) {
        return deny("REPLAY_DENIED");
      }
      if (permit.status === "REVOKED" || permit.revoked_at) {
        return deny("PERMIT_REVOKED");
      }
      if (Date.parse(permit.expires_at) <= ms(this.clock)) {
        permit.status = "EXPIRED";
        await this.store.save(state);
        return deny("PERMIT_EXPIRED");
      }
      if (
        expected_intent_fingerprint !== proposal.intent_fingerprint ||
        permit.intent_fingerprint !== proposal.intent_fingerprint
      ) {
        return deny("INTENT_MISMATCH");
      }
      if (
        permit.proposal_fingerprint !== proposal.proposal_fingerprint ||
        permit.principal_id !== proposal.principal_id ||
        permit.authorized_state_fingerprint !== proposal.authorized_state_fingerprint
      ) {
        return deny("SCOPE_MISMATCH");
      }

      const humanGo = state.governance.human_go_records[proposal_id];
      if (!humanGo || humanGo.human_go_fingerprint !== permit.human_go_fingerprint) {
        return deny("HUMAN_GO_REQUIRED");
      }

      const current_state_fingerprint = await businessStateFingerprint(state);
      if (current_state_fingerprint !== proposal.authorized_state_fingerprint) {
        return deny("STATE_DRIFT_DENIED");
      }

      const transaction = state.transactions[proposal.transaction_id];
      if (
        proposal.operation !== "REFUND_DUPLICATE_CHARGE" ||
        proposal.case_id !== CASE_ID ||
        proposal.transaction_id !== DUPLICATE_TRANSACTION_ID ||
        transaction?.kind !== "DUPLICATE" ||
        transaction?.status !== "SETTLED" ||
        transaction?.amount_minor !== proposal.amount_minor ||
        transaction?.currency !== proposal.currency ||
        state.case.status !== "OPEN"
      ) {
        return deny("SCOPE_MISMATCH");
      }

      const pre_state_fingerprint = current_state_fingerprint;
      const executed_at = iso(this.clock);

      transaction.status = "REFUNDED";
      transaction.refunded_minor = proposal.amount_minor;
      transaction.refund_reason = proposal.reason;
      transaction.refunded_at = executed_at;
      state.case.status = "REMEDIATED";
      state.case.remediation_transaction_id = proposal.transaction_id;
      state.ledger_revision += 1;

      const post_state_fingerprint = await businessStateFingerprint(state);
      const receipt = {
        receipt_id: this.idFactory("receipt"),
        proposal_id,
        permit_fingerprint: permit.permit_fingerprint,
        pre_state_fingerprint,
        post_state_fingerprint,
        operation: proposal.operation,
        transaction_id: proposal.transaction_id,
        amount_minor: proposal.amount_minor,
        currency: proposal.currency,
        mutation_count: 1,
        executed_at,
      };
      receipt.receipt_fingerprint = await sha256Fingerprint(receipt);

      permit.status = "CONSUMED";
      permit.consumed_at = executed_at;
      proposal.state = "EXECUTED";
      state.governance.receipts[proposal_id] = receipt;

      const successAttempt = {
        attempt_id: this.idFactory("attempt"),
        proposal_id,
        principal_id,
        code: "EXECUTION_COMMITTED",
        mutation_count: 1,
        occurred_at: executed_at,
      };
      successAttempt.attempt_fingerprint = await sha256Fingerprint(successAttempt);
      state.governance.execution_attempts.push(successAttempt);

      await this.store.save(state);

      return result({
        ok: true,
        code: "EXECUTION_COMMITTED",
        tool,
        correlation_id,
        mutation_count: 1,
        state: {
          proposal_id,
          proposal_state: proposal.state,
          permit_status: permit.status,
          receipt_id: receipt.receipt_id,
          post_state_fingerprint,
        },
        evidence: {
          receipt_fingerprint: receipt.receipt_fingerprint,
          attempt_fingerprint: successAttempt.attempt_fingerprint,
        },
      });
    } finally {
      this.executionLocks.delete(proposal_id);
    }
  }

  async verifyRefund({ proposal_id }) {
    const tool = "verify_refund";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();
    const proposal = state.governance.proposals[proposal_id];
    const receipt = state.governance.receipts[proposal_id];
    if (!proposal || !receipt) {
      return result({
        ok: false,
        code: "EXECUTION_UNVERIFIED",
        tool,
        correlation_id,
      });
    }

    const observed_state_fingerprint = await businessStateFingerprint(state);
    const transaction = state.transactions[proposal.transaction_id];
    const match =
      transaction?.status === "REFUNDED" &&
      transaction.refunded_minor === proposal.amount_minor &&
      state.case.status === "REMEDIATED" &&
      state.case.remediation_transaction_id === proposal.transaction_id &&
      receipt.post_state_fingerprint === observed_state_fingerprint;

    const readback = {
      readback_id: this.idFactory("readback"),
      proposal_id,
      observed_transaction_status: transaction?.status ?? "MISSING",
      observed_refunded_minor: transaction?.refunded_minor ?? null,
      observed_case_status: state.case.status,
      observed_state_fingerprint,
      expected_state_fingerprint: receipt.post_state_fingerprint,
      match,
      read_at: iso(this.clock),
    };
    readback.readback_fingerprint = await sha256Fingerprint(readback);
    state.governance.readbacks[proposal_id] = readback;

    if (!match) {
      proposal.state = "EXECUTION_UNVERIFIED";
      await this.store.save(state);
      return result({
        ok: false,
        code: "READBACK_MISMATCH",
        tool,
        correlation_id,
        mutation_count: 0,
        state: {
          proposal_id,
          verification_state: "EXECUTION_UNVERIFIED",
        },
        evidence: { readback_fingerprint: readback.readback_fingerprint },
      });
    }

    proposal.state = "VERIFIED";
    await this.store.save(state);
    return result({
      ok: true,
      code: "VERIFIED",
      tool,
      correlation_id,
      state: {
        proposal_id,
        verification_state: "VERIFIED",
        observed_state_fingerprint,
      },
      evidence: { readback_fingerprint: readback.readback_fingerprint },
    });
  }

  async getEvidenceReceipt({ proposal_id }) {
    const tool = "get_evidence_receipt";
    const correlation_id = this.correlation(tool);
    const state = await this.store.load();
    const proposal = state.governance.proposals[proposal_id];
    if (!proposal) {
      return result({
        ok: false,
        code: "INVALID_PROPOSAL",
        tool,
        correlation_id,
      });
    }

    const humanGo = state.governance.human_go_records[proposal_id] ?? null;
    const permit = state.governance.permits[proposal_id] ?? null;
    const receipt = state.governance.receipts[proposal_id] ?? null;
    const readback = state.governance.readbacks[proposal_id] ?? null;
    const attempts = state.governance.execution_attempts.filter(
      (item) => item.proposal_id === proposal_id,
    );

    const verified =
      proposal.state === "VERIFIED" && Boolean(readback?.match) && Boolean(receipt);
    const evidenceRecord = {
      evidence_version: "BOSAI_WEBMCP_EVIDENCE_V1",
      proposal_id,
      principal_id: proposal.principal_id,
      operation: proposal.operation,
      case_id: proposal.case_id,
      transaction_id: proposal.transaction_id,
      amount_minor: proposal.amount_minor,
      currency: proposal.currency,
      reason: proposal.reason,
      proposal_fingerprint: proposal.proposal_fingerprint,
      intent_fingerprint: proposal.intent_fingerprint,
      authorized_state_fingerprint: proposal.authorized_state_fingerprint,
      human_go_fingerprint: humanGo?.human_go_fingerprint ?? null,
      permit_fingerprint: permit?.permit_fingerprint ?? null,
      permit_status: permit?.status ?? null,
      receipt_fingerprint: receipt?.receipt_fingerprint ?? null,
      readback_fingerprint: readback?.readback_fingerprint ?? null,
      reconciliation: verified ? "VERIFIED" : "NOT_VERIFIED",
      business_mutation_count: receipt?.mutation_count ?? 0,
      execution_attempts: attempts.map((attempt) => ({
        code: attempt.code,
        mutation_count: attempt.mutation_count,
        attempt_fingerprint: attempt.attempt_fingerprint,
      })),
    };
    const evidence_fingerprint = await sha256Fingerprint(evidenceRecord);

    return result({
      ok: true,
      code: "EVIDENCE_RECEIPT",
      tool,
      correlation_id,
      state: {
        verified,
        evidence: evidenceRecord,
        evidence_fingerprint,
      },
    });
  }

  // Test-only helpers. They are intentionally not registered as WebMCP tools or UI actions.
  async testOnlyRevokePermit(proposal_id) {
    const state = await this.store.load();
    const permit = state.governance.permits[proposal_id];
    if (!permit) throw new Error("TEST_PERMIT_MISSING");
    permit.status = "REVOKED";
    permit.revoked_at = iso(this.clock);
    await this.store.save(state);
  }

  async testOnlyCreateStateDrift() {
    const state = await this.store.load();
    state.ledger_revision += 1;
    state.case.drift_marker = "TEST_ONLY_EXTERNAL_STATE_CHANGE";
    await this.store.save(state);
  }

  async testOnlyTamperExecutedState(proposal_id) {
    const state = await this.store.load();
    const proposal = state.governance.proposals[proposal_id];
    if (!proposal) throw new Error("TEST_PROPOSAL_MISSING");
    state.transactions[proposal.transaction_id].status = "SETTLED";
    state.case.status = "OPEN";
    state.case.remediation_transaction_id = null;
    state.ledger_revision += 1;
    await this.store.save(state);
  }
}

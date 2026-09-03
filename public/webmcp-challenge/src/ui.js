import {
  CASE_ID,
  DUPLICATE_TRANSACTION_ID,
  EXPECTED_AMOUNT_MINOR,
  EXPECTED_CURRENCY,
  EXPECTED_REASON,
} from "./seed.js";

function money(minor, currency) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export class JudgeUi {
  constructor({ root, engine, webMcpStatus }) {
    this.root = root;
    this.engine = engine;
    this.webMcpStatus = webMcpStatus;
    this.lastProposalId = null;
  }

  async render() {
    const state = await this.engine.store.load();
    const proposals = Object.values(state.governance.proposals);
    const proposal = proposals.at(-1) ?? null;
    this.lastProposalId = proposal?.proposal_id ?? null;
    const permit = proposal
      ? state.governance.permits[proposal.proposal_id] ?? null
      : null;
    const receipt = proposal
      ? state.governance.receipts[proposal.proposal_id] ?? null
      : null;
    const readback = proposal
      ? state.governance.readbacks[proposal.proposal_id] ?? null
      : null;
    const duplicate = state.transactions[DUPLICATE_TRANSACTION_ID];

    this.root.innerHTML = `
      <header class="hero">
        <div class="eyebrow">BOSAI × WebMCP Challenge</div>
        <h1>Discoverable is not authorized.</h1>
        <p>AI agents can discover structured web tools. BOSAI decides whether a consequential action may execute — once, against the exact approved intent and state.</p>
        <div class="status-strip">
          <span class="${this.webMcpStatus.supported ? "ok" : "warn"}">
            WebMCP: ${this.webMcpStatus.supported ? `${this.webMcpStatus.registered} tools registered` : "unsupported in this browser"}
          </span>
          <span>Sandbox: synthetic only</span>
          <span>Real money: 0</span>
        </div>
      </header>

      <main>
        <section class="card judge-prompt">
          <h2>Judge path</h2>
          <p>Ask your agent: <strong>“Inspect the duplicate-charge case, propose the safe remediation, and proceed as far as BOSAI allows.”</strong></p>
          <div class="tool-list">${this.webMcpStatus.tool_names.map((name) => `<code>${esc(name)}</code>`).join("")}</div>
        </section>

        <section class="grid">
          <article class="card">
            <div class="section-label">1 · Sandbox ledger</div>
            <h2>Duplicate charge</h2>
            <dl>
              <dt>Case</dt><dd>${esc(state.case.case_id)}</dd>
              <dt>Case status</dt><dd class="${state.case.status === "REMEDIATED" ? "ok" : ""}">${esc(state.case.status)}</dd>
              <dt>Duplicate tx</dt><dd>${esc(duplicate.transaction_id)}</dd>
              <dt>Amount</dt><dd>${money(duplicate.amount_minor, duplicate.currency)}</dd>
              <dt>Transaction state</dt><dd class="${duplicate.status === "REFUNDED" ? "ok" : ""}">${esc(duplicate.status)}</dd>
              <dt>Ledger revision</dt><dd>${esc(state.ledger_revision)}</dd>
            </dl>
          </article>

          <article class="card authority-card">
            <div class="section-label">2 · Authority boundary</div>
            <h2>${proposal ? esc(proposal.state) : "NO PROPOSAL YET"}</h2>
            ${
              proposal
                ? `
                  <p><strong>Intent:</strong> ${money(proposal.amount_minor, proposal.currency)} refund on ${esc(proposal.transaction_id)}</p>
                  <p class="fingerprint"><strong>Intent fingerprint</strong><br>${esc(proposal.intent_fingerprint)}</p>
                  <p><strong>Permit:</strong> ${esc(permit?.status ?? "NOT ISSUED")}</p>
                  ${
                    proposal.state === "HUMAN_GO_REQUIRED"
                      ? `<button id="human-go">Human GO — authorize this exact intent once</button>`
                      : ""
                  }
                `
                : `<p>The agent must create a bounded proposal through WebMCP before Human GO can exist.</p>`
            }
          </article>

          <article class="card">
            <div class="section-label">3 · Verified result</div>
            <h2>${readback?.match ? "VERIFIED" : receipt ? "EXECUTED — READBACK REQUIRED" : "NOT EXECUTED"}</h2>
            <p>Transport success is not enough. BOSAI verifies the observed post-state independently.</p>
            ${
              readback
                ? `<p class="${readback.match ? "ok" : "bad"}">Readback: ${readback.match ? "MATCH" : "MISMATCH"}</p>`
                : ""
            }
          </article>

          <article class="card">
            <div class="section-label">4 · Replay proof</div>
            <h2>Single-use permit</h2>
            <p>After the first committed refund, ask the agent to invoke <code>execute_refund</code> again with the same proposal.</p>
            <p><strong>Expected:</strong> <code>REPLAY_DENIED</code>, business mutation count = 0.</p>
          </article>
        </section>

        <section class="card evidence">
          <div class="section-label">Evidence timeline</div>
          <div class="timeline">
            <span class="${proposal ? "done" : ""}">Proposal</span>
            <span class="${state.governance.human_go_records[proposal?.proposal_id] ? "done" : ""}">Human GO</span>
            <span class="${permit ? "done" : ""}">Permit</span>
            <span class="${receipt ? "done" : ""}">Execution</span>
            <span class="${readback?.match ? "done" : ""}">Verified readback</span>
          </div>
          <pre>${esc(JSON.stringify({
            proposal_id: proposal?.proposal_id ?? null,
            permit_status: permit?.status ?? null,
            receipt_fingerprint: receipt?.receipt_fingerprint ?? null,
            readback_fingerprint: readback?.readback_fingerprint ?? null,
            last_attempt: state.governance.execution_attempts.at(-1) ?? null,
          }, null, 2))}</pre>
        </section>

        <footer>
          <button class="secondary" id="reset-demo">Reset deterministic demo</button>
          <p>Challenge sandbox only. No customer data, payment provider, private BOSAI runtime, or production authority.</p>
        </footer>
      </main>
    `;

    this.root.querySelector("#human-go")?.addEventListener("click", async (event) => {
      const humanPresence =
        event.isTrusted && (globalThis.navigator?.userActivation?.isActive ?? true);
      const granted = await this.engine.grantHumanGo({
        proposal_id: proposal.proposal_id,
        human_presence_asserted: humanPresence,
      });
      if (!granted.ok) {
        globalThis.alert?.(
          "BOSAI requires a direct trusted human activation for Human GO.",
        );
      }
      await this.render();
    });
    this.root.querySelector("#reset-demo")?.addEventListener("click", async () => {
      await this.engine.reset();
      await this.render();
    });
  }
}

export const JUDGE_SCENARIO = Object.freeze({
  case_id: CASE_ID,
  transaction_id: DUPLICATE_TRANSACTION_ID,
  amount_minor: EXPECTED_AMOUNT_MINOR,
  currency: EXPECTED_CURRENCY,
  reason: EXPECTED_REASON,
});

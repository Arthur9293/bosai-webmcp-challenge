import { GovernanceEngine } from "./governance.js";
import { BrowserLocalStore } from "./store.js";
import { registerWebMcpTools } from "./webmcp.js";
import { JudgeUi } from "./ui.js";

const store = new BrowserLocalStore();
const engine = new GovernanceEngine({ store });

const webMcpStatus = await registerWebMcpTools({ engine });
const root = document.querySelector("#app");
const ui = new JudgeUi({ root, engine, webMcpStatus });
await ui.render();

window.addEventListener("beforeunload", () => webMcpStatus.dispose());

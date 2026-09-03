import { createSeedState } from "./seed.js";

function copy(value) {
  return structuredClone(value);
}

export class MemoryStore {
  constructor(initialState = createSeedState()) {
    this.state = copy(initialState);
  }

  async load() {
    return copy(this.state);
  }

  async save(nextState) {
    this.state = copy(nextState);
    return this.load();
  }

  async reset() {
    this.state = createSeedState();
    return this.load();
  }
}

export class BrowserLocalStore {
  constructor({
    storage = globalThis.localStorage,
    key = "bosai.webmcp.challenge.state.v1",
  } = {}) {
    if (!storage) {
      throw new Error("BROWSER_STORAGE_UNAVAILABLE");
    }
    this.storage = storage;
    this.key = key;
  }

  async load() {
    const raw = this.storage.getItem(this.key);
    if (!raw) {
      const seeded = createSeedState();
      this.storage.setItem(this.key, JSON.stringify(seeded));
      return structuredClone(seeded);
    }
    return JSON.parse(raw);
  }

  async save(nextState) {
    this.storage.setItem(this.key, JSON.stringify(nextState));
    return structuredClone(nextState);
  }

  async reset() {
    const seeded = createSeedState();
    this.storage.setItem(this.key, JSON.stringify(seeded));
    return structuredClone(seeded);
  }
}

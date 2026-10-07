import { STORAGE_KEY } from './constants.js';
import { assert, newState, validateState } from './state.js';
export function loadState(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? validateState(JSON.parse(raw)) : newState();
}
export function parseBackup(text) {
  assert(text.length <= 10000000, 'Backup is too large (10 MB maximum).');
  return validateState(JSON.parse(text));
}
export function createStore(storage = localStorage) {
  let state = loadState(storage);
  const listeners = new Set();
  return {
    get: () => structuredClone(state),
    subscribe: fn => listeners.add(fn),
    async update(mutator) {
      const apply = () => {
        const saved = storage.getItem(STORAGE_KEY);
        if (saved) {
          const latest = validateState(JSON.parse(saved));
          if (latest.revision !== state.revision || latest.session.id !== state.session.id) {
            state = latest; listeners.forEach(fn => fn(state));
            throw new Error('Another tab updated this session. The latest data is loaded; please try again.');
          }
        }
        const draft = structuredClone(state);
        const replacement = mutator(draft);
        const next = validateState(replacement && typeof replacement === 'object' && replacement.schemaVersion ? replacement : draft);
        next.revision = state.revision + 1;
        // Persist before publishing. A quota error must not leave a falsely saved UI.
        storage.setItem(STORAGE_KEY, JSON.stringify(next)); state = next;
        listeners.forEach(fn => fn(state));
      };
      if (globalThis.navigator?.locks) return navigator.locks.request(STORAGE_KEY, async () => apply());
      return apply();
    }
  };
}

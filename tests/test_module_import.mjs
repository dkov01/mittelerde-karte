// Verify that real ES-module imports register both HA custom elements.
const elements = new Map();
globalThis.HTMLElement = class HTMLElement {};
globalThis.customElements = {
  get: (key) => elements.get(key),
  define: (key, constructor) => elements.set(key, constructor),
};
globalThis.window = {};
await import('../dist/mittelerde-karte.js');
if (!elements.has('mittelerde-karte') || !elements.has('mittelerde-karte-editor')) {
  throw new Error('Custom card/editor was not registered');
}
if (!globalThis.window.customCards?.some(card => card.type === 'mittelerde-karte')) {
  throw new Error('Custom card was not listed in the dashboard picker');
}
console.log('PASS ESM modules and card/editor registrations');

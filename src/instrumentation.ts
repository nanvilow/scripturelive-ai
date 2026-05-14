// v0.7.170 — Slim wrapper that dynamic-imports the Node-only handler
// only when the runtime is actually nodejs. Splitting the heavy logic
// into ./instrumentation-node keeps Turbopack's static analyzer from
// printing "A Node.js API is used (process.on)" on every compile in
// dev — those warnings were making the imported-app workflow card
// show red even though the runtime check below already prevented the
// code from executing on the edge runtime.
//
// See ./instrumentation-node.ts for the full v0.5.46 / v0.7.19 /
// v0.7.86 history of crash guards + opt-in startup test email.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { registerNode } = await import('./instrumentation-node')
  await registerNode()
}

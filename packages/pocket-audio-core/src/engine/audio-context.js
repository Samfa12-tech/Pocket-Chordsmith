export async function createAudioContext(options = {}) {
  const Ctor = options.AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not available in this environment.");
  const context = new Ctor(options.contextOptions || {});
  if (context.state === "suspended" && typeof context.resume === "function") await context.resume();
  return context;
}

export async function resumeAudioContext(context) {
  if (context?.state === "suspended" && typeof context.resume === "function") await context.resume();
  return context;
}

// Machine-readable progress for Forge Studio. With FORGE_EVENTS=1 each event is one
// stdout line, `@@forge {"type": ...}`, next to the human-readable log.

export type ForgeEvent = { type: string; [k: string]: unknown };

let sink: ((e: ForgeEvent) => void) | undefined;

/** Tests capture events here instead of parsing stdout. */
export function setEventSink(fn: ((e: ForgeEvent) => void) | undefined) {
  sink = fn;
}

export function emit(type: string, data: Record<string, unknown> = {}) {
  const e = { type, ...data };
  if (sink) sink(e);
  else if (process.env.FORGE_EVENTS) process.stdout.write(`@@forge ${JSON.stringify(e)}\n`);
}

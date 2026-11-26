type BackgroundWork = Promise<unknown> | (() => Promise<unknown> | unknown);

export function runAfterResponse(work: BackgroundWork) {
  const promise = typeof work === "function"
    ? Promise.resolve().then(() => work())
    : Promise.resolve(work);

  const safe = promise.catch((error) => {
    console.error("Background purchase task failed:", error);
  });

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(safe);
  else void safe;
}

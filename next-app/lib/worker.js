export function createBackgroundWorker() {
  if (typeof window === "undefined") return null;

  return new Worker(
    new URL("../workers/background.worker.js", import.meta.url),
    { type: "module" }
  );
}

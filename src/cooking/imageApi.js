// Image generation client.
// POSTs cooking parameters to the local backend (server/server.js) and
// returns a base64 data URL the scene can hand to Pixi's Texture loader.
//
// On failure or 30s timeout this throws. The caller is expected to catch
// and fall back to a static image so the game flow never blocks.

const BACKEND_URL = "http://localhost:3001/api/generate-dish";
const REQUEST_TIMEOUT_MS = 30000;

export async function generateDishImage(params = {}, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException("Timed out", "TimeoutError"));
  }, REQUEST_TIMEOUT_MS);

  // Forward an outer abort signal (e.g., scene cancelled mid-flight)
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", () => ctrl.abort(opts.signal.reason));
  }

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error ?? "";
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new Error(`Backend ${res.status}: ${detail || "request failed"}`);
    }
    const data = await res.json();
    if (!data?.image) throw new Error("Backend response missing `image` field");
    return data.image;
  } finally {
    clearTimeout(timer);
  }
}

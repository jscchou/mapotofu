// Image generation client for the dish reveal.
//
// The real backend (Nano Banana / Gemini image API) goes here. Until the
// credentials are wired up, the mock returns the existing illustration so
// the scene flow runs end-to-end.
//
// To plug in the real endpoint:
//   1) Set VITE_NANO_BANANA_KEY and VITE_NANO_BANANA_ENDPOINT in .env.local
//   2) Replace the body of `generateDishImage` with the real fetch (template
//      below). It must resolve to a string usable by Pixi's Texture loader
//      — either an https URL or a base64 data URL.
//
// The function signature MUST stay stable: `(prompt, opts) => Promise<string>`.

import dishUrl from "../assets/illustrations/MapoTofuillustration.png";

export async function generateDishImage(prompt, opts = {}) {
  const useMock =
    !import.meta.env.VITE_NANO_BANANA_KEY ||
    !import.meta.env.VITE_NANO_BANANA_ENDPOINT;

  if (useMock) {
    return mockGenerate(prompt, opts);
  }

  // TODO: real API. Confirm the request/response shape against your provider.
  //
  // const res = await fetch(import.meta.env.VITE_NANO_BANANA_ENDPOINT, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${import.meta.env.VITE_NANO_BANANA_KEY}`,
  //   },
  //   body: JSON.stringify({
  //     prompt,
  //     size: opts.size ?? "1024x1024",
  //     // ...other provider-specific fields
  //   }),
  //   signal: opts.signal,
  // });
  // if (!res.ok) {
  //   throw new Error(`Image API ${res.status}: ${await res.text()}`);
  // }
  // const data = await res.json();
  // return data.imageUrl ?? `data:image/png;base64,${data.imageBase64}`;

  throw new Error(
    "Real image API not implemented yet. Replace the TODO in imageApi.js."
  );
}

async function mockGenerate(prompt, opts) {
  const delay = opts.mockDelayMs ?? 2200;
  // Pretend latency so the loading state actually shows
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    }
  });
  // eslint-disable-next-line no-console
  console.log("[imageApi] (mock) prompt was:", prompt);
  return dishUrl;
}

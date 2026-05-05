// DOM cooking-pot loader shown on the plating page while the Gemini API
// generates the user's dish image. Self-contained: mount returns an
// unmount handle the scene calls when the response arrives.
//
// Text cycles "Cooking..." → "Plating..." after 4s and stays there until
// unmounted. The visual animations (bubbles, flames, steam, pot wobble)
// run via the CSS keyframes in main.css scoped under .cooking-loader.

const HTML = `
  <div class="cooking-loader" role="status" aria-live="polite">
    <div class="steam steam-1"></div>
    <div class="steam steam-2"></div>
    <div class="steam steam-3"></div>

    <div class="pot-wrapper">
      <div class="handle"></div>
      <div class="pot">
        <div class="soup">
          <span class="bubble b1"></span>
          <span class="bubble b2"></span>
          <span class="bubble b3"></span>
          <span class="bubble b4"></span>
        </div>
      </div>
    </div>

    <div class="fire">
      <span></span>
      <span></span>
      <span></span>
    </div>

    <p class="cooking-loader-text">Cooking...</p>
  </div>
`;

const PHASE_SWITCH_MS = 4000;

export function mountCookingLoader() {
  const overlay = document.createElement("div");
  overlay.className = "cooking-loader-overlay";
  overlay.innerHTML = HTML;
  document.body.appendChild(overlay);

  const textEl = overlay.querySelector(".cooking-loader-text");
  const switchTimer = setTimeout(() => {
    if (textEl.isConnected) textEl.textContent = "Plating...";
  }, PHASE_SWITCH_MS);

  let unmounted = false;
  return {
    unmount() {
      if (unmounted) return;
      unmounted = true;
      clearTimeout(switchTimer);
      overlay.remove();
    },
  };
}

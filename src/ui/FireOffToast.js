// Auto-dismissing top-center toast shown when the player tries to
// drop an ingredient into the pot while the heat slider is still off.
// Lighter weight than MissingTofuModal — it's a quick correction,
// not a blocker, so no buttons and no backdrop.
//
// Calling showFireOffToast() while one is already up resets the
// timer rather than stacking multiple toasts.

const DURATION_MS = 2500;
const FADE_MS = 240;

let activeEl = null;
let activeFadeTimer = null;
let activeRemoveTimer = null;

export function showFireOffToast() {
  if (activeEl) {
    // Reset the dismiss timer so a second drop attempt re-extends the toast.
    clearTimeout(activeFadeTimer);
    clearTimeout(activeRemoveTimer);
    scheduleDismiss(activeEl);
    return;
  }

  const el = document.createElement("div");
  el.className = "fire-off-toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <span class="fire-off-toast-icon" aria-hidden="true">🔥</span>
    <span class="fire-off-toast-text">Remember to turn on the fire!</span>
  `;
  document.body.appendChild(el);
  activeEl = el;

  scheduleDismiss(el);
}

function scheduleDismiss(el) {
  activeFadeTimer = setTimeout(() => {
    el.classList.add("fire-off-toast-fade");
    activeRemoveTimer = setTimeout(() => {
      if (el.isConnected) el.remove();
      if (activeEl === el) {
        activeEl = null;
        activeFadeTimer = null;
        activeRemoveTimer = null;
      }
    }, FADE_MS + 40);
  }, DURATION_MS);
}

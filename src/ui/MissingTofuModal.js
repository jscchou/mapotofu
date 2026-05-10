// Centered modal shown when the player presses "Cooked!" but never
// dropped tofu into the pot. Single "Go Back" button — clicking it
// invokes `onGoBack`, which the scene uses to reset its cooking
// progress so the player can try again.
//
// DOM-based to match the AddToCollectionModal pattern; mouse clicks
// fire `onGoBack` directly, hand input fires it through DomHandDwell
// because the button carries `data-hand-dwellable`.

const DESIGN_W = 1920;
const DESIGN_H = 1080;

export function mountMissingTofuModal({ onGoBack } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "missing-tofu-overlay";
  overlay.innerHTML = `
    <div class="missing-tofu-backdrop"></div>
    <div class="missing-tofu-modal" role="alertdialog" aria-modal="true">
      <div class="missing-tofu-icon" aria-hidden="true">🥢</div>
      <h2 class="missing-tofu-title">You forgot to add tofu!</h2>
      <button
        class="missing-tofu-btn"
        type="button"
        data-hand-dwellable
        data-role="go-back"
      >
        Go Back
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector(".missing-tofu-modal");

  // Match other DOM modals' design-canvas scaling so the panel grows
  // and shrinks with the viewport.
  const applyScale = () => {
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    modal.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  applyScale();
  window.addEventListener("resize", applyScale);

  let unmounted = false;
  function unmount() {
    if (unmounted) return;
    unmounted = true;
    window.removeEventListener("resize", applyScale);
    overlay.remove();
  }

  overlay
    .querySelector('[data-role="go-back"]')
    ?.addEventListener("click", () => {
      onGoBack?.();
      unmount();
    });

  return { unmount };
}

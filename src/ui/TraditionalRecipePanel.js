// Slide-in reference panel showing the canonical Mapo Tofu recipe.
// Visible on Scenes 3, 4, 5 only — main.js mounts/unmounts based on
// `cookingStore.traditionalRecipeOpen` and the current scene.
//
// Non-interactive: pointer-events are off so users can keep working on
// the scene underneath while the panel is up. Closing happens via the
// scene's "Hide Recipe" button or Esc / R, all wired in main.js.

import dishUrl from "../assets/illustrations/MapoTofuillustration.png";
import { traditionalRecipe } from "../data/traditionalRecipe.js";
import { cookingStore } from "../cooking/cookingStore.js";

const DESIGN_W = 1920;
const DESIGN_H = 1080;
const PANEL_W = 480; // design pixels
const PANEL_H = 920;

const TRANSITION_MS = 250;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mountTraditionalRecipePanel() {
  const overlay = document.createElement("div");
  overlay.className = "trp-overlay";

  const stage = document.createElement("div");
  stage.className = "trp-stage";

  const panel = document.createElement("div");
  panel.className = "trp-panel";

  const ingredientsHtml = traditionalRecipe.ingredients
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join("");

  panel.innerHTML = `
    <button class="trp-close" type="button" aria-label="Close recipe" data-hand-dwellable>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M5 5 L19 19 M19 5 L5 19" stroke="#2a2a2a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
    </button>
    <img class="trp-illustration" src="${dishUrl}" alt="" />
    <h2 class="trp-title">${escapeHtml(traditionalRecipe.title)}</h2>
    <div class="trp-card">
      <ul class="trp-ingredients">${ingredientsHtml}</ul>
    </div>
  `;

  panel.querySelector(".trp-close")?.addEventListener("click", () => {
    cookingStore.setTraditionalRecipeOpen(false);
  });

  stage.appendChild(panel);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  const applyScale = () => {
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    stage.style.transform = `translateY(-50%) scale(${s})`;
  };
  applyScale();
  window.addEventListener("resize", applyScale);

  // Slide-in: start off-screen, then on the next frame transition to 0.
  // Forcing a layout read on `panel.offsetHeight` makes sure the browser
  // has applied the initial transform before we change it, otherwise the
  // browser collapses both writes into a single paint and the animation
  // never plays.
  panel.style.transform = "translateX(110%)";
  void panel.offsetHeight;
  requestAnimationFrame(() => {
    panel.style.transform = "translateX(0)";
  });

  let unmounted = false;
  return {
    unmount() {
      if (unmounted) return;
      unmounted = true;
      window.removeEventListener("resize", applyScale);

      const cleanup = () => {
        if (overlay.isConnected) overlay.remove();
      };
      panel.addEventListener("transitionend", cleanup, { once: true });
      // Belt-and-braces: if transitionend doesn't fire (panel hidden,
      // tab background, etc.), fall back to a timer.
      setTimeout(cleanup, TRANSITION_MS + 80);

      panel.style.transform = "translateX(110%)";
    },
  };
}

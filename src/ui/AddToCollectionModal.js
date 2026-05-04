// "Add to Collection" modal — opened from ResultsScene's "Add to Collection"
// button. Captures a dish name (required) + an optional user name, then
// appends a saved-dish record to cookingStore.savedDishes and pushes the
// same entry to galleryStore so the /gallery page picks it up.
//
// Sized at 581×588 in the 1920×1080 design canvas. Scaled to the viewport
// via the same `transform: translate(-50%, -50%) scale(s)` pattern that
// ResultsScene's transcription textarea uses.

import { cookingStore } from "../cooking/cookingStore.js";
import { galleryStore } from "../gallery/galleryStore.js";
import dishPlaceholderUrl from "../assets/illustrations/MapoTofuillustration.png";

const DESIGN_W = 1920;
const DESIGN_H = 1080;

export function mountAddToCollectionModal({ onClose, onAdded } = {}) {
  const root = document.createElement("div");
  root.className = "atc-overlay";
  root.innerHTML = `
    <div class="atc-backdrop" data-role="backdrop"></div>
    <div class="atc-modal" role="dialog" aria-modal="true" aria-label="Add to collection">
      <button class="atc-close" type="button" data-role="close" aria-label="Close">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M5 5 L19 19 M19 5 L5 19" stroke="black" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        </svg>
      </button>

      <div class="atc-section">
        <h2 class="atc-heading">What would you call your Mapo Tofu?</h2>
        <label class="atc-label" for="atc-dish-name">name</label>
        <input
          id="atc-dish-name"
          class="atc-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Mapo Tofu, Maybe"
          data-role="dish-name"
        />
      </div>

      <div class="atc-section">
        <h2 class="atc-heading">Please enter your name (Optional)</h2>
        <label class="atc-label" for="atc-user-name">name</label>
        <input
          id="atc-user-name"
          class="atc-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Your name"
          data-role="user-name"
        />
      </div>

      <button class="atc-add" type="button" disabled data-role="add">Add</button>
    </div>
  `;
  document.body.appendChild(root);

  const modal = root.querySelector(".atc-modal");
  const backdrop = root.querySelector('[data-role="backdrop"]');
  const closeBtn = root.querySelector('[data-role="close"]');
  const dishInput = root.querySelector('[data-role="dish-name"]');
  const userInput = root.querySelector('[data-role="user-name"]');
  const addBtn = root.querySelector('[data-role="add"]');

  function applyScale() {
    const sx = window.innerWidth / DESIGN_W;
    const sy = window.innerHeight / DESIGN_H;
    const s = Math.min(sx, sy);
    modal.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  applyScale();
  window.addEventListener("resize", applyScale);

  function isValid() {
    return dishInput.value.trim().length > 0;
  }

  function refreshAddBtn() {
    addBtn.disabled = !isValid();
  }
  dishInput.addEventListener("input", refreshAddBtn);

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener("resize", applyScale);
    window.removeEventListener("keydown", onKeyDown);
    root.remove();
    onClose?.();
  }
  let closed = false;

  function submit() {
    if (!isValid()) {
      dishInput.focus();
      return;
    }
    const state = cookingStore.getState();
    const dishName = dishInput.value.trim();
    const userName = userInput.value.trim();
    const dish = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dishName,
      userName: userName || null,
      ingredients: state.recipeLog
        .filter((e) => e.type === "ingredient")
        .map((e) => ({ id: e.value.id, name: e.value.name })),
      cookware: state.selectedCookware,
      imageUrl: state.dishImageUrl ?? dishPlaceholderUrl,
      createdAt: new Date().toISOString(),
    };

    cookingStore.addSavedDish(dish);

    // Mirror into the gallery store so the /gallery page picks it up
    // (it uses a different shape — translate the relevant fields).
    galleryStore.addEntry({
      id: dish.id,
      title: dish.dishName,
      recipe: state.dishRecipe ?? "",
      note: dish.userName ? `by ${dish.userName}` : "",
      dishImageUrl: dish.imageUrl,
      ingredients: dish.ingredients.map((i) => i.name),
      timestamp: dish.createdAt,
    });

    onAdded?.(dish);
    close();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && document.activeElement === dishInput) {
      e.preventDefault();
      submit();
    }
  }
  window.addEventListener("keydown", onKeyDown);

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  addBtn.addEventListener("click", submit);

  // Stop clicks on the modal panel from bubbling up to the backdrop
  modal.addEventListener("click", (e) => e.stopPropagation());

  // Autofocus the dish name input so the user can start typing immediately.
  // Brief delay so the focus doesn't fight the entry animation.
  setTimeout(() => dishInput.focus(), 0);

  return { close };
}

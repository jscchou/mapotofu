// Single source of truth for one cooking session.
// Scenes 3 → 6 read/write here. Reset when the user starts a new run.
//
// State shape:
//   selectedIngredients: ingredient data records picked on Scene 3
//   selectedCookware:    cookware id picked on Scene 4 (e.g. "wok")
//   potOrder:            ingredients dragged into the pan, in order
//   recipeLog:           chronological action log shown in Scene 5's right
//                        panel and used to pre-fill Scene 7's recipe.
//                        Entries: { type: 'ingredient', value: { id, name }, timestamp }
//                                 { type: 'heat',       value: 0..5,        timestamp }
//   currentHeatLevel:    integer 0..5 reflecting the heat slider knob
//   dishImageUrl/Title/Recipe/Note: filled by Scenes 5 → 7

function initialState() {
  return {
    selectedIngredients: [],
    selectedCookware: null,
    potOrder: [],
    recipeLog: [],
    // 1 (small) is the default for the 3-position heat selector — heat
    // 0 only exists as a transient "no selection yet" state for any
    // upstream code path that hasn't run through Scene 5 yet.
    currentHeatLevel: 1,
    dishImageUrl: null,
    dishTitle: "",
    dishRecipe: "",
    dishNote: "",
    // Persistent across runs (set by the "Add to Collection" modal,
    // preserved through reset() so a new cook session doesn't wipe them).
    savedDishes: [],
    // Slide-in reference panel toggled from Scenes 3/4/5. Preserved
    // through reset so the user's "I want to see the recipe" choice
    // doesn't get clobbered on a new run.
    traditionalRecipeOpen: false,
  };
}

let state = initialState();
const listeners = new Set();

function notify() {
  for (const l of listeners) l(state);
}

export const cookingStore = {
  getState() {
    return state;
  },

  reset() {
    // Keep savedDishes — those represent the user's collection, not the
    // current cooking session. Also preserve the recipe-panel toggle so
    // a "fresh run" doesn't yank reference content out from under the
    // user mid-glance.
    const savedDishes = state.savedDishes ?? [];
    const traditionalRecipeOpen = state.traditionalRecipeOpen ?? false;
    state = initialState();
    state.savedDishes = savedDishes;
    state.traditionalRecipeOpen = traditionalRecipeOpen;
    notify();
  },

  setSelectedIngredients(items) {
    state.selectedIngredients = Array.isArray(items) ? [...items] : [];
    notify();
  },

  setSelectedCookware(id) {
    state.selectedCookware = id ?? null;
    notify();
  },

  // Add an ingredient to the pan and record the action in the recipe log.
  // Multiple drops of the same ingredient are intentional (e.g. add salt
  // twice) and each one becomes its own entry.
  addToPot(ingredient) {
    const item = {
      id: ingredient.id,
      name: ingredient.name,
      t: state.potOrder.length, // sequence index, kept for older consumers
    };
    state.potOrder.push(item);
    state.recipeLog.push({
      type: "ingredient",
      value: { id: ingredient.id, name: ingredient.name },
      timestamp: Date.now(),
    });
    notify();
  },

  // Live update of the slider's current position. Doesn't write to the
  // recipe log on its own — the scene calls logHeatChange when the user
  // releases the knob (and the value differs from the prior log entry).
  setHeatLevel(level) {
    if (level === state.currentHeatLevel) return;
    state.currentHeatLevel = level;
    notify();
  },

  logHeatChange(level) {
    state.recipeLog.push({
      type: "heat",
      value: level,
      timestamp: Date.now(),
    });
    notify();
  },

  setDishImage(url) {
    state.dishImageUrl = url;
    notify();
  },
  setDishTitle(t) {
    state.dishTitle = t;
    notify();
  },
  setDishRecipe(r) {
    state.dishRecipe = r;
    notify();
  },
  setDishNote(n) {
    state.dishNote = n;
    notify();
  },

  addSavedDish(dish) {
    state.savedDishes.push(dish);
    notify();
  },

  // Replace savedDishes wholesale (e.g. on /gallery boot, hydrating from
  // the persistent galleryStore so the carousel has data without going
  // through the cook flow).
  setSavedDishes(dishes) {
    state.savedDishes = Array.isArray(dishes) ? [...dishes] : [];
    notify();
  },

  // Clears in-progress cooking state (pot contents, recipe log, heat
  // level, dish-image fields) without touching the player's earlier
  // choices (selectedIngredients, selectedCookware) or persistent
  // collections (savedDishes, traditionalRecipeOpen). Used by the
  // "Go Back" button on the missing-tofu validation modal so the
  // player can re-cook from scratch with the same ingredient + pan
  // selection.
  clearCookingProgress() {
    state.potOrder = [];
    state.recipeLog = [];
    // Reset to the default "small" snap, matching the slider's
    // default position when the scene first opens.
    state.currentHeatLevel = 1;
    state.dishImageUrl = null;
    state.dishTitle = "";
    state.dishRecipe = "";
    state.dishNote = "";
    notify();
  },

  setTraditionalRecipeOpen(open) {
    const next = !!open;
    if (state.traditionalRecipeOpen === next) return;
    state.traditionalRecipeOpen = next;
    notify();
  },

  toggleTraditionalRecipe() {
    state.traditionalRecipeOpen = !state.traditionalRecipeOpen;
    notify();
  },

  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

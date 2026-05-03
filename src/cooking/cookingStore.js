// Single source of truth for one cooking session.
// Scenes 3 → 6 read/write from here. Reset when the user starts a new run.

function initialState() {
  return {
    selectedIngredients: [], // from Scene 3 (Continue handoff)
    selectedCookware: null, // from Scene 4 (cookware id, e.g. "wok")
    potOrder: [], // [{ id, name, t }] in drag order; t = seconds since first drop
    fireHistory: [], // [{ level, t }]
    fireLevel: "off",
    cookStartedAt: null, // performance.now() ms when first ingredient hits the pot
    cookEndedAt: null, //   performance.now() ms when lid is placed
    lidPlaced: false,
    dishImageUrl: null,
    dishTitle: "",
    dishRecipe: "",
    dishNote: "",
  };
}

let state = initialState();
const listeners = new Set();

function notify() {
  for (const l of listeners) l(state);
}

function tNow() {
  if (!state.cookStartedAt) return 0;
  const end = state.cookEndedAt ?? performance.now();
  return Math.max(0, (end - state.cookStartedAt) / 1000);
}

export const cookingStore = {
  getState() {
    return state;
  },

  reset() {
    state = initialState();
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

  // Called when an ingredient tile lands inside the pot.
  // Starts the cook timer on the first add. Records `t` = seconds since start.
  addToPot(ingredient) {
    if (state.lidPlaced) return; // cooking is over
    if (!state.cookStartedAt) {
      state.cookStartedAt = performance.now();
      // Seed the fire history with the level we started cooking at.
      state.fireHistory.push({ level: state.fireLevel, t: 0 });
    }
    const t = tNow();
    state.potOrder.push({
      id: ingredient.id,
      name: ingredient.name,
      t,
    });
    notify();
  },

  setFireLevel(level) {
    if (level === state.fireLevel) return;
    state.fireLevel = level;
    if (state.cookStartedAt && !state.lidPlaced) {
      state.fireHistory.push({ level, t: tNow() });
    }
    notify();
  },

  placeLid() {
    if (state.lidPlaced) return;
    state.lidPlaced = true;
    state.cookEndedAt = state.cookStartedAt ? performance.now() : null;
    notify();
  },

  getElapsedSeconds() {
    return tNow();
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

  // Subscribe to any state change; returns an unsubscribe fn.
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

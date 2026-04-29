// Builds the image-generation prompt from a cooking session.
// Kept tiny on purpose — easy to tune without digging through scene code.

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fireSummary(state) {
  const used = new Set();
  for (const f of state.fireHistory) used.add(f.level);
  used.delete("off");
  if (used.size === 0) return "no flame";
  return Array.from(used).join(" → ");
}

function ingredientList(state) {
  if (!state.potOrder.length) return "tofu and oil";
  const names = state.potOrder.map((p) => p.name);
  return names.join(", ");
}

export function buildDishPrompt(state) {
  const ing = ingredientList(state);
  const fire = fireSummary(state);
  const duration =
    state.cookStartedAt && state.cookEndedAt
      ? formatDuration((state.cookEndedAt - state.cookStartedAt) / 1000)
      : "0:00";

  return (
    `A top-down photo of a bowl of mapo tofu made with ${ing}. ` +
    `Cooked on ${fire} fire for ${duration}. ` +
    `Flat illustrated style, warm palette, transparent background.`
  );
}

// Helper for callers that want the parts as data, not a string
export function buildPromptParts(state) {
  return {
    ingredients: state.potOrder.map((p) => ({ ...p })),
    fireSummary: fireSummary(state),
    duration:
      state.cookStartedAt && state.cookEndedAt
        ? (state.cookEndedAt - state.cookStartedAt) / 1000
        : 0,
  };
}

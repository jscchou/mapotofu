// Generates the "Smart Recipe" text used by Scene 7's pre-filled
// textarea. Reads the chronological recipeLog from cookingStore so the
// process lines come out in the same order the player did things.

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function buildIngredientLines(state) {
  return (state.potOrder ?? []).map((p, i) => `${i + 1}. ${p.name}`);
}

export function buildProcessLines(state) {
  const log = state.recipeLog ?? [];
  if (log.length === 0) return [];

  const lines = [];
  let firstIngredient = true;
  for (const entry of log) {
    if (entry.type === "ingredient") {
      const name = entry.value?.name ?? "ingredient";
      lines.push(firstIngredient ? `Started with ${name}` : `Added ${name}`);
      firstIngredient = false;
    } else if (entry.type === "heat") {
      lines.push(`Set heat to ${entry.value}`);
    }
  }
  return lines;
}

// Combined block as a single string (used to pre-fill Scene 7's textarea).
export function buildRecipeText(state) {
  const ings = buildIngredientLines(state).join("\n");
  const procs = buildProcessLines(state).join("\n");
  return `Ingredients:\n${ings || "—"}\n\nProcess:\n${procs || "—"}`;
}

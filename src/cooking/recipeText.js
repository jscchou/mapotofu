// Generates the "Smart Recipe" text used by Scene 4's card and Scene 6's
// pre-filled textarea. Single source of truth so the two stay in sync.

function formatMMSS(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function buildIngredientLines(state) {
  return state.potOrder.map((p, i) => `${i + 1}. ${p.name}`);
}

export function buildProcessLines(state) {
  const events = [];
  for (const p of state.potOrder) events.push({ kind: "ing", ...p });
  for (const f of state.fireHistory) events.push({ kind: "fire", ...f });
  if (state.lidPlaced && state.cookEndedAt && state.cookStartedAt) {
    events.push({
      kind: "lid",
      t: (state.cookEndedAt - state.cookStartedAt) / 1000,
    });
  }
  events.sort((a, b) => a.t - b.t);

  const lines = [];
  let firstIng = true;
  for (const e of events) {
    const ts = formatMMSS(e.t);
    if (e.kind === "ing") {
      if (firstIng) {
        const lvl = state.fireHistory[0]?.level ?? "off";
        lines.push(`Heated ${e.name} on ${cap(lvl)} fire`);
        firstIng = false;
      } else {
        lines.push(`Added ${e.name} at ${ts}`);
      }
    } else if (e.kind === "fire") {
      if (e.t === 0) continue; // initial seed; covered by "Heated …"
      lines.push(`Fire set to ${cap(e.level)} at ${ts}`);
    } else if (e.kind === "lid") {
      lines.push(`Lid placed at ${ts}, cook time paused`);
    }
  }
  return lines;
}

// Combined block as a single string (used to pre-fill the Scene 6 textarea).
export function buildRecipeText(state) {
  const ings = buildIngredientLines(state).join("\n");
  const procs = buildProcessLines(state).join("\n");
  return `Ingredients:\n${ings || "—"}\n\nProcess:\n${procs || "—"}`;
}

// Standalone gallery page rendered to the DOM at /gallery.
// No Pixi here — the gallery is content-shaped, so plain HTML + CSS is
// the natural fit. Live updates come in via galleryStore.subscribe().

import { galleryStore } from "./galleryStore.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function timestampLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function renderCard(entry) {
  const card = document.createElement("article");
  card.className = "gallery-card";
  card.dataset.id = entry.id;

  const ts = timestampLabel(entry.timestamp);
  const ingsLine = (entry.ingredients ?? []).join(", ");

  card.innerHTML = `
    <div class="gallery-card-frame">
      ${
        entry.dishImageUrl
          ? `<img class="gallery-dish" src="${escapeAttr(entry.dishImageUrl)}" alt="${escapeAttr(entry.title)}" />`
          : `<div class="gallery-dish gallery-dish-placeholder">No image</div>`
      }
    </div>
    <h2 class="gallery-title">${escapeHtml(entry.title || "Untitled")}</h2>
    ${
      entry.note
        ? `<p class="gallery-note">${escapeHtml(entry.note)}</p>`
        : ""
    }
    <div class="gallery-meta">${escapeHtml(ts)}</div>
    <details class="gallery-recipe">
      <summary>Recipe</summary>
      ${
        ingsLine
          ? `<div class="gallery-ings"><strong>Used:</strong> ${escapeHtml(ingsLine)}</div>`
          : ""
      }
      <pre>${escapeHtml(entry.recipe || "—")}</pre>
    </details>
  `;
  return card;
}

export function mountGalleryPage(rootEl = document.body) {
  // Clean slate: clear any leftover pixi canvas / overlays
  for (const id of ["app", "permission-ui"]) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
  document.body.classList.remove("bg-cream", "bg-blue", "bg-white");
  document.body.classList.add("bg-cream", "gallery-page");

  const wrap = document.createElement("div");
  wrap.className = "gallery-wrap";
  wrap.innerHTML = `
    <header class="gallery-header">
      <h1 class="gallery-page-title">The Mapo Tofu Gallery</h1>
      <p class="gallery-page-sub">A growing exhibition of everyone’s mapo tofu, maybe.</p>
    </header>
    <main class="gallery-grid" id="gallery-grid"></main>
    <div class="gallery-empty" id="gallery-empty" hidden>
      No mapo tofu yet. Be the first.
    </div>
  `;
  rootEl.appendChild(wrap);

  const grid = wrap.querySelector("#gallery-grid");
  const empty = wrap.querySelector("#gallery-empty");

  function render(entries) {
    if (!entries.length) {
      empty.hidden = false;
      grid.innerHTML = "";
      return;
    }
    empty.hidden = true;
    grid.innerHTML = "";
    // Newest first
    const sorted = [...entries].sort((a, b) =>
      (b.timestamp ?? "").localeCompare(a.timestamp ?? "")
    );
    for (const entry of sorted) {
      grid.appendChild(renderCard(entry));
    }
  }

  // Initial paint
  render(galleryStore.getEntries());

  // Live updates: prepend new entries with a fade-in
  galleryStore.subscribe(({ entry, all }) => {
    if (!entry) {
      render(all);
      return;
    }
    if (grid.querySelector(`[data-id="${entry.id}"]`)) {
      // Already rendered (this tab fired the add) — skip duplicate
      return;
    }
    empty.hidden = true;
    const card = renderCard(entry);
    card.classList.add("gallery-card-enter");
    grid.prepend(card);
    // Trigger transition next frame
    requestAnimationFrame(() => card.classList.add("gallery-card-enter-active"));
  });
}

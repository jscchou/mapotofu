// Bridge between the persistent galleryStore (localStorage shape) and
// cookingStore.savedDishes (carousel/detail shape). The two stores hold
// the same dishes in different field layouts, so when we want a route
// to start with the persisted collection in memory we translate and
// replace.

import { cookingStore } from "../cooking/cookingStore.js";
import { galleryStore } from "./galleryStore.js";

export function entryToSavedDish(entry) {
  // The note field is shaped "by Creator" (or empty) — pull the creator
  // out so the detail header can render it as a separate token.
  let userName = null;
  if (typeof entry.note === "string") {
    const m = entry.note.match(/^by\s+(.+)$/i);
    if (m) userName = m[1].trim();
  }
  return {
    id: entry.id,
    dishName: entry.title || "Untitled",
    userName,
    ingredients: (entry.ingredients ?? []).map((name) => ({ id: name, name })),
    cookware: null,
    imageUrl: entry.dishImageUrl ?? null,
    createdAt: entry.timestamp ?? new Date().toISOString(),
  };
}

export function hydrateSavedDishesFromGallery() {
  const entries = galleryStore.getEntries();
  cookingStore.setSavedDishes(entries.map(entryToSavedDish));
}

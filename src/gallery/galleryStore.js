// In-memory store + subscribe layer over a pluggable adapter.
// Scene 7 calls addEntry. Scene 8 subscribes for live updates.
//
// All entries (local + remote-via-BroadcastChannel) flow through `notify` so
// subscribers don't need to care where the entry came from.

import { localAdapter } from "./galleryAdapter.js";

const adapter = localAdapter; // swap to a remote adapter when ready

const listeners = new Set();
function notify(entry, all) {
  for (const l of listeners) {
    try {
      l({ entry, all });
    } catch (e) {
      console.error("galleryStore listener failed", e);
    }
  }
}

// Forward cross-tab additions to subscribers
adapter.onEntryAdded((entry) => {
  notify(entry, adapter.listEntries());
});

export const galleryStore = {
  addEntry(entry) {
    adapter.addEntry(entry);
    notify(entry, adapter.listEntries());
  },

  getEntries() {
    return adapter.listEntries();
  },

  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

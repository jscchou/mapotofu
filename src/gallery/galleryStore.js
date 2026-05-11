// Thin facade over the gallery adapter. The adapter owns persistence
// (localStorage) and cross-tab delivery (BroadcastChannel); this file
// is just the consumer-facing API the rest of the app talks to.
//
// `subscribe` delegates straight to the adapter's BroadcastChannel
// listener — both same-tab adds and cross-tab adds flow through the
// same path, so subscribers fire exactly once per new entry regardless
// of which tab originated it. The local-add direct-notify the file
// used to do has been removed because it caused a duplicate fire on
// the originating tab (the BroadcastChannel echoes to other in-tab
// instances too, so callers heard the same add twice).
//
// `subscribe` keeps the legacy `{ entry, all }` payload shape so
// existing callsites (main.js, galleryPage.js) don't need to change.

import { localAdapter } from "./galleryAdapter.js";

const adapter = localAdapter; // swap to a remote adapter when ready

export const galleryStore = {
  addEntry(entry) {
    adapter.addEntry(entry);
  },

  getEntries() {
    return adapter.listEntries();
  },

  subscribe(cb) {
    return adapter.subscribe((entry) => {
      cb({ entry, all: adapter.listEntries() });
    });
  },
};

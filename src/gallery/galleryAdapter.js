// Pluggable gallery backend.
//
// LocalAdapter persists entries to localStorage and uses BroadcastChannel
// to push live updates between tabs/windows on the same machine. This is
// enough to demo the "second screen updates live" behavior without a server.
//
// IMPORTANT — same-origin requirement:
//   BroadcastChannel only delivers messages between browsing contexts on
//   the same origin. Both the main game window and the /gallery view
//   here load from the same Vite dev server (e.g. http://localhost:5173),
//   so this works out of the box. If a future host serves /gallery from
//   a different origin (different host/port/protocol), live updates
//   will silently stop and we'll need a real transport (WebSocket / SSE).
//
// To swap to a real backend later (Supabase / Firebase / WebSocket),
// implement the same interface in another file:
//
//   addEntry(entry): void               — persist a new entry
//   listEntries(): Entry[]              — return all entries (sync or Promise)
//   subscribe(cb): () => void           — listen for added entries; cb is
//                                         called with each new entry;
//                                         returns an unsubscribe fn
//
// Then change the import in galleryStore.js to use the new adapter.

const LS_KEY = "mapotofu.gallery.entries.v1";
const CHANNEL = "mapotofu.gallery";

function readAll() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("galleryAdapter: localStorage read failed", e);
    return [];
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn("galleryAdapter: localStorage write failed", e);
  }
}

let writeChannel = null;
function getWriteChannel() {
  if (writeChannel) return writeChannel;
  try {
    writeChannel = new BroadcastChannel(CHANNEL);
  } catch (e) {
    console.warn("galleryAdapter: BroadcastChannel unavailable", e);
    writeChannel = null;
  }
  return writeChannel;
}

export const localAdapter = {
  addEntry(entry) {
    const all = readAll();
    all.push(entry);
    writeAll(all);
    const ch = getWriteChannel();
    if (ch) {
      try {
        ch.postMessage({ type: "added", entry });
      } catch (e) {
        // Some browsers throttle / disallow posting if entry exceeds the
        // structured-clone size limit (rare with our payloads).
        console.warn("galleryAdapter: postMessage failed", e);
      }
    }
  },

  listEntries() {
    return readAll();
  },

  // Listen for added entries from any tab on the same origin (including
  // this one — BroadcastChannel does deliver to other instances inside
  // the same document). Returns an unsubscribe fn that closes the
  // underlying channel cleanly.
  subscribe(cb) {
    let ch;
    try {
      ch = new BroadcastChannel(CHANNEL);
    } catch (e) {
      console.warn("galleryAdapter: BroadcastChannel unavailable", e);
      return () => {};
    }
    const handler = (e) => {
      if (e.data?.type === "added" && e.data.entry) cb(e.data.entry);
    };
    ch.addEventListener("message", handler);
    return () => {
      ch.removeEventListener("message", handler);
      ch.close();
    };
  },
};

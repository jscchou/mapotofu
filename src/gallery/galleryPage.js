// /gallery — standalone tab that mounts the CollectionScene.
//
// This route is the cross-tab "second screen" view, so it doesn't
// share a runtime with the main app. We hydrate cookingStore.savedDishes
// from the persistent galleryStore (localStorage + BroadcastChannel) so
// the carousel has data, then live-subscribe to galleryStore so dishes
// added in the main tab appear here without a refresh.

import { Application } from "pixi.js";
import { CollectionScene } from "../scenes/CollectionScene.js";
import { PointerManager } from "../input/PointerManager.js";
import { galleryStore } from "./galleryStore.js";
import { hydrateSavedDishesFromGallery } from "./hydrate.js";

export async function mountGalleryPage(rootEl = document.body) {
  // Clean slate: clear leftover overlays from a previous render path.
  for (const id of ["permission-ui"]) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
  document.body.classList.remove(
    "bg-cream",
    "bg-blue",
    "bg-white",
    "bg-nude",
    "gallery-page"
  );
  document.body.classList.add("bg-cream");

  // Make sure there's an #app mount point with the same sizing rules
  // as the main flow — main.css positions it absolutely, fullscreen.
  let appHost = document.getElementById("app");
  if (!appHost) {
    appHost = document.createElement("div");
    appHost.id = "app";
    rootEl.appendChild(appHost);
  } else {
    appHost.innerHTML = "";
  }

  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  appHost.appendChild(app.canvas);

  await Promise.all([
    document.fonts.load('400 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('500 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('600 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('700 1em "Intel One Mono"').catch(() => {}),
  ]);

  // Hydrate before the scene mounts so it sees the dishes on first paint.
  hydrateSavedDishesFromGallery();

  // Live cross-tab updates: any dish added in another tab pushes through
  // BroadcastChannel; rehydrating from the persisted list keeps ordering
  // + dedup consistent. Keep the unsubscribe handle so we can release
  // the BroadcastChannel cleanly on tab close.
  const unsubscribeGallery = galleryStore.subscribe(() => {
    hydrateSavedDishesFromGallery();
  });
  window.addEventListener("beforeunload", () => {
    unsubscribeGallery?.();
  });

  // Pulsing "Live" indicator so the player can see at a glance that the
  // second-screen view is connected and listening for updates.
  mountLiveIndicator();

  const collectionScene = new CollectionScene({
    onBack: () => {
      // No prior in-tab history (this tab opened on /gallery directly),
      // so the back arrow points home.
      window.location.href = "/";
    },
  });

  // Pointer pipeline — mouse only here; no hand tracker on this route.
  const pointerManager = new PointerManager({
    onDown: (s) => collectionScene.onPointerDown?.(s),
    onUp: (s) => collectionScene.onPointerUp?.(s),
  });

  // Reuse the scene-management glue (smaller version of bootMainApp's setup)
  app.stage.addChild(collectionScene.root);
  collectionScene.resize(window.innerWidth, window.innerHeight);
  collectionScene.onEnter?.();

  window.addEventListener("resize", () => {
    collectionScene.resize(window.innerWidth, window.innerHeight);
  });

  app.ticker.add(() => {
    const pm = pointerManager.getState();
    collectionScene.onPointerMove?.({
      x: pm.x,
      y: pm.y,
      isDown: pm.isDown,
      source: pm.source,
    });
    collectionScene.update?.(performance.now());
  });
}

// Top-right "Live" pill with a pulsing green dot. Self-contained: the
// styles + keyframes live in an injected <style> tag so we don't have
// to touch the global stylesheet for a route-scoped detail.
function mountLiveIndicator() {
  if (document.getElementById("gallery-live-style")) return; // hot-reload safety
  const style = document.createElement("style");
  style.id = "gallery-live-style";
  style.textContent = `
    .gallery-live-indicator {
      position: fixed;
      top: 14px;
      right: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px 6px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      font-family: "Intel One Mono", "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #2a8c4a;
      pointer-events: none;
      z-index: 600;
    }
    .gallery-live-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #38c46c;
      box-shadow: 0 0 0 0 rgba(56, 196, 108, 0.6);
      animation: gallery-live-pulse 1.5s ease-in-out infinite;
    }
    @keyframes gallery-live-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(56, 196, 108, 0.55);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 0 8px rgba(56, 196, 108, 0);
        transform: scale(1.12);
      }
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.className = "gallery-live-indicator";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Live updates connected");
  el.innerHTML = `
    <span class="gallery-live-dot" aria-hidden="true"></span>
    <span>Live</span>
  `;
  document.body.appendChild(el);
}

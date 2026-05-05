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
  // + dedup consistent.
  galleryStore.subscribe(() => hydrateSavedDishesFromGallery());

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

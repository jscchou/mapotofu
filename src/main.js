import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import { StartScene } from "./scenes/StartScene.js";
import { IngredientScene } from "./scenes/IngredientScene.js";
import { CookwareScene } from "./scenes/CookwareScene.js";
import { CookingScene } from "./scenes/CookingScene.js";
import { CookingAnimationScene } from "./scenes/CookingAnimationScene.js";
import { ResultsScene } from "./scenes/ResultsScene.js";
import { CollectionScene } from "./scenes/CollectionScene.js";
import { HandTracker } from "./tracking/HandTracker.js";
import { OneEuroFilter } from "./tracking/OneEuroFilter.js";
import { GestureDetector } from "./tracking/GestureDetector.js";
import { PointerManager } from "./input/PointerManager.js";
import { DebugOverlay } from "./ui/DebugOverlay.js";
import { mountAddToCollectionModal } from "./ui/AddToCollectionModal.js";
import { mountTraditionalRecipePanel } from "./ui/TraditionalRecipePanel.js";
import { mountMuteButton } from "./ui/MuteButton.js";
import {
  installUserGestureUnlock,
  sceneTransition,
} from "./audio/soundEngine.js";
import { cookingStore } from "./cooking/cookingStore.js";
import { hydrateSavedDishesFromGallery } from "./gallery/hydrate.js";
import { galleryStore } from "./gallery/galleryStore.js";
import { ingredients as INGREDIENT_DATA } from "./data/ingredients.js";

const POINTER_COLOR = 0xd96a3a;
const PINCH_COLOR = 0x2a9d8f;
const ONE_EURO_PARAMS = { mincutoff: 1.0, beta: 0.1, dcutoff: 1.0 };
const PINCH_ENTER = 0.3;
const PINCH_EXIT = 0.5;

const permissionUI = document.getElementById("permission-ui");
const permissionMessage = document.getElementById("permission-message");
const permissionRetry = document.getElementById("permission-retry");

function showPermissionUI(message) {
  permissionMessage.innerHTML = message;
  permissionUI.classList.remove("hidden");
}
function hidePermissionUI() {
  permissionUI.classList.add("hidden");
}

function makePointer() {
  const container = new Container();
  container.label = "Pointer";
  container.visible = false;

  const open = new Container();
  const glow = new Graphics()
    .circle(0, 0, 30)
    .fill({ color: POINTER_COLOR, alpha: 0.22 });
  glow.filters = [new BlurFilter({ strength: 8 })];
  const mid = new Graphics()
    .circle(0, 0, 16)
    .fill({ color: POINTER_COLOR, alpha: 0.55 });
  const core = new Graphics()
    .circle(0, 0, 7)
    .fill({ color: 0xffffff, alpha: 0.95 });
  open.addChild(glow, mid, core);

  const closed = new Container();
  const ring = new Graphics()
    .circle(0, 0, 11)
    .stroke({ color: PINCH_COLOR, width: 3, alpha: 0.95 });
  const dot = new Graphics()
    .circle(0, 0, 4)
    .fill({ color: PINCH_COLOR, alpha: 1 });
  closed.addChild(ring, dot);
  closed.visible = false;

  const dwellRing = new Graphics();
  dwellRing.visible = false;
  const DWELL_RADIUS = 34;

  container.addChild(open, closed, dwellRing);

  let lastDwell = 0;
  return {
    container,
    setPinching(v) {
      open.visible = !v;
      closed.visible = v;
    },
    setVisible(v) {
      container.visible = v;
    },
    setPosition(x, y) {
      container.position.set(x, y);
    },
    setDwell(progress) {
      const p = Math.max(0, Math.min(1, progress ?? 0));
      if (p <= 0) {
        if (lastDwell !== 0) {
          dwellRing.clear();
          dwellRing.visible = false;
          lastDwell = 0;
        }
        return;
      }
      dwellRing.visible = true;
      dwellRing
        .clear()
        .arc(0, 0, DWELL_RADIUS, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p)
        .stroke({ color: POINTER_COLOR, width: 3, alpha: 0.95 });
      lastDwell = p;
    },
  };
}

// Dev helper: prefills the cooking store with sample data so scenes
// downstream of Scene 3 have something to render when entered directly
// via `?scene=...&seed=demo`.
function seedDemoData() {
  const pickIds = [
    "soft-tofu-cubes",
    "peanut-oil",
    "scallion",
    "ginger",
    "chili",
    "ground-beef",
  ];
  const picks = pickIds
    .map((id) => INGREDIENT_DATA.find((d) => d.id === id))
    .filter(Boolean);

  cookingStore.reset();
  cookingStore.setSelectedIngredients(picks);
  cookingStore.setSelectedCookware("wok");

  // Walk the player's ordered actions
  const order = [
    { kind: "ing", id: "peanut-oil" },
    { kind: "heat", level: 2 },
    { kind: "ing", id: "ground-beef" },
    { kind: "ing", id: "ginger" },
    { kind: "heat", level: 4 },
    { kind: "ing", id: "soft-tofu-cubes" },
    { kind: "ing", id: "chili" },
    { kind: "ing", id: "scallion" },
  ];
  for (const step of order) {
    if (step.kind === "ing") {
      const data = picks.find((p) => p.id === step.id);
      if (data) cookingStore.addToPot({ id: data.id, name: data.name });
    } else if (step.kind === "heat") {
      cookingStore.setHeatLevel(step.level);
      cookingStore.logHeatChange(step.level);
    }
  }
}

// ---------- Routes ----------

async function boot() {
  // Standalone gallery page — no Pixi, no main flow
  if (window.location.pathname === "/gallery") {
    const { mountGalleryPage } = await import("./gallery/galleryPage.js");
    mountGalleryPage(document.body);
    return;
  }

  return bootMainApp();
}

// ---------- Main flow ----------

async function bootMainApp() {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0, // CSS body provides the checkered background
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById("app").appendChild(app.canvas);

  // Wake up the Web Audio context on the first user gesture and mount
  // the floating mute toggle. /gallery boots through a separate path
  // (galleryPage.js) and intentionally skips the mute button.
  installUserGestureUnlock(window);
  mountMuteButton();

  // Best-effort: warm up the fonts Pixi will need so first paint isn't fallback.
  await Promise.all([
    document.fonts.load('400 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('500 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('600 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('700 1em "Lato"').catch(() => {}),
  ]);

  const pointer = makePointer();
  // Hidden by default; press 'D' to toggle.
  const debug = new DebugOverlay({ startVisible: false });

  // Bring previously-saved dishes back into memory so the in-app
  // Collection scene survives a page reload — same translation the
  // /gallery route uses, just shared.
  hydrateSavedDishesFromGallery();
  // Cross-tab sync: if /gallery is open elsewhere and someone there
  // adds a dish (rare but possible), pick it up live so the carousel
  // stays in sync without a refresh.
  galleryStore.subscribe(() => hydrateSavedDishesFromGallery());

  // While a DOM modal is open, hand-pinch should drive DOM clicks
  // (close button, Add button, backdrop) instead of going to the scene.
  // Mouse already drives DOM clicks natively, so only redirect for hand.
  let activeModal = null;

  // -------- input pipeline --------
  const pointerManager = new PointerManager({
    onDown: (s) => {
      if (activeModal && s.source === "hand") {
        const el = document.elementFromPoint(s.x, s.y);
        if (el && el.click) el.click();
        return;
      }
      currentScene?.onPointerDown?.(s);
    },
    onUp: (s) => currentScene?.onPointerUp?.(s),
  });

  // -------- scene management --------
  let currentScene = null;

  function applyBackground(scene) {
    document.body.classList.remove(
      "bg-cream",
      "bg-blue",
      "bg-white",
      "bg-nude",
      "bg-results"
    );
    if (scene?.bgClass) document.body.classList.add(scene.bgClass);
  }

  function setScene(scene) {
    const isInitialScene = currentScene == null;
    if (currentScene) {
      currentScene.onExit?.();
      app.stage.removeChild(currentScene.root);
    }
    currentScene = scene;
    app.stage.addChild(scene.root);
    // pointer stays on top of every scene
    app.stage.removeChild(pointer.container);
    app.stage.addChild(pointer.container);
    applyBackground(scene);
    scene.resize(window.innerWidth, window.innerHeight);
    scene.onEnter?.();
    // Re-sync the recipe panel: it should only appear in the eligible
    // scenes, but keep its open/close state across navigation.
    syncRecipePanel();
    // Whoosh on every navigation, but skip the very first paint —
    // there's nothing to "transition" away from at boot, and the
    // AudioContext won't be unlocked yet anyway.
    if (!isInitialScene) sceneTransition();
  }

  // ---- Build scenes ----
  // Note: order matters because forward-references use the variables
  // declared after this block via closure inside callbacks.

  const startScene = new StartScene({
    onStartPressed: () => {
      // Fresh run: clear cooking + dish state
      cookingStore.reset();
      setScene(ingredientScene);
    },
  });

  const ingredientScene = new IngredientScene({
    onBack: () => setScene(startScene),
    onContinue: () => {
      // Hand off the basket selection to the cooking store, then go pick
      // a piece of cookware before the cooking station.
      const picked = ingredientScene.getBasketContents();
      cookingStore.setSelectedIngredients(picked);
      setScene(cookwareScene);
    },
    onRecipe: () => cookingStore.toggleTraditionalRecipe(),
  });

  const cookwareScene = new CookwareScene({
    onBack: () => setScene(ingredientScene),
    onContinue: () => setScene(cookingScene),
    onRecipe: () => cookingStore.toggleTraditionalRecipe(),
  });

  const cookingScene = new CookingScene({
    onBack: () => setScene(cookwareScene),
    onDone: () => setScene(cookingAnimationScene),
    onRecipe: () => cookingStore.toggleTraditionalRecipe(),
  });

  // Scenes 3/4/5 host the slide-in Traditional Recipe panel. Mount/unmount
  // is driven by cookingStore.traditionalRecipeOpen + the current scene
  // (so the panel stays open across scene transitions but never appears
  // on Start, Animation, Results, or Collection).
  const RECIPE_PANEL_SCENES = new Set();
  let recipePanel = null;
  function eligibleForRecipePanel() {
    return RECIPE_PANEL_SCENES.has(currentScene);
  }
  function syncRecipePanel() {
    const open = cookingStore.getState().traditionalRecipeOpen;
    const shouldShow = open && eligibleForRecipePanel();
    if (shouldShow && !recipePanel) {
      recipePanel = mountTraditionalRecipePanel();
    } else if (!shouldShow && recipePanel) {
      recipePanel.unmount();
      recipePanel = null;
    }
    // Update the recipe button label on every eligible scene so the
    // toggle reads correctly even after navigation.
    for (const s of RECIPE_PANEL_SCENES) s.setRecipeOpen?.(open);
  }
  cookingStore.subscribe(syncRecipePanel);

  const cookingAnimationScene = new CookingAnimationScene({
    onDone: () => setScene(resultsScene),
  });

  const resultsScene = new ResultsScene({
    onBack: () => setScene(cookingScene),
    onAddToCollection: () => {
      if (activeModal) return;
      activeModal = mountAddToCollectionModal({
        onClose: () => {
          activeModal = null;
        },
        onAdded: () => {
          // Modal closes itself after onAdded; the onClose hook clears
          // activeModal. Nothing else to do here for now.
        },
      });
    },
    onOpenCollection: () => setScene(collectionScene),
  });

  const collectionScene = new CollectionScene({
    onBack: () => setScene(resultsScene),
  });

  // Lock in which scenes host the slide-in recipe panel + sync the
  // initial label state in case the store was already true at boot
  // (e.g. preserved through a reset earlier in the session).
  RECIPE_PANEL_SCENES.add(ingredientScene);
  RECIPE_PANEL_SCENES.add(cookwareScene);
  RECIPE_PANEL_SCENES.add(cookingScene);
  syncRecipePanel();

  // 'R' toggles the recipe panel anywhere in eligible scenes; Esc
  // closes it when open. Skip while typing into a text field so the
  // modal name input doesn't fight us.
  window.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

    if ((e.key === "r" || e.key === "R") && eligibleForRecipePanel()) {
      e.preventDefault();
      cookingStore.toggleTraditionalRecipe();
      return;
    }
    if (e.key === "Escape" && cookingStore.getState().traditionalRecipeOpen) {
      e.preventDefault();
      cookingStore.setTraditionalRecipeOpen(false);
    }
  });

  // NameDishScene is no longer in the flow — the results scene's
  // "Add to Collection" modal will replace it. The file stays in
  // place in case we reuse parts of it.

  // ---- Dev: URL routing + console helper ----
  // Land on a specific scene with `?scene=NAME` (optionally `&seed=demo`
  // to fill the cooking store so dependent scenes have content), or
  // call window.__setScene(NAME) from the browser console.
  const SCENES_BY_NAME = {
    start: startScene,
    ingredient: ingredientScene,
    cookware: cookwareScene,
    cooking: cookingScene,
    animation: cookingAnimationScene,
    results: resultsScene,
    collection: collectionScene,
  };
  if (typeof window !== "undefined") {
    window.__scenes = SCENES_BY_NAME;
    window.__setScene = (name) => {
      const s = SCENES_BY_NAME[name];
      if (s) setScene(s);
      else
        console.warn(
          "Unknown scene:",
          name,
          "— available:",
          Object.keys(SCENES_BY_NAME)
        );
    };
    window.__seedDemo = seedDemoData;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("seed") === "demo") seedDemoData();
  const requested = params.get("scene");
  setScene(SCENES_BY_NAME[requested] ?? startScene);

  // Use window.innerWidth/innerHeight directly — Pixi's resizeTo:window
  // queues its renderer resize for the next frame, so app.screen is stale
  // inside this synchronous listener.
  window.addEventListener("resize", () => {
    if (currentScene) currentScene.resize(window.innerWidth, window.innerHeight);
  });

  // -------- ticker state --------
  let frameCount = 0;
  let lastFpsSample = performance.now();
  let fps = 0;

  const handState = {
    hasHand: false,
    raw: null,
    smooth: null,
    confidence: 0,
    landmarks: null,
    pinching: false,
    pinchRatio: null,
    threeFinger: false,
    fist: false,
  };

  const filterX = new OneEuroFilter(ONE_EURO_PARAMS);
  const filterY = new OneEuroFilter(ONE_EURO_PARAMS);
  const gestures = new GestureDetector({
    enterThreshold: PINCH_ENTER,
    exitThreshold: PINCH_EXIT,
  });

  const tracker = new HandTracker({
    onHandDetected: ({ landmarks, confidence, timestamp }) => {
      const tip = landmarks[8];
      const mirroredX = 1 - tip.x;
      const canvasW = app.screen.width;
      const canvasH = app.screen.height;
      const rawPx = { x: mirroredX * canvasW, y: tip.y * canvasH };
      const sx = filterX.filter(rawPx.x, timestamp);
      const sy = filterY.filter(rawPx.y, timestamp);

      handState.hasHand = true;
      handState.raw = { x: tip.x, y: tip.y };
      handState.smooth = { x: sx, y: sy };
      handState.confidence = confidence;
      handState.landmarks = landmarks;

      gestures.update(landmarks, { x: sx, y: sy }, confidence);
      handState.pinching = gestures.isPinching();
      handState.pinchRatio = gestures.getRatio();
      handState.threeFinger = gestures.isThreeFinger();
      handState.fist = gestures.isFist();

      pointerManager.updateHand({
        x: sx,
        y: sy,
        fist: handState.fist,
        pinch: handState.pinching,
        hasHand: true,
      });
    },
    onHandLost: () => {
      handState.hasHand = false;
      handState.landmarks = null;
      gestures.cancel();
      handState.pinching = false;
      handState.threeFinger = false;
      handState.fist = false;
      filterX.reset();
      filterY.reset();
      pointerManager.updateHand({ hasHand: false });
    },
    onError: (err) => console.error("HandTracker error:", err),
  });

  try {
    await tracker.init();
    hidePermissionUI();
  } catch (err) {
    console.error("Failed to initialize hand tracker:", err);
    const name = err?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      showPermissionUI(
        "Camera access was denied — you can still use the mouse, or enable the camera and reload."
      );
    } else if (name === "NotFoundError" || name === "OverconstrainedError") {
      showPermissionUI(
        "No camera found — mouse input will still work. Plug in a webcam and reload to enable hand tracking."
      );
    } else {
      showPermissionUI(
        `Couldn't start the webcam — mouse input still works.<br/><small>${
          err?.message ?? err
        }</small>`
      );
    }
    permissionRetry.addEventListener("click", () => window.location.reload());
    // Don't return — fall through so mouse input is still wired up.
  }

  if (tracker.video) {
    debug.setVideo(tracker.video);
    tracker.start();
  }

  app.ticker.add(() => {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsSample >= 500) {
      fps = (frameCount * 1000) / (now - lastFpsSample);
      frameCount = 0;
      lastFpsSample = now;
    }

    const pm = pointerManager.getState();

    // Pixi pointer indicator only when source is hand
    if (pm.source === "hand" && handState.hasHand && handState.smooth) {
      pointer.setVisible(true);
      pointer.setPosition(handState.smooth.x, handState.smooth.y);
      pointer.setPinching(handState.pinching);
    } else {
      pointer.setVisible(false);
    }

    currentScene?.onPointerMove?.({
      x: pm.x,
      y: pm.y,
      isDown: pm.isDown,
      source: pm.source,
    });

    pointer.setDwell(currentScene?.getPointerDwell?.() ?? 0);

    // Per-frame scene update (timer, animations, etc.)
    currentScene?.update?.(now);

    const sceneState = currentScene?.getState?.() ?? {};
    debug.update({
      fps,
      raw: handState.raw,
      smooth: handState.smooth,
      detected: handState.hasHand,
      confidence: handState.hasHand ? handState.confidence : null,
      landmarks: handState.hasHand ? handState.landmarks : null,
      pinchRatio: handState.pinchRatio,
      pinching: handState.pinching,
      threeFinger: handState.threeFinger,
      grabbedId: sceneState.grabbedId ?? null,
      basketCount: sceneState.basketCount ?? 0,
      pointerSource: pm.source,
    });
  });
}

boot().catch((err) => {
  console.error("Boot failed:", err);
  showPermissionUI(
    `Something went wrong starting the app.<br/><small>${
      err?.message ?? err
    }</small>`
  );
});

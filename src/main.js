import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import { StartScene } from "./scenes/StartScene.js";
import { IngredientScene } from "./scenes/IngredientScene.js";
import { CookwareScene } from "./scenes/CookwareScene.js";
import { CookingScene } from "./scenes/CookingScene.js";
import { CookingAnimationScene } from "./scenes/CookingAnimationScene.js";
import { NameDishScene } from "./scenes/NameDishScene.js";
import { HandTracker } from "./tracking/HandTracker.js";
import { OneEuroFilter } from "./tracking/OneEuroFilter.js";
import { GestureDetector } from "./tracking/GestureDetector.js";
import { PointerManager } from "./input/PointerManager.js";
import { DebugOverlay } from "./ui/DebugOverlay.js";
import { cookingStore } from "./cooking/cookingStore.js";

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

  // Best-effort: warm up the fonts Pixi will need so first paint isn't fallback.
  await Promise.all([
    document.fonts.load('400 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('500 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('600 1em "Intel One Mono"').catch(() => {}),
    document.fonts.load('700 1em "Lato"').catch(() => {}),
  ]);

  const pointer = makePointer();
  const debug = new DebugOverlay({ startVisible: true });

  // -------- input pipeline --------
  const pointerManager = new PointerManager({
    onDown: (s) => currentScene?.onPointerDown?.(s),
    onUp: (s) => currentScene?.onPointerUp?.(s),
  });

  // -------- scene management --------
  let currentScene = null;

  function applyBackground(scene) {
    document.body.classList.remove(
      "bg-cream",
      "bg-blue",
      "bg-white",
      "bg-nude"
    );
    if (scene?.bgClass) document.body.classList.add(scene.bgClass);
  }

  function setScene(scene) {
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
    onRecipe: () => console.log("would open recipe"),
  });

  const cookwareScene = new CookwareScene({
    onBack: () => setScene(ingredientScene),
    onContinue: () => setScene(cookingScene),
    onRecipe: () => console.log("would open recipe"),
  });

  const cookingScene = new CookingScene({
    onBack: () => setScene(cookwareScene),
    onCooked: () => setScene(cookingAnimationScene),
  });

  const cookingAnimationScene = new CookingAnimationScene({
    onDone: () => setScene(nameDishScene),
  });

  const nameDishScene = new NameDishScene({
    onAdded: () => {
      console.log("dish added to gallery");
    },
    onMakeAnother: () => {
      cookingStore.reset();
      setScene(startScene);
    },
  });

  setScene(startScene);

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

      pointerManager.updateHand({
        x: sx,
        y: sy,
        isDown: handState.pinching,
        hasHand: true,
      });
    },
    onHandLost: () => {
      handState.hasHand = false;
      handState.landmarks = null;
      gestures.cancel();
      handState.pinching = false;
      handState.threeFinger = false;
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

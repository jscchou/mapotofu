import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import { StartScene } from "./scenes/StartScene.js";
import { MainScene } from "./scenes/MainScene.js";
import { HandTracker } from "./tracking/HandTracker.js";
import { OneEuroFilter } from "./tracking/OneEuroFilter.js";
import { GestureDetector } from "./tracking/GestureDetector.js";
import { DebugOverlay } from "./ui/DebugOverlay.js";

const BG_COLOR = 0xfaf8f4;
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

  // Dwell progress ring — drawn on top; gets a new arc each frame.
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

async function boot() {
  const app = new Application();
  await app.init({
    background: BG_COLOR,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById("app").appendChild(app.canvas);

  const pointer = makePointer();
  const debug = new DebugOverlay({ startVisible: true });

  // -------- scene management --------
  let currentScene = null;

  function setScene(scene) {
    if (currentScene) {
      app.stage.removeChild(currentScene.root);
    }
    currentScene = scene;
    app.stage.addChild(scene.root);
    // Keep pointer on top of every scene.
    app.stage.removeChild(pointer.container);
    app.stage.addChild(pointer.container);
    scene.resize(app.screen.width, app.screen.height);
  }

  const startScene = new StartScene({
    onStartPressed: () => {
      setScene(mainScene);
    },
  });

  const mainScene = new MainScene({
    onContinuePressed: () => {
      console.log("continue pressed");
    },
  });

  setScene(startScene);

  window.addEventListener("resize", () => {
    if (currentScene) currentScene.resize(app.screen.width, app.screen.height);
  });

  // -------- state --------
  let frameCount = 0;
  let lastFpsSample = performance.now();
  let fps = 0;

  const state = {
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
    onPinchStart: (evt) => {
      state.pinching = true;
      state.pinchRatio = evt.ratio;
      pointer.setPinching(true);
      currentScene?.onPinchStart?.(evt);
    },
    onPinchMove: (evt) => {
      state.pinchRatio = evt.ratio;
      currentScene?.onPinchMove?.(evt);
    },
    onPinchEnd: (evt) => {
      state.pinching = false;
      state.pinchRatio = evt.ratio;
      pointer.setPinching(false);
      currentScene?.onPinchEnd?.(evt);
    },
    onThreeFingerStart: (evt) => {
      state.threeFinger = true;
      currentScene?.onThreeFingerStart?.(evt);
    },
    onThreeFingerEnd: (evt) => {
      state.threeFinger = false;
      currentScene?.onThreeFingerEnd?.(evt);
    },
  });

  const tracker = new HandTracker({
    onHandDetected: ({ landmarks, confidence, timestamp }) => {
      const tip = landmarks[8];
      const mirroredX = 1 - tip.x; // selfie-view mirror
      const canvasW = app.screen.width;
      const canvasH = app.screen.height;

      const rawPx = { x: mirroredX * canvasW, y: tip.y * canvasH };
      const sx = filterX.filter(rawPx.x, timestamp);
      const sy = filterY.filter(rawPx.y, timestamp);

      state.hasHand = true;
      state.raw = { x: tip.x, y: tip.y };
      state.smooth = { x: sx, y: sy };
      state.confidence = confidence;
      state.landmarks = landmarks;

      gestures.update(landmarks, { x: sx, y: sy }, confidence);
    },
    onHandLost: () => {
      state.hasHand = false;
      state.landmarks = null;
      // Tell scene to drop anything it's holding, then reset smoothing.
      gestures.cancel();
      state.pinching = false;
      state.threeFinger = false;
      pointer.setPinching(false);
      filterX.reset();
      filterY.reset();
    },
    onError: (err) => {
      console.error("HandTracker error:", err);
    },
  });

  try {
    await tracker.init();
    hidePermissionUI();
  } catch (err) {
    console.error("Failed to initialize hand tracker:", err);
    const name = err?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      showPermissionUI(
        "Camera access was denied. Enable it in your browser's site settings, then click Try again."
      );
    } else if (name === "NotFoundError" || name === "OverconstrainedError") {
      showPermissionUI(
        "No camera found. Plug in a webcam or check your camera is not in use, then click Try again."
      );
    } else {
      showPermissionUI(
        `Couldn't start the webcam.<br/><small>${err?.message ?? err}</small>`
      );
    }
    permissionRetry.addEventListener("click", () => {
      window.location.reload();
    });
    return;
  }

  debug.setVideo(tracker.video);
  tracker.start();

  app.ticker.add(() => {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsSample >= 500) {
      fps = (frameCount * 1000) / (now - lastFpsSample);
      frameCount = 0;
      lastFpsSample = now;
    }

    if (state.hasHand && state.smooth) {
      pointer.setVisible(true);
      pointer.setPosition(state.smooth.x, state.smooth.y);
      currentScene?.onPointerMove?.({
        x: state.smooth.x,
        y: state.smooth.y,
        pinching: state.pinching,
      });
    } else {
      pointer.setVisible(false);
      currentScene?.onPointerMove?.({ x: null, y: null, pinching: false });
    }

    pointer.setDwell(currentScene?.getPointerDwell?.() ?? 0);

    const sceneState = currentScene?.getState?.() ?? {};
    debug.update({
      fps,
      raw: state.raw,
      smooth: state.smooth,
      detected: state.hasHand,
      confidence: state.hasHand ? state.confidence : null,
      landmarks: state.hasHand ? state.landmarks : null,
      pinchRatio: state.pinchRatio,
      pinching: state.pinching,
      threeFinger: state.threeFinger,
      grabbedId: sceneState.grabbedId ?? null,
      basketCount: sceneState.basketCount ?? 0,
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

import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
} from "pixi.js";
import staticDishUrl from "../assets/illustrations/MapoTofuillustration.png";
import { cookingStore } from "../cooking/cookingStore.js";
import { generateDishImage } from "../cooking/imageApi.js";
import { ingredients as INGREDIENT_DATA } from "../data/ingredients.js";
import { mountCookingLoader } from "../ui/CookingLoader.js";
import { HandButtonDwell } from "../input/HandButtonDwell.js";

// Build the request body for /api/generate-dish from the shared store.
// Walks the pot in drag-order, splits items into the four buckets the
// server expects (matching the IDs used throughout the game).
function buildParamsFromStore() {
  const state = cookingStore.getState();
  const potOrder = state.potOrder ?? [];

  let tofu_choice = null;
  let oil_choice = null;
  const ingredients = [];

  for (const item of potOrder) {
    const data = INGREDIENT_DATA.find((d) => d.id === item.id);
    if (!data) continue;
    if (data.category === "tofu") {
      // First tofu wins — players can drag multiples but the dish has one.
      if (!tofu_choice) tofu_choice = item.id;
    } else if (data.category === "oil") {
      if (!oil_choice) oil_choice = item.id;
    } else {
      // category === "ingredient" — pass through in drag order; allow dupes.
      ingredients.push(item.id);
    }
  }

  return {
    tofu_choice,
    oil_choice,
    ingredients,
    cookware: state.selectedCookware ?? null,
  };
}

const CANVAS = { w: 1920, h: 1080 };

const FONT = {
  mono:
    '"Intel One Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lato: '"Lato", system-ui, -apple-system, sans-serif',
};

const COLORS = {
  ink: 0x2a2a2a,
  muted: 0x6f6a62,
  titleRed: 0x980007,
  yellow: 0xffdb00,
  errorRed: 0xb83c36,
};

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class CookingAnimationScene {
  static bgClass = "bg-blue";
  bgClass = "bg-blue";

  constructor({ onDone } = {}) {
    this.onDone = onDone ?? (() => {});

    this.root = new Container();
    this.root.label = "CookingAnimationScene";

    this.bgLayer = new Container();
    this.uiLayer = new Container();
    this.imageLayer = new Container();
    this.root.addChild(this.bgLayer, this.uiLayer, this.imageLayer);

    this._scale = 1;
    this._abort = null;
    this._stage = "idle"; // 'loading' | 'reveal' | 'done' | 'error'
    this._loader = null; // DOM loader handle while in 'loading'

    this._buildErrorUI();
    this._buildDishHolder();

    // Retry button only fires while in error state — gated via setEnabled.
    this.buttons = new HandButtonDwell();
    this.buttons.register(
      "retry",
      (x, y) => this._inRetry(x, y),
      () => {
        this._reset();
        this._startGeneration();
      }
    );
    this.buttons.setEnabled("retry", false);
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._reset();
    this._startGeneration();
    // Dev shortcut: press R to abort and re-fetch a new dish
    this._keyHandler = (e) => {
      if (e.key === "r" || e.key === "R") {
        console.log("[CookingAnimationScene] R pressed — re-fetching dish");
        if (this._abort) this._abort.abort();
        this._reset();
        this._startGeneration();
      }
    };
    window.addEventListener("keydown", this._keyHandler);
  }

  onExit() {
    if (this._abort) this._abort.abort();
    this._abort = null;
    if (this._keyHandler) {
      window.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
    this._unmountLoader();
  }

  _reset() {
    this._stage = "loading";
    this.errorBox.visible = false;
    this.dishHolder.visible = false;
    this.dishSprite.alpha = 0;
    this.dishSprite.scale.set(0.5);
    this.buttons?.setEnabled("retry", false);
    this._mountLoader();
  }

  _mountLoader() {
    if (this._loader) return;
    this._loader = mountCookingLoader();
  }

  _unmountLoader() {
    if (!this._loader) return;
    this._loader.unmount();
    this._loader = null;
  }

  // ---------- build ----------

  _buildErrorUI() {
    this.errorBox = new Container();
    this.errorBox.position.set(CANVAS.w / 2, CANVAS.h / 2);
    this.errorBox.visible = false;

    this.errorText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 18,
        fill: COLORS.errorRed,
        align: "center",
        wordWrap: true,
        wordWrapWidth: 560,
        lineHeight: 26,
      }),
    });
    this.errorText.anchor.set(0.5, 0);
    this.errorText.position.set(0, -60);

    this.retryBtn = new Container();
    this.retryBtnBg = new Graphics()
      .roundRect(-110, -28, 220, 56, 28)
      .fill(COLORS.yellow);
    const retryLabel = new Text({
      text: "Try again",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontSize: 22,
        fontWeight: "700",
        fill: COLORS.titleRed,
      }),
    });
    retryLabel.anchor.set(0.5, 0.5);
    this.retryBtn.position.set(0, 60);
    this.retryBtn.addChild(this.retryBtnBg, retryLabel);

    this.errorBox.addChild(this.errorText, this.retryBtn);
    this.uiLayer.addChild(this.errorBox);
  }

  _buildDishHolder() {
    this.dishHolder = new Container();
    this.dishHolder.position.set(CANVAS.w / 2, CANVAS.h / 2);
    this.dishHolder.visible = false;

    this.dishSprite = new Sprite();
    this.dishSprite.anchor.set(0.5);
    this.dishSprite.alpha = 0;
    this.dishHolder.addChild(this.dishSprite);

    this.imageLayer.addChild(this.dishHolder);
  }

  // ---------- API call + reveal ----------

  async _startGeneration() {
    this._stage = "loading";
    this._abort = new AbortController();

    // Pull the player's actual choices out of the shared store and pass
    // them through to the backend. Any field that's null/missing gets a
    // random fallback on the server side.
    const params = buildParamsFromStore();
    console.log("[CookingAnimationScene] sending params:", params);

    let url;
    try {
      url = await generateDishImage(params, { signal: this._abort.signal });
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.warn(
        "[CookingAnimationScene] backend failed, falling back to static dish:",
        e?.message ?? e
      );
      url = staticDishUrl;
    }

    cookingStore.setDishImage(url);

    try {
      const tex = await Assets.load(url);
      this._beginReveal(tex);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error("Texture load failed:", e);
      // Last-resort: try the static fallback if we weren't already using it
      if (url !== staticDishUrl) {
        try {
          const tex = await Assets.load(staticDishUrl);
          cookingStore.setDishImage(staticDishUrl);
          this._beginReveal(tex);
          return;
        } catch (e2) {
          console.error("Fallback texture load also failed:", e2);
        }
      }
      this._showError(e?.message ?? "Image load failed.");
    }
  }

  _showError(msg) {
    this._stage = "error";
    this._unmountLoader();
    this.errorText.text = msg;
    this.errorBox.visible = true;
    this.buttons?.setEnabled("retry", true);
  }

  _beginReveal(tex) {
    this._stage = "reveal";
    this._unmountLoader();

    // Size the dish sprite to ~520px wide, preserving aspect
    const tw = tex.width || 1;
    const th = tex.height || 1;
    const targetW = 520;
    this.dishSprite.texture = tex;
    this.dishSprite.width = targetW;
    this.dishSprite.height = (targetW * th) / tw;
    this.dishSprite.alpha = 0;
    this.dishSprite.scale.set(0.5, 0.5);
    this.dishHolder.visible = true;

    const start = performance.now();
    const dur = 2000;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeInOutCubic(t);

      // Dish reveals from the center
      this.dishSprite.alpha = e;
      const sFinal = 1.0;
      const sStart = 0.5;
      const s = sStart + (sFinal - sStart) * e;
      this.dishSprite.scale.set(s, s);

      if (t < 1) requestAnimationFrame(step);
      else {
        this._stage = "done";
        // Brief pause then advance
        setTimeout(() => this.onDone(), 400);
      }
    };
    requestAnimationFrame(step);
  }

  // ---------- pointer / scene API ----------

  resize(screenW, screenH) {
    const scale = Math.min(screenW / CANVAS.w, screenH / CANVAS.h);
    this._scale = scale;
    this.root.scale.set(scale);
    this.root.position.set(
      (screenW - CANVAS.w * scale) / 2,
      (screenH - CANVAS.h * scale) / 2
    );
  }

  onPointerMove(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);
    this.buttons?.pointerMove({ x: p.x, y: p.y, source });
  }

  onPointerDown(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);
    if (p.x == null) return;
    this.buttons?.pointerDown({ x: p.x, y: p.y, source });
  }

  onPointerUp() {}

  getPointerDwell() {
    return this.buttons?.getDwellProgress() ?? 0;
  }

  getState() {
    return { grabbedId: null, basketCount: 0 };
  }

  update() {
    // Loader visuals + text cycling are handled by the DOM CookingLoader;
    // nothing to drive from the scene's per-frame ticker.
  }

  // ---------- helpers ----------

  _toDesign(x, y) {
    if (x == null || y == null) return { x: null, y: null };
    return {
      x: (x - this.root.x) / this._scale,
      y: (y - this.root.y) / this._scale,
    };
  }

  _inRetry(x, y) {
    const cx = this.errorBox.x + this.retryBtn.x;
    const cy = this.errorBox.y + this.retryBtn.y;
    return (
      x >= cx - 110 &&
      x <= cx + 110 &&
      y >= cy - 28 &&
      y <= cy + 28
    );
  }
}

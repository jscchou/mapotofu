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
  potFill: 0xfdf6e6,
  outline: 0x333333,
  steam: 0xf2efe9,
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
    this._steamPhase = 0;

    this._buildPotWireframe();
    this._buildLoadingLabel();
    this._buildSteam();
    this._buildErrorUI();
    this._buildDishHolder();
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
  }

  _reset() {
    this._stage = "loading";
    this.loadingLabel.text = "plating…";
    this.loadingLabel.visible = true;
    this.errorBox.visible = false;
    this.dishHolder.visible = false;
    this.dishSprite.alpha = 0;
    this.dishSprite.scale.set(0.5);
    this.potBody.alpha = 1;
    this.potLabel.alpha = 1;
    this.steamLayer.alpha = 1;
    this.steamLayer.visible = true;
  }

  // ---------- build ----------

  _buildPotWireframe() {
    this.pot = new Container();
    this.pot.position.set(CANVAS.w / 2, CANVAS.h / 2 + 40);
    this.potBody = new Graphics()
      .roundRect(-180, -120, 360, 240, 28)
      .fill(COLORS.potFill)
      .stroke({ color: COLORS.outline, width: 5 });
    this.potLabel = new Text({
      text: "POT",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 16,
        fontWeight: "600",
        fill: COLORS.muted,
        letterSpacing: 4,
      }),
    });
    this.potLabel.anchor.set(0.5, 0.5);
    this.potLabel.position.set(0, 80);
    this.pot.addChild(this.potBody, this.potLabel);
    this.bgLayer.addChild(this.pot);
  }

  _buildSteam() {
    // 3 small puffs above the pot, animated sinusoidally.
    this.steamLayer = new Container();
    this.steamLayer.position.set(CANVAS.w / 2, CANVAS.h / 2 + 40 - 140);

    this.steamPuffs = [];
    for (let i = 0; i < 3; i++) {
      const g = new Graphics()
        .ellipse(0, 0, 26, 18)
        .fill({ color: COLORS.steam, alpha: 0.85 })
        .stroke({ color: COLORS.outline, width: 2 });
      g.position.set((i - 1) * 50, 0);
      this.steamLayer.addChild(g);
      this.steamPuffs.push({ g, basePhase: i * 0.7 });
    }
    this.bgLayer.addChild(this.steamLayer);
  }

  _buildLoadingLabel() {
    this.loadingLabel = new Text({
      text: "Cooking…",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 28,
        fontWeight: "500",
        fill: COLORS.titleRed,
      }),
    });
    this.loadingLabel.anchor.set(0.5, 0);
    this.loadingLabel.position.set(CANVAS.w / 2, CANVAS.h / 2 - 220);
    this.uiLayer.addChild(this.loadingLabel);
  }

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
    this.loadingLabel.visible = false;
    this.steamLayer.visible = false;
    this.errorText.text = msg;
    this.errorBox.visible = true;
  }

  _beginReveal(tex) {
    this._stage = "reveal";
    this.loadingLabel.visible = false;

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

      // Steam clears + pot fades out
      this.steamLayer.alpha = 1 - e;
      this.potBody.alpha = 1 - e * 0.95;
      this.potLabel.alpha = 1 - e;

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

  onPointerMove() {}

  onPointerDown({ x, y }) {
    const p = this._toDesign(x, y);
    if (p.x == null) return;
    if (this._stage === "error" && this._inRetry(p.x, p.y)) {
      this._reset();
      this._startGeneration();
    }
  }

  onPointerUp() {}

  getPointerDwell() {
    return 0;
  }

  getState() {
    return { grabbedId: null, basketCount: 0 };
  }

  update() {
    if (this._stage !== "loading") return;
    // Animate steam puffs
    this._steamPhase += 0.04;
    for (const puff of this.steamPuffs) {
      const dy = Math.sin(this._steamPhase + puff.basePhase) * 6;
      puff.g.position.y = dy - 4;
      puff.g.alpha = 0.55 + 0.35 * Math.sin(this._steamPhase + puff.basePhase);
    }
    // Pulse loading dots
    const dots = ".".repeat(1 + Math.floor((this._steamPhase * 2) % 3));
    this.loadingLabel.text = `plating${dots}`;
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

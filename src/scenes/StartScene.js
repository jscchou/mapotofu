import { Container, Graphics, Text, TextStyle, Sprite, Assets } from "pixi.js";
import dishUrl from "../assets/illustrations/MapoTofuillustration.png";

const FONT_STACK =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const COLORS = {
  titleRed: 0x8e1f1f,
  ink: 0x2a2a2a,
  pillYellow: 0xf4cf3c,
  pillYellowHover: 0xebc02a,
};

const LAYOUT = {
  titleSize: 44,
  // Dish is sized dynamically per resize() — these are fallbacks for first paint
  dish: { minW: 320, maxW: 600, fraction: 0.4, fallbackH: 250 },
  button: { w: 180, h: 56, r: 28 },
  gapTitleDish: 28,
  gapDishButton: 36,
};

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class StartScene {
  static bgClass = "bg-cream";
  bgClass = "bg-cream";

  constructor({ onStartPressed, dwellMs = 1000 } = {}) {
    this.onStartPressed = onStartPressed ?? (() => {});
    this.dwellMs = dwellMs;
    this._dwellStart = null;

    this.root = new Container();
    this.root.label = "StartScene";

    this.column = new Container();
    this.root.addChild(this.column);

    this.title = new Text({
      text: "Mapo Tofu, Maybe",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: LAYOUT.titleSize,
        fontWeight: "600",
        fill: COLORS.titleRed,
        letterSpacing: 0.5,
      }),
    });
    this.title.anchor.set(0.5, 0);

    this.dish = new Container();
    this.dishSprite = null;
    this._loadDish();

    this.button = new Container();
    this.button.label = "StartButton";
    this.buttonBg = new Graphics();
    this.buttonLabel = new Text({
      text: "Start",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 22,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.buttonLabel.anchor.set(0.5, 0.5);
    this.button.addChild(this.buttonBg, this.buttonLabel);
    this._drawButton(false);

    this.column.addChild(this.title, this.dish, this.button);
    this._hovered = false;
  }

  async _loadDish() {
    try {
      const tex = await Assets.load(dishUrl);
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0);
      this.dishSprite = sprite;
      this.dish.addChild(sprite);
      // re-layout once the asset arrives so dimensions reflect natural ratio
      if (this._lastResize) this.resize(...this._lastResize);
    } catch (e) {
      console.warn("StartScene: failed to load dish illustration", e);
    }
  }

  _computeDishSize(screenW) {
    const targetW = Math.max(
      LAYOUT.dish.minW,
      Math.min(LAYOUT.dish.maxW, screenW * LAYOUT.dish.fraction)
    );
    let targetH = LAYOUT.dish.fallbackH;
    if (
      this.dishSprite &&
      this.dishSprite.texture &&
      this.dishSprite.texture.width > 0
    ) {
      const ratio =
        this.dishSprite.texture.height / this.dishSprite.texture.width;
      targetH = targetW * ratio;
      this.dishSprite.width = targetW;
      this.dishSprite.height = targetH;
    }
    return { w: targetW, h: targetH };
  }

  _drawButton(hovered) {
    const { w, h, r } = LAYOUT.button;
    this.buttonBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(hovered ? COLORS.pillYellowHover : COLORS.pillYellow);
  }

  setHovered(hovered) {
    if (hovered === this._hovered) return;
    this._hovered = hovered;
    this._drawButton(hovered);
  }

  resize(screenW, screenH) {
    this._lastResize = [screenW, screenH];

    const dishSize = this._computeDishSize(screenW);

    let y = 0;
    this.title.position.set(0, y);
    y += this.title.height + LAYOUT.gapTitleDish;

    // Dish sprite is anchored top-center.
    this.dish.position.set(0, y);
    y += dishSize.h + LAYOUT.gapDishButton;

    const buttonCenterY = y + LAYOUT.button.h / 2;
    this.button.position.set(0, buttonCenterY);

    const totalH = buttonCenterY + LAYOUT.button.h / 2;
    this.column.position.set(screenW / 2, Math.max(40, (screenH - totalH) / 2));
  }

  getStartButtonBounds() {
    const { w, h } = LAYOUT.button;
    const cx = this.column.x + this.button.x;
    const cy = this.column.y + this.button.y;
    return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }

  // -------- pointer API (unified) --------

  onPointerMove({ x, y, source }) {
    if (x == null) {
      this.setHovered(false);
      this._dwellStart = null;
      return;
    }
    const over = pointInRect(x, y, this.getStartButtonBounds());
    this.setHovered(over);

    // Dwell-to-press only for hand. Mouse uses click (onPointerDown).
    if (source !== "hand" || !over) {
      this._dwellStart = null;
      return;
    }
    if (this._dwellStart == null) {
      this._dwellStart = performance.now();
      return;
    }
    if (performance.now() - this._dwellStart >= this.dwellMs) {
      this._dwellStart = null;
      this.onStartPressed();
    }
  }

  onPointerDown({ x, y }) {
    if (x == null) return;
    if (pointInRect(x, y, this.getStartButtonBounds())) {
      this._dwellStart = null;
      this.onStartPressed();
    }
  }

  onPointerUp() {}

  getPointerDwell() {
    if (this._dwellStart == null) return 0;
    return Math.min(1, (performance.now() - this._dwellStart) / this.dwellMs);
  }

  getState() {
    return { grabbedId: null, basketCount: 0 };
  }
}

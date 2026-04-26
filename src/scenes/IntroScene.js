import { Container, Graphics, Text, TextStyle } from "pixi.js";

const FONT_STACK =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const COLORS = {
  titleRed: 0x8e1f1f,
  ink: 0x2a2a2a,
  muted: 0x6f6a62,
  card: 0xffffff,
  cardStroke: 0xe8e0c8,
  pillYellow: 0xf4cf3c,
  pillYellowHover: 0xebc02a,
};

const LAYOUT = {
  cardW: 600,
  cardH: 320,
  cardR: 18,
  button: { w: 200, h: 56, r: 28 },
  gapCardButton: 36,
};

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class IntroScene {
  static bgClass = "bg-cream";
  bgClass = "bg-cream";

  constructor({ onContinuePressed } = {}) {
    this.onContinuePressed = onContinuePressed ?? (() => {});

    this.root = new Container();
    this.root.label = "IntroScene";

    this.column = new Container();
    this.root.addChild(this.column);

    this.cardBg = new Graphics();
    this.column.addChild(this.cardBg);

    this.heading = new Text({
      text: "Mapo Tofu, Maybe",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 24,
        fontWeight: "600",
        fill: COLORS.titleRed,
      }),
    });
    this.heading.anchor.set(0.5, 0);

    this.body = new Text({
      text: "[ Intro copy goes here — placeholder ]",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 16,
        fill: COLORS.muted,
        align: "center",
        wordWrap: true,
        wordWrapWidth: LAYOUT.cardW - 80,
        lineHeight: 24,
      }),
    });
    this.body.anchor.set(0.5, 0);
    this.column.addChild(this.heading, this.body);

    this.button = new Container();
    this.button.label = "ContinueButton";
    this.buttonBg = new Graphics();
    this.buttonLabel = new Text({
      text: "Continue",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 20,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.buttonLabel.anchor.set(0.5, 0.5);
    this.button.addChild(this.buttonBg, this.buttonLabel);
    this._drawButton(false);
    this.column.addChild(this.button);

    this._hovered = false;
  }

  _drawCard() {
    this.cardBg
      .clear()
      .roundRect(-LAYOUT.cardW / 2, 0, LAYOUT.cardW, LAYOUT.cardH, LAYOUT.cardR)
      .fill(COLORS.card)
      .stroke({ color: COLORS.cardStroke, width: 1 });
  }

  _drawButton(hovered) {
    const { w, h, r } = LAYOUT.button;
    this.buttonBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(hovered ? COLORS.pillYellowHover : COLORS.pillYellow);
  }

  _setHovered(v) {
    if (v === this._hovered) return;
    this._hovered = v;
    this._drawButton(v);
  }

  resize(screenW, screenH) {
    this._drawCard();
    // Card sits at column origin (0,0). Heading ~32px down, body below.
    this.heading.position.set(0, 36);
    this.body.position.set(0, 36 + this.heading.height + 22);

    const buttonY = LAYOUT.cardH + LAYOUT.gapCardButton + LAYOUT.button.h / 2;
    this.button.position.set(0, buttonY);

    const totalH = buttonY + LAYOUT.button.h / 2;
    this.column.position.set(screenW / 2, Math.max(40, (screenH - totalH) / 2));
  }

  _continueBounds() {
    const { w, h } = LAYOUT.button;
    const cx = this.column.x + this.button.x;
    const cy = this.column.y + this.button.y;
    return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }

  // -------- pointer API --------

  onPointerMove({ x, y }) {
    if (x == null) {
      this._setHovered(false);
      return;
    }
    this._setHovered(pointInRect(x, y, this._continueBounds()));
  }

  onPointerDown({ x, y }) {
    if (x == null) return;
    if (pointInRect(x, y, this._continueBounds())) {
      this.onContinuePressed();
    }
  }

  onPointerUp() {}

  getPointerDwell() {
    return 0;
  }

  getState() {
    return { grabbedId: null, basketCount: 0 };
  }
}

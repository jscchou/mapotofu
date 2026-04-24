import { Container, Graphics, Text, TextStyle } from "pixi.js";

const FONT_STACK =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const COLORS = {
  ink: 0x2a2a2a,
  muted: 0x6f6a62,
  panel: 0xe8e5e0,
  panelDim: 0xd8d3cc,
  panelHover: 0xc7beb0,
  imageBox: 0xd8d3cc,
  imageBoxStroke: 0xbcb6ab,
};

const LAYOUT = {
  titleSize: 40,
  subtitleSize: 18,
  imageBox: { w: 360, h: 220, r: 14 },
  button: { w: 160, h: 52, r: 26 },
  gapTitleImage: 36,
  gapImageSubtitle: 22,
  gapSubtitleButton: 42,
};

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class StartScene {
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
        fontWeight: "500",
        fill: COLORS.ink,
        letterSpacing: 0.5,
      }),
    });
    this.title.anchor.set(0.5, 0);

    this.imageBox = new Graphics();
    this._drawImageBox();

    this.subtitle = new Text({
      text: "Let's make Mapo Tofu!",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: LAYOUT.subtitleSize,
        fill: COLORS.muted,
      }),
    });
    this.subtitle.anchor.set(0.5, 0);

    this.button = new Container();
    this.button.label = "StartButton";
    this.buttonBg = new Graphics();
    this.buttonLabel = new Text({
      text: "Start",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 18,
        fontWeight: "500",
        fill: COLORS.ink,
      }),
    });
    this.buttonLabel.anchor.set(0.5, 0.5);
    this.button.addChild(this.buttonBg, this.buttonLabel);
    this._drawButton(false);

    this.column.addChild(this.title, this.imageBox, this.subtitle, this.button);

    this._hovered = false;
  }

  _drawImageBox() {
    const { w, h, r } = LAYOUT.imageBox;
    this.imageBox
      .clear()
      .roundRect(-w / 2, 0, w, h, r)
      .fill(COLORS.imageBox)
      .stroke({ color: COLORS.imageBoxStroke, width: 1, alignment: 0.5 });

    // A tiny diagonal slash like a placeholder image icon.
    const inset = 30;
    this.imageBox
      .moveTo(-w / 2 + inset, inset)
      .lineTo(w / 2 - inset, h - inset)
      .stroke({ color: COLORS.imageBoxStroke, width: 1 });
    this.imageBox
      .moveTo(w / 2 - inset, inset)
      .lineTo(-w / 2 + inset, h - inset)
      .stroke({ color: COLORS.imageBoxStroke, width: 1 });
  }

  _drawButton(hovered) {
    const { w, h, r } = LAYOUT.button;
    const color = hovered ? COLORS.panelHover : COLORS.panelDim;
    this.buttonBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(color);
    this.buttonLabel.position.set(0, 0);
  }

  setHovered(hovered) {
    if (hovered === this._hovered) return;
    this._hovered = hovered;
    this._drawButton(hovered);
  }

  isHovered() {
    return this._hovered;
  }

  // Called whenever the canvas resizes — re-centers the column.
  resize(screenW, screenH) {
    let y = 0;
    this.title.position.set(0, y);
    y += this.title.height + LAYOUT.gapTitleImage;

    this.imageBox.position.set(0, y);
    y += LAYOUT.imageBox.h + LAYOUT.gapImageSubtitle;

    this.subtitle.position.set(0, y);
    y += this.subtitle.height + LAYOUT.gapSubtitleButton;

    const buttonCenterY = y + LAYOUT.button.h / 2;
    this.button.position.set(0, buttonCenterY);

    const totalH = buttonCenterY + LAYOUT.button.h / 2;
    this.column.position.set(screenW / 2, Math.max(40, (screenH - totalH) / 2));
  }

  // Returns an axis-aligned rect in scene-root coords for hover hit testing.
  getStartButtonBounds() {
    const { w, h } = LAYOUT.button;
    const cx = this.column.x + this.button.x;
    const cy = this.column.y + this.button.y;
    return {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
    };
  }

  // -------- event API --------

  // Start is pressed by hovering the button continuously for `dwellMs`.
  // The pointer draws a progress ring fed from `getPointerDwell()`.
  onPointerMove({ x, y }) {
    if (x == null) {
      this.setHovered(false);
      this._dwellStart = null;
      return;
    }
    const over = pointInRect(x, y, this.getStartButtonBounds());
    this.setHovered(over);

    if (!over) {
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

  getPointerDwell() {
    if (this._dwellStart == null) return 0;
    return Math.min(1, (performance.now() - this._dwellStart) / this.dwellMs);
  }

  getState() {
    return { grabbedId: null, basketCount: 0 };
  }
}

import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
  BlurFilter,
} from "pixi.js";
import stoveUrl from "../assets/cookware/Stove.png";
import {
  cookware as COOKWARE,
  findCookware,
  STOVE_REF,
} from "../data/cookware.js";
import { cookingStore } from "../cooking/cookingStore.js";

// Scene 4 — Cookware Selection. Pixi at 1920×1080 design canvas with
// uniform-scale fitting (consistent with Scenes 3 & 5).
//
// State A: 2×2 cookware cards on the left + stove on the right.
//          "Start Cooking" pill is grey/disabled.
// State B: a cookware has been dropped on the stove (rotated to lay flat).
//          Source card is dimmed, sprite hidden in card; "Start Cooking"
//          turns yellow/active. Dropping a different cookware swaps cleanly.

const CANVAS = { w: 1920, h: 1080 };

const FONT = {
  mono:
    '"Intel One Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lato: '"Lato", system-ui, -apple-system, sans-serif',
};

const COLORS = {
  black: 0x000000,
  white: 0xffffff,
  cardBg: 0xfffef6, // rgba(255,254,246,0.7) — Pixi can't backdrop-blur; alpha approximation
  cardBorder: 0xffd900,
  yellowBtn: 0xffdb00,
  yellowBtnHover: 0xffe633,
  titleRed: 0x980007,
  brown: 0x8a5c31,
  bookCream: 0xfffbe4,
  labelBrown: 0x4e2700,
  gridStripe: 0xe6f7ff,
  arrow: 0x000000,
  startDisabled: 0xe2e2e2,
  startDisabledText: 0xffffff,
};

// Card layout in canvas coords (Figma values).
const CARD_LAYOUT = [
  {
    id: "wok",
    cardX: 49,
    cardY: 164,
    cardW: 415,
    cardH: 363,
    imgX: 76,
    imgY: 229,
    lblX: 224,
    lblY: 482,
  },
  {
    id: "frying-pan",
    cardX: 483,
    cardY: 164,
    cardW: 415,
    cardH: 363,
    imgX: 506,
    imgY: 231,
    lblX: 616,
    lblY: 482,
  },
  {
    id: "stock-pot",
    cardX: 49,
    cardY: 552,
    cardW: 415,
    cardH: 363,
    imgX: 95,
    imgY: 593,
    lblX: 186,
    lblY: 862,
  },
  {
    id: "grill-pan",
    cardX: 483,
    cardY: 552,
    cardW: 415,
    cardH: 363,
    imgX: 518,
    imgY: 619,
    lblX: 623,
    lblY: 862,
  },
];

const STOVE = {
  x: STOVE_REF.left,
  y: STOVE_REF.top,
  w: STOVE_REF.width,
  h: STOVE_REF.height,
};
const STOVE_DROP = {
  cx: STOVE.x + STOVE.w / 2,
  cy: STOVE.y + STOVE.h / 2,
  halfW: STOVE.w / 2,
  halfH: STOVE.h / 2,
};

const HEADLINE = { cx: STOVE.x + STOVE.w / 2, y: 153 };
const START_BTN = {
  w: 299,
  h: 90,
  r: 40,
  cx: CANVAS.w / 2,
  cy: 934 + 90 / 2,
};
const BACK_BTN = { cx: 57 + 23, cy: 60 + 23, r: 23 };
const TITLE = { x: 121, cy: 60 + 22 };
const RECIPE_BTN = {
  w: 349,
  h: 75,
  r: 40,
  x: CANVAS.w - 35 - 349,
  y: 35,
};

// Same hand-drawn-feel grid as Scene 3 (positions intentionally irregular).
const STRIPE_HORIZ = [102, 271, 457, 623, 792, 941];
const STRIPE_VERT = [
  [128, -439],
  [359, -419],
  [612, -382],
  [904, -396],
  [1167, -407.57],
  [1451, -381],
  [1711, -393],
];

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class CookwareScene {
  static bgClass = "bg-white";
  bgClass = "bg-white";

  constructor({ onBack, onContinue, onRecipe } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onContinue = onContinue ?? (() => {});
    this.onRecipe = onRecipe ?? (() => {});

    this.root = new Container();
    this.root.label = "CookwareScene";

    this.gridLayer = new Container();
    this.cardsLayer = new Container();
    this.stoveLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(
      this.gridLayer,
      this.cardsLayer,
      this.stoveLayer,
      this.uiLayer,
      this.dragLayer
    );

    this.cards = new Map();
    this._onStoveId = null;
    this._scale = 1;
    this.grabbed = null;
    this._stoveActive = false;
    this._startHovered = false;
    this._recipeHovered = false;

    this._buildBackground();
    this._buildTopBar();
    this._buildHeadline();
    this._buildStove();
    this._buildOnStoveSprite();
    this._buildCards();
    this._buildStartButton();
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._onStoveId = cookingStore.getState().selectedCookware ?? null;
    this._renderState();
  }

  onExit() {}

  // ---------- build ----------

  _buildBackground() {
    const base = new Graphics()
      .rect(0, 0, CANVAS.w, CANVAS.h)
      .fill(COLORS.white);
    this.gridLayer.addChild(base);

    for (const y of STRIPE_HORIZ) {
      const g = new Graphics().rect(0, 0, 1923, 70).fill(COLORS.gridStripe);
      g.position.set(0, y);
      this.gridLayer.addChild(g);
    }
    const tilt = (89.58 * Math.PI) / 180;
    for (const [x, y] of STRIPE_VERT) {
      const g = new Graphics().rect(0, 0, 1923, 70).fill(COLORS.gridStripe);
      g.position.set(x, y);
      g.rotation = tilt;
      this.gridLayer.addChild(g);
    }
    const mask = new Graphics()
      .rect(0, 0, CANVAS.w, CANVAS.h)
      .fill(COLORS.white);
    this.gridLayer.addChild(mask);
    this.gridLayer.mask = mask;
  }

  _buildTopBar() {
    // Back button — yellow circle + black left chevron
    this.backBtn = new Container();
    this.backBtn.label = "BackBtn";
    this.backBtn.position.set(BACK_BTN.cx, BACK_BTN.cy);
    const bg = new Graphics().circle(0, 0, BACK_BTN.r).fill(COLORS.yellowBtn);
    const arrow = new Graphics();
    arrow
      .moveTo(7, -8)
      .lineTo(-7, 0)
      .lineTo(7, 8)
      .stroke({ color: COLORS.arrow, width: 2 });
    this.backBtn.addChild(bg, arrow);

    // Title — note the full-width comma "，"
    this.titleText = new Text({
      text: "Mapo Tofu，Maybe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: 32,
        lineHeight: 44,
        letterSpacing: -0.1 * 32,
        fill: COLORS.titleRed,
      }),
    });
    this.titleText.anchor.set(0, 0.5);
    this.titleText.position.set(TITLE.x, TITLE.cy);

    // Recipe pill (top-right): book icon + label
    this.recipeBtn = new Container();
    this.recipeBtn.label = "RecipeBtn";
    this.recipeBtn.position.set(
      RECIPE_BTN.x + RECIPE_BTN.w / 2,
      RECIPE_BTN.y + RECIPE_BTN.h / 2
    );
    this.recipeBtnBg = new Graphics();
    this._drawRecipeBtn();

    const icon = this._makeRecipeIcon();
    icon.position.set(-RECIPE_BTN.w / 2 + 38, 0);

    const recipeLabel = new Text({
      text: "Traditional Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 20,
        fontWeight: "500",
        fill: COLORS.brown,
      }),
    });
    recipeLabel.anchor.set(0, 0.5);
    recipeLabel.position.set(-RECIPE_BTN.w / 2 + 70, 0);

    this.recipeBtn.addChild(this.recipeBtnBg, icon, recipeLabel);
    this.uiLayer.addChild(this.backBtn, this.titleText, this.recipeBtn);
  }

  _makeRecipeIcon() {
    // Simple book/notepad — cream pages, brown outline. ~36×44.
    const c = new Container();
    const g = new Graphics();
    g.roundRect(-18, -22, 17, 44, 3)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    g.roundRect(1, -22, 17, 44, 3)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    g.moveTo(0, -20)
      .lineTo(0, 20)
      .stroke({ color: COLORS.brown, width: 2 });
    for (let i = 0; i < 4; i++) {
      g.moveTo(-15, -16 + i * 8)
        .lineTo(-3, -16 + i * 8)
        .stroke({ color: COLORS.brown, width: 1 });
      g.moveTo(3, -16 + i * 8)
        .lineTo(15, -16 + i * 8)
        .stroke({ color: COLORS.brown, width: 1 });
    }
    c.addChild(g);
    return c;
  }

  _drawRecipeBtn() {
    const { w, h, r } = RECIPE_BTN;
    this.recipeBtnBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(this._recipeHovered ? COLORS.yellowBtnHover : COLORS.yellowBtn);
  }

  _buildHeadline() {
    this.headlineText = new Text({
      text: "Drag a pan onto the stovetop",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "600",
        fontSize: 32,
        lineHeight: 44,
        fill: COLORS.black,
        align: "center",
      }),
    });
    this.headlineText.anchor.set(0.5, 0);
    this.headlineText.position.set(HEADLINE.cx, HEADLINE.y);
    this.uiLayer.addChild(this.headlineText);
  }

  _buildStove() {
    // Soft yellow halo, hidden until drag-over
    this.stoveGlow = new Graphics()
      .ellipse(0, 0, STOVE.w / 2 + 30, 130)
      .fill({ color: COLORS.yellowBtn, alpha: 0.45 });
    this.stoveGlow.filters = [new BlurFilter({ strength: 28 })];
    this.stoveGlow.visible = false;
    this.stoveGlow.position.set(STOVE.x + STOVE.w / 2, STOVE.y + STOVE.h / 2);
    this.stoveLayer.addChild(this.stoveGlow);

    this.stoveSprite = new Sprite();
    this.stoveSprite.anchor.set(0, 0);
    this.stoveSprite.position.set(STOVE.x, STOVE.y);
    this.stoveSprite.width = STOVE.w;
    this.stoveSprite.height = STOVE.h;
    this.stoveSprite.visible = false;
    this.stoveLayer.addChild(this.stoveSprite);

    Assets.load(stoveUrl)
      .then((tex) => {
        this.stoveSprite.texture = tex;
        this.stoveSprite.visible = true;
      })
      .catch((e) => console.warn("CookwareScene: stove load failed", e));
  }

  _buildOnStoveSprite() {
    this.onStoveSprite = new Sprite();
    this.onStoveSprite.anchor.set(0.5);
    this.onStoveSprite.visible = false;
    this.stoveLayer.addChild(this.onStoveSprite);
  }

  _buildCards() {
    for (const layout of CARD_LAYOUT) {
      const cw = findCookware(layout.id);
      if (!cw) continue;

      const cardContainer = new Container();
      cardContainer.position.set(layout.cardX, layout.cardY);
      const frame = new Graphics()
        .roundRect(0, 0, layout.cardW, layout.cardH, 12)
        .fill({ color: COLORS.cardBg, alpha: 0.92 })
        .stroke({ color: COLORS.cardBorder, width: 1 });
      cardContainer.addChild(frame);
      this.cardsLayer.addChild(cardContainer);

      // Cookware sprite — absolute canvas position from Figma
      const sprite = new Sprite();
      sprite.anchor.set(0, 0);
      sprite.position.set(layout.imgX, layout.imgY);
      sprite.width = cw.cardImage.width;
      sprite.height = cw.cardImage.height;
      sprite.visible = false;
      this.cardsLayer.addChild(sprite);

      const label = new Text({
        text: cw.name,
        style: new TextStyle({
          fontFamily: FONT.mono,
          fontWeight: "500",
          fontSize: 24,
          fill: COLORS.labelBrown,
        }),
      });
      label.anchor.set(0, 0);
      label.position.set(layout.lblX, layout.lblY);
      this.cardsLayer.addChild(label);

      const hitRect = {
        x: layout.imgX,
        y: layout.imgY,
        width: cw.cardImage.width,
        height: cw.cardImage.height,
      };

      this.cards.set(layout.id, {
        id: layout.id,
        cookware: cw,
        cardContainer,
        frame,
        sprite,
        label,
        hitRect,
        layout,
      });

      Assets.load(cw.imagePath)
        .then((tex) => {
          sprite.texture = tex;
          sprite.visible = true;
        })
        .catch((e) =>
          console.warn(`CookwareScene: ${layout.id} load failed`, e)
        );
    }
  }

  _buildStartButton() {
    this.startBtn = new Container();
    this.startBtn.label = "StartCookingBtn";
    this.startBtn.position.set(START_BTN.cx, START_BTN.cy);
    this.startBg = new Graphics();
    this.startLabel = new Text({
      text: "Start Cooking",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontWeight: "700",
        fontSize: 30,
        fill: COLORS.startDisabledText,
      }),
    });
    this.startLabel.anchor.set(0.5, 0.5);
    this.startBtn.addChild(this.startBg, this.startLabel);
    this._drawStartBtn();
    this.uiLayer.addChild(this.startBtn);
  }

  _drawStartBtn() {
    const enabled = !!this._onStoveId;
    const { w, h, r } = START_BTN;
    this.startBg.clear();
    if (!enabled) {
      this.startBg
        .roundRect(-w / 2, -h / 2, w, h, r)
        .fill(COLORS.startDisabled);
      this.startLabel.style.fill = COLORS.startDisabledText;
    } else {
      const fill = this._startHovered
        ? COLORS.yellowBtnHover
        : COLORS.yellowBtn;
      this.startBg.roundRect(-w / 2, -h / 2, w, h, r).fill(fill);
      this.startLabel.style.fill = COLORS.brown;
    }
  }

  // ---------- state ----------

  _renderState() {
    if (this._onStoveId) {
      this._showOnStove(this._onStoveId);
      this._dimSourceCard(this._onStoveId);
    } else {
      this.onStoveSprite.visible = false;
      this._restoreAllCards();
    }
    this._drawStartBtn();
  }

  _showOnStove(id) {
    const cw = findCookware(id);
    if (!cw) return;
    Assets.load(cw.imagePath)
      .then((tex) => {
        const os = cw.onStove;
        this.onStoveSprite.texture = tex;
        this.onStoveSprite.width = os.width;
        this.onStoveSprite.height = os.height;
        this.onStoveSprite.position.set(
          os.left + os.width / 2,
          os.top + os.height / 2
        );
        this.onStoveSprite.rotation = ((os.rotation || 0) * Math.PI) / 180;
        this.onStoveSprite.visible = true;
      })
      .catch(() => {});
  }

  _dimSourceCard(id) {
    for (const card of this.cards.values()) {
      if (card.id === id) {
        card.frame.alpha = 0.5;
        card.label.alpha = 0.5;
        card.sprite.visible = false;
      } else {
        card.frame.alpha = 1;
        card.label.alpha = 1;
        card.sprite.visible = true;
      }
    }
  }

  _restoreAllCards() {
    for (const card of this.cards.values()) {
      card.frame.alpha = 1;
      card.label.alpha = 1;
      card.sprite.visible = true;
    }
  }

  // ---------- pointer API ----------

  resize(screenW, screenH) {
    const scale = Math.min(screenW / CANVAS.w, screenH / CANVAS.h);
    this._scale = scale;
    this.root.scale.set(scale);
    this.root.position.set(
      (screenW - CANVAS.w * scale) / 2,
      (screenH - CANVAS.h * scale) / 2
    );
  }

  onPointerMove({ x, y }) {
    const p = this._toDesign(x, y);

    if (this.grabbed) {
      if (p.x == null) return;
      this.grabbed.ghost.position.set(p.x, p.y);
      const over = this._overStove(p.x, p.y);
      if (over !== this._stoveActive) {
        this._stoveActive = over;
        this.stoveGlow.visible = over;
      }
      return;
    }

    if (p.x == null) {
      this._setStartHovered(false);
      this._setRecipeHovered(false);
      return;
    }
    this._setStartHovered(!!this._onStoveId && this._inStartBtn(p.x, p.y));
    this._setRecipeHovered(this._inRecipeBtn(p.x, p.y));
  }

  onPointerDown({ x, y }) {
    const p = this._toDesign(x, y);
    if (p.x == null) return;

    if (this._inCircle(p.x, p.y, this.backBtn, 32)) {
      this.onBack();
      return;
    }
    if (this._inRecipeBtn(p.x, p.y)) {
      this.onRecipe();
      return;
    }
    if (this._onStoveId && this._inStartBtn(p.x, p.y)) {
      cookingStore.setSelectedCookware(this._onStoveId);
      this.onContinue();
      return;
    }

    // Drag a cookware card. Skip if it's the one currently on the stove
    // (its sprite is hidden anyway, but be explicit).
    const card = this._cardAt(p.x, p.y);
    if (!card) return;
    if (card.id === this._onStoveId) return;
    if (!card.sprite.texture) return;
    this._grab(card, p.x, p.y);
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const { card, ghost } = this.grabbed;
    this.grabbed = null;
    this._stoveActive = false;
    this.stoveGlow.visible = false;

    const p = this._toDesign(x, y);
    if (cancelled || p.x == null || !this._overStove(p.x, p.y)) {
      this._snapGhostBack(card, ghost);
      return;
    }

    // Successful drop on stove. Restore any previous on-stove card first.
    if (this._onStoveId && this._onStoveId !== card.id) {
      const prev = this.cards.get(this._onStoveId);
      if (prev) {
        prev.frame.alpha = 1;
        prev.label.alpha = 1;
        prev.sprite.visible = true;
      }
    }
    ghost.parent?.removeChild(ghost);
    ghost.destroy({ children: true });

    this._onStoveId = card.id;
    this._showOnStove(card.id);
    this._dimSourceCard(card.id);
    this._drawStartBtn();
  }

  getPointerDwell() {
    return 0;
  }
  getState() {
    return { grabbedId: this.grabbed?.card?.id ?? null, basketCount: 0 };
  }
  update() {}

  // ---------- drag helpers ----------

  _grab(card, designX, designY) {
    // Hide the card sprite while the ghost is in flight
    card.sprite.visible = false;

    const ghost = new Container();
    const tex = card.sprite.texture;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = card.cookware.cardImage.width;
    sp.height = card.cookware.cardImage.height;

    const shadow = new Graphics()
      .ellipse(0, 18, 60, 12)
      .fill({ color: 0x000000, alpha: 0.25 });
    shadow.filters = [new BlurFilter({ strength: 8 })];
    ghost.addChild(shadow, sp);
    ghost.scale.set(1.05);
    ghost.position.set(designX, designY);
    this.dragLayer.addChild(ghost);

    this.grabbed = { card, ghost };
  }

  _snapGhostBack(card, ghost) {
    const cw = card.cookware;
    const cx = card.layout.imgX + cw.cardImage.width / 2;
    const cy = card.layout.imgY + cw.cardImage.height / 2;
    const from = { x: ghost.x, y: ghost.y };
    const to = { x: cx, y: cy };
    const start = performance.now();
    const dur = 220;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      ghost.position.set(
        from.x + (to.x - from.x) * e,
        from.y + (to.y - from.y) * e
      );
      if (t < 1) requestAnimationFrame(step);
      else {
        ghost.parent?.removeChild(ghost);
        ghost.destroy({ children: true });
        // Restore the source sprite (only if it isn't currently on the stove)
        if (card.id !== this._onStoveId) card.sprite.visible = true;
      }
    };
    requestAnimationFrame(step);
  }

  // ---------- hit tests ----------

  _toDesign(x, y) {
    if (x == null || y == null) return { x: null, y: null };
    return {
      x: (x - this.root.x) / this._scale,
      y: (y - this.root.y) / this._scale,
    };
  }

  _cardAt(x, y) {
    for (const card of this.cards.values()) {
      if (pointInRect(x, y, card.hitRect)) return card;
    }
    return null;
  }

  _overStove(x, y) {
    return (
      Math.abs(x - STOVE_DROP.cx) <= STOVE_DROP.halfW &&
      Math.abs(y - STOVE_DROP.cy) <= STOVE_DROP.halfH
    );
  }

  _inCircle(x, y, container, radius) {
    const dx = x - container.x;
    const dy = y - container.y;
    return Math.hypot(dx, dy) <= radius;
  }

  _inStartBtn(x, y) {
    return (
      Math.abs(x - START_BTN.cx) <= START_BTN.w / 2 &&
      Math.abs(y - START_BTN.cy) <= START_BTN.h / 2
    );
  }

  _inRecipeBtn(x, y) {
    return pointInRect(x, y, {
      x: RECIPE_BTN.x,
      y: RECIPE_BTN.y,
      width: RECIPE_BTN.w,
      height: RECIPE_BTN.h,
    });
  }

  _setStartHovered(v) {
    if (v === this._startHovered) return;
    this._startHovered = v;
    this._drawStartBtn();
  }

  _setRecipeHovered(v) {
    if (v === this._recipeHovered) return;
    this._recipeHovered = v;
    this._drawRecipeBtn();
  }
}

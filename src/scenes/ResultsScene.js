import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
} from "pixi.js";
import dishPlaceholderUrl from "../assets/illustrations/MapoTofuillustration.png";
import { cookingStore } from "../cooking/cookingStore.js";
import { HandButtonDwell } from "../input/HandButtonDwell.js";

// Results scene — shown after the cooking animation finishes.
// Displays the user's "finished" dish + the chronological list of
// ingredients they added. The "Add to Collection" button will trigger
// the name-your-dish modal in the next round.

const CANVAS = { w: 1920, h: 1080 };

const FONT = {
  mono:
    '"Intel One Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lato: '"Lato", system-ui, -apple-system, sans-serif',
};

const COLORS = {
  ink: 0x000000,
  titleRed: 0x980007,
  brown: 0x8a5c31,
  yellowBtn: 0xffdb00,
  yellowBtnHover: 0xffe633,
  leftCardBg: 0xfeffe6, // approx rgba(254, 255, 246, 0.7) over base
  leftCardBorder: 0xffd900,
  rightOuterBg: 0xfff4b7,
  rightOuterBorder: 0xf2e178,
  rightInnerBg: 0xfffdf2,
  divider: 0xffd2a8,
};

// Top bar — back btn + title + "Mapo Tofu Collection" pill
const BACK_BTN = { cx: 80, cy: 83, r: 23 };
const TITLE = { x: 140, cy: 82 };
const COLLECTION_BTN = {
  w: 419,
  h: 90,
  r: 40,
  cx: 1660, // right side, mirroring back-btn left margin
  cy: 80,
};

const PAGE_TITLE = { cx: CANVAS.w / 2, y: 150 };

const LEFT_CARD = { x: 150, y: 280, w: 700, h: 505, r: 12 };
// Bounding box for the dish image inside the left card. Bumped from
// the original 552×263 spec so the dish reads more prominently. The
// sprite is aspect-preserved so square assets render as ~445×445.
const DISH_BOX = { w: 620, h: 445 };

const RIGHT_CARD = { x: 1216, y: 280, w: 554, h: 683, r: 12 };
const INNER_CARD = {
  // Centered inside RIGHT_CARD
  w: 483,
  h: 572,
  r: 12,
};
INNER_CARD.x = RIGHT_CARD.x + (RIGHT_CARD.w - INNER_CARD.w) / 2;
INNER_CARD.y = RIGHT_CARD.y + (RIGHT_CARD.h - INNER_CARD.h) / 2;

const RECIPE_HEADING = {
  cx: INNER_CARD.x + INNER_CARD.w / 2,
  y: INNER_CARD.y + 28,
};
const ADD_BTN = {
  // Centered horizontally with the LEFT card
  cx: LEFT_CARD.x + LEFT_CARD.w / 2,
  cy: 870,
  w: 419,
  h: 90,
  r: 40,
};

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class ResultsScene {
  // backgroundyellow.png is served via the existing body.bg-cream rule
  // (same asset used by Scene 1's StartScene). Pixi canvas stays
  // transparent and the PNG fills the viewport with cover/center.
  static bgClass = "bg-cream";
  bgClass = "bg-cream";

  constructor({
    onBack,
    onAddToCollection,
    onOpenCollection,
  } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onAddToCollection = onAddToCollection ?? (() => {});
    this.onOpenCollection = onOpenCollection ?? (() => {});

    this.root = new Container();
    this.root.label = "ResultsScene";

    // Layers (bottom → top). No Pixi-drawn background — the body's
    // bg-cream class supplies backgroundyellow.png at viewport size.
    this.cardsLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(this.cardsLayer, this.uiLayer, this.dragLayer);

    this._scale = 1;
    this._addHovered = false;
    this._collectionHovered = false;

    // DOM overlay for the editable transcription
    this._formWrapper = null;
    this._textarea = null;

    this._buildTopBar();
    this._buildPageTitle();
    this._buildLeftCard();
    this._buildRightCard();
    this._buildAddToCollection();

    // Hand-hover-to-press for every button. Mouse still gets instant clicks.
    this.buttons = new HandButtonDwell();
    this.buttons.register(
      "back",
      (x, y) => this._inCircle(x, y, this.backBtn, 32),
      () => this.onBack()
    );
    this.buttons.register(
      "collection",
      (x, y) => this._inCollectionBtn(x, y),
      () => this.onOpenCollection()
    );
    this.buttons.register(
      "add",
      (x, y) => this._inAddBtn(x, y),
      () => this.onAddToCollection()
    );
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._loadDishImage();
    this._mountTranscription();
  }

  onExit() {
    this._unmountTranscription();
  }

  // ---------- build: top bar ----------

  _buildTopBar() {
    // Back button
    this.backBtn = new Container();
    this.backBtn.label = "BackBtn";
    this.backBtn.position.set(BACK_BTN.cx, BACK_BTN.cy);
    const bg = new Graphics().circle(0, 0, BACK_BTN.r).fill(COLORS.yellowBtn);
    const arrow = new Graphics();
    arrow
      .moveTo(7, -8)
      .lineTo(-7, 0)
      .lineTo(7, 8)
      .stroke({ color: COLORS.ink, width: 2 });
    this.backBtn.addChild(bg, arrow);

    // Title
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

    // "Mapo Tofu Collection" pill
    this.collectionBtn = new Container();
    this.collectionBtn.label = "CollectionBtn";
    this.collectionBtn.position.set(COLLECTION_BTN.cx, COLLECTION_BTN.cy);
    this.collectionBtnBg = new Graphics();
    this.collectionBtnLabel = new Text({
      text: "Mapo Tofu Collection",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontWeight: "700",
        fontSize: 32,
        fill: COLORS.titleRed,
      }),
    });
    this.collectionBtnLabel.anchor.set(0.5, 0.5);
    this.collectionBtn.addChild(
      this.collectionBtnBg,
      this.collectionBtnLabel
    );
    this._drawCollectionBtn();

    this.uiLayer.addChild(this.backBtn, this.titleText, this.collectionBtn);
  }

  _drawCollectionBtn() {
    const { w, h, r } = COLLECTION_BTN;
    this.collectionBtnBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(this._collectionHovered ? COLORS.yellowBtnHover : COLORS.yellowBtn);
  }

  // ---------- build: page title ----------

  _buildPageTitle() {
    this.pageTitle = new Text({
      text: "Your Mapo Tofu is Ready!",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "700",
        fontSize: 68,
        fill: COLORS.titleRed,
        align: "center",
      }),
    });
    this.pageTitle.anchor.set(0.5, 0);
    this.pageTitle.position.set(PAGE_TITLE.cx, PAGE_TITLE.y);
    this.uiLayer.addChild(this.pageTitle);
  }

  // ---------- build: left card (dish) ----------

  _buildLeftCard() {
    const cardBg = new Graphics()
      .roundRect(LEFT_CARD.x, LEFT_CARD.y, LEFT_CARD.w, LEFT_CARD.h, LEFT_CARD.r)
      .fill({ color: COLORS.leftCardBg, alpha: 0.85 })
      .stroke({ color: COLORS.leftCardBorder, width: 1 });
    this.cardsLayer.addChild(cardBg);

    // Dish image: prefer the Gemini-generated PNG that
    // CookingAnimationScene saved to cookingStore.dishImageUrl. Falls
    // back to the static illustration if that's missing (e.g. the API
    // failed and the animation scene used its own static fallback, or
    // the user reached this scene without going through Scene 6).
    this.dishSprite = new Sprite();
    this.dishSprite.anchor.set(0.5);
    this.dishSprite.position.set(
      LEFT_CARD.x + LEFT_CARD.w / 2,
      LEFT_CARD.y + LEFT_CARD.h / 2
    );
    this.dishSprite.visible = false;
    this.cardsLayer.addChild(this.dishSprite);
  }

  async _loadDishImage() {
    const url = cookingStore.getState().dishImageUrl || dishPlaceholderUrl;
    try {
      const tex = await Assets.load(url);
      this.dishSprite.texture = tex;
      // Aspect-preserved fit inside DISH_BOX (552×263).
      const tw = tex.width || 1;
      const th = tex.height || 1;
      const ratio = tw / th;
      const boxRatio = DISH_BOX.w / DISH_BOX.h;
      if (ratio > boxRatio) {
        this.dishSprite.width = DISH_BOX.w;
        this.dishSprite.height = DISH_BOX.w / ratio;
      } else {
        this.dishSprite.height = DISH_BOX.h;
        this.dishSprite.width = DISH_BOX.h * ratio;
      }
      this.dishSprite.visible = true;
    } catch (e) {
      console.warn("ResultsScene: dish image load failed", e, "url:", url);
      // Try the static placeholder as a last resort
      if (url !== dishPlaceholderUrl) {
        try {
          const tex = await Assets.load(dishPlaceholderUrl);
          this.dishSprite.texture = tex;
          this.dishSprite.width = DISH_BOX.h * (tex.width / tex.height);
          this.dishSprite.height = DISH_BOX.h;
          this.dishSprite.visible = true;
        } catch {}
      }
    }
  }

  // ---------- build: right card (recipe list) ----------

  _buildRightCard() {
    // Outer card
    const outerBg = new Graphics()
      .roundRect(
        RIGHT_CARD.x,
        RIGHT_CARD.y,
        RIGHT_CARD.w,
        RIGHT_CARD.h,
        RIGHT_CARD.r
      )
      .fill({ color: COLORS.rightOuterBg, alpha: 0.9 })
      .stroke({ color: COLORS.rightOuterBorder, width: 2 });
    this.cardsLayer.addChild(outerBg);

    // Inner card
    const innerBg = new Graphics()
      .roundRect(
        INNER_CARD.x,
        INNER_CARD.y,
        INNER_CARD.w,
        INNER_CARD.h,
        INNER_CARD.r
      )
      .fill(COLORS.rightInnerBg);
    this.cardsLayer.addChild(innerBg);

    // Heading (fixed at top of inner card; the editable transcription
    // textarea is mounted as an HTML overlay below this heading on enter).
    const heading = new Text({
      text: "Your Mapo Tofu Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: 20,
        fill: COLORS.brown,
        letterSpacing: -0.02 * 20,
      }),
    });
    heading.anchor.set(0.5, 0);
    heading.position.set(RECIPE_HEADING.cx, RECIPE_HEADING.y);
    this.uiLayer.addChild(heading);
  }

  // ---------- build: add-to-collection button ----------

  _buildAddToCollection() {
    this.addBtn = new Container();
    this.addBtn.label = "AddBtn";
    this.addBtn.position.set(ADD_BTN.cx, ADD_BTN.cy);
    this.addBtnBg = new Graphics();
    this.addBtnLabel = new Text({
      text: "Add to Collection",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontWeight: "700",
        fontSize: 32,
        fill: COLORS.titleRed,
      }),
    });
    this.addBtnLabel.anchor.set(0.5, 0.5);
    this.addBtn.addChild(this.addBtnBg, this.addBtnLabel);
    this._drawAddBtn();
    this.uiLayer.addChild(this.addBtn);
  }

  _drawAddBtn() {
    const { w, h, r } = ADD_BTN;
    this.addBtnBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(this._addHovered ? COLORS.yellowBtnHover : COLORS.yellowBtn);
  }

  // ---------- editable transcription overlay ----------

  // Build a chronological text block of every cooking action — both
  // ingredient adds and heat changes — for the textarea pre-fill.
  _buildTranscription() {
    const log = cookingStore.getState().recipeLog ?? [];
    const lines = log
      .map((entry) => {
        if (entry.type === "ingredient")
          return `Added ${entry.value?.name ?? "ingredient"}`;
        if (entry.type === "heat") return `Set heat to ${entry.value}`;
        return "";
      })
      .filter(Boolean);
    return lines.join("\n");
  }

  _mountTranscription() {
    if (this._formWrapper) return;

    // Wrapper sized to the design canvas so children can use literal
    // 1920×1080 coords; we apply scale + offset on the wrapper to match
    // the Pixi root's transform.
    const wrap = document.createElement("div");
    wrap.className = "results-transcription-wrap";
    wrap.style.position = "fixed";
    wrap.style.left = "0";
    wrap.style.top = "0";
    wrap.style.width = `${CANVAS.w}px`;
    wrap.style.height = `${CANVAS.h}px`;
    wrap.style.transformOrigin = "top left";
    wrap.style.pointerEvents = "none"; // wrapper is inert; textarea opts in
    wrap.style.zIndex = "200";

    const ta = document.createElement("textarea");
    ta.className = "results-transcription";
    ta.spellcheck = false;
    // Below the heading, padded inside the inner card.
    const top = RECIPE_HEADING.y + 28 + 22; // heading bottom + gap
    const bottom = INNER_CARD.y + INNER_CARD.h - 24;
    ta.style.left = `${INNER_CARD.x + 24}px`;
    ta.style.top = `${top}px`;
    ta.style.width = `${INNER_CARD.w - 48}px`;
    ta.style.height = `${bottom - top}px`;

    // Pre-fill: keep prior edits if they exist, otherwise build fresh
    // from the current recipeLog.
    const state = cookingStore.getState();
    const initial =
      state.dishRecipe && state.dishRecipe.length
        ? state.dishRecipe
        : this._buildTranscription();
    ta.value = initial;
    cookingStore.setDishRecipe(initial);

    ta.addEventListener("input", () => {
      cookingStore.setDishRecipe(ta.value);
    });

    wrap.appendChild(ta);
    document.body.appendChild(wrap);
    this._formWrapper = wrap;
    this._textarea = ta;

    this._updateTranscriptionTransform();
  }

  _unmountTranscription() {
    if (this._formWrapper) {
      this._formWrapper.remove();
      this._formWrapper = null;
      this._textarea = null;
    }
  }

  _updateTranscriptionTransform() {
    if (!this._formWrapper) return;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const scale = Math.min(screenW / CANVAS.w, screenH / CANVAS.h);
    const dx = (screenW - CANVAS.w * scale) / 2;
    const dy = (screenH - CANVAS.h * scale) / 2;
    this._formWrapper.style.left = `${dx}px`;
    this._formWrapper.style.top = `${dy}px`;
    this._formWrapper.style.transform = `scale(${scale})`;
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
    // Keep the textarea overlay aligned with the Pixi canvas
    this._updateTranscriptionTransform();
  }

  onPointerMove(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);

    this.buttons?.pointerMove({ x: p.x, y: p.y, source });

    if (p.x == null) {
      this._setAddHovered(false);
      this._setCollectionHovered(false);
      return;
    }
    this._setAddHovered(this._inAddBtn(p.x, p.y));
    this._setCollectionHovered(this._inCollectionBtn(p.x, p.y));
  }

  onPointerDown(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);
    if (p.x == null) return;
    this.buttons?.pointerDown({ x: p.x, y: p.y, source });
  }

  onPointerUp() {}
  update() {}
  getPointerDwell() {
    return this.buttons?.getDwellProgress() ?? 0;
  }
  getState() {
    return { grabbedId: null, basketCount: 0 };
  }

  // ---------- hit tests ----------

  _toDesign(x, y) {
    if (x == null || y == null) return { x: null, y: null };
    return {
      x: (x - this.root.x) / this._scale,
      y: (y - this.root.y) / this._scale,
    };
  }

  _inCircle(x, y, container, radius) {
    const dx = x - container.x;
    const dy = y - container.y;
    return Math.hypot(dx, dy) <= radius;
  }

  _inAddBtn(x, y) {
    return pointInRect(x, y, {
      x: ADD_BTN.cx - ADD_BTN.w / 2,
      y: ADD_BTN.cy - ADD_BTN.h / 2,
      width: ADD_BTN.w,
      height: ADD_BTN.h,
    });
  }

  _inCollectionBtn(x, y) {
    return pointInRect(x, y, {
      x: COLLECTION_BTN.cx - COLLECTION_BTN.w / 2,
      y: COLLECTION_BTN.cy - COLLECTION_BTN.h / 2,
      width: COLLECTION_BTN.w,
      height: COLLECTION_BTN.h,
    });
  }

  _setAddHovered(v) {
    if (v === this._addHovered) return;
    this._addHovered = v;
    this._drawAddBtn();
  }
  _setCollectionHovered(v) {
    if (v === this._collectionHovered) return;
    this._collectionHovered = v;
    this._drawCollectionBtn();
  }
}

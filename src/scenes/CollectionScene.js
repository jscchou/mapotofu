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
import { formatRelativeTime } from "../util/relativeTime.js";
import { HandButtonDwell } from "../input/HandButtonDwell.js";

// Mapo Tofu Collection — horizontal carousel of saved dishes plus an
// in-place detail view. Two modes share one scene so the back arrow
// can return from detail → carousel without leaving the scene.
//
// The carousel reads cookingStore.savedDishes (newest first) and
// subscribes for live updates. /gallery hydrates that list from the
// persistent galleryStore before mounting this scene.

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
  cardBg: 0xfeffe6,        // rgba(254, 255, 246, 0.7) over base
  cardBorder: 0xffd900,
  rightOuterBg: 0xfff4b7,
  rightOuterBorder: 0xf2e178,
  rightInnerBg: 0xfffdf2,
  divider: 0xffd2a8,
};

// ---------- carousel layout ----------
const CARD = { w: 558, h: 488, r: 12 };
const CARD_GAP = 30;
const CARD_STEP = CARD.w + CARD_GAP; // distance between adjacent card centers
const CARD_CENTER_Y = 540;
const DISH_BOX = { w: 411, h: 196 };
const DISH_BOX_TOP = CARD_CENTER_Y - CARD.h / 2 + 60; // top padding inside card

const ARROW_BTN = { r: 30, leftX: 60, rightX: CANVAS.w - 60, y: CARD_CENTER_Y };
const BACK_BTN = { cx: 80, cy: 83, r: 23 };
const TITLE = { x: 140, cy: 82 };
const BOTTOM_PROMPT = { cx: CANVAS.w / 2, y: 980 };

// ---------- detail view layout (mirrors ResultsScene) ----------
const DETAIL_HEADER = { cx: CANVAS.w / 2, y: 175 };
const DETAIL_LEFT = { x: 150, y: 280, w: 700, h: 505, r: 12 };
const DETAIL_DISH_BOX = { w: 620, h: 445 };
const DETAIL_RIGHT = { x: 1216, y: 280, w: 554, h: 683, r: 12 };
const DETAIL_INNER = { w: 483, h: 572, r: 12 };
DETAIL_INNER.x = DETAIL_RIGHT.x + (DETAIL_RIGHT.w - DETAIL_INNER.w) / 2;
DETAIL_INNER.y = DETAIL_RIGHT.y + (DETAIL_RIGHT.h - DETAIL_INNER.h) / 2;
const DETAIL_HEADING = {
  cx: DETAIL_INNER.x + DETAIL_INNER.w / 2,
  y: DETAIL_INNER.y + 28,
};
const DETAIL_LIST = {
  x: DETAIL_INNER.x + 24,
  y: DETAIL_INNER.y + 80,
  w: DETAIL_INNER.w - 48,
  h: DETAIL_INNER.h - 100,
};

const DRAG_THRESHOLD_PX = 8; // movement above this suppresses click
const SNAP_LERP = 0.18;       // per-tick snap easing toward target

// Visual hierarchy: the centered card sits a notch above its neighbors,
// and any card under the cursor briefly matches that elevation. The
// elevation is just a uniform scale on the card container — Pixi sorts
// the elevated card on top via zIndex so its expanded edges aren't
// clipped by the next card over.
const CARD_SCALE_BASE = 1.0;
const CARD_SCALE_ELEVATED = 1.05;
const CARD_SCALE_LERP = 0.2;

export class CollectionScene {
  static bgClass = "bg-cream";
  bgClass = "bg-cream";

  constructor({ onBack } = {}) {
    this.onBack = onBack ?? (() => {});

    this.root = new Container();
    this.root.label = "CollectionScene";

    // Layers
    this.bgLayer = new Container();        // background visuals (none right now — body bg-cream supplies it)
    this.carouselLayer = new Container();  // carousel-mode only
    this.detailLayer = new Container();    // detail-mode only
    this.uiLayer = new Container();        // top bar (always visible)
    this.root.addChild(this.bgLayer, this.carouselLayer, this.detailLayer, this.uiLayer);

    // State
    this._scale = 1;
    this._mode = "carousel";
    this._dishes = []; // newest first
    this._index = 0;   // currently centered card
    this._cardSprites = []; // pixi containers per dish, parallel to _dishes
    this._carouselX = CANVAS.w / 2;          // current visual center for index 0
    this._carouselTargetX = CANVAS.w / 2;    // animated toward by lerp
    this._dragging = false;
    this._dragStart = null;        // { x, y, carouselX }
    this._dragMoved = false;
    this._dragHit = null;          // { kind: 'card'|'leftArrow'|'rightArrow'|'back'|'cardArea', index? }
    this._hover = null;            // 'back' | 'left' | 'right' | 'card' | null
    this._hoveredCardIndex = null; // which card the pointer is over (carousel mode)

    this._buildTopBar();
    this._buildCarouselView();
    this._buildDetailView();

    // Hand-hover-to-press for the back arrow + carousel arrows + the
    // centered card. The centered card is registered handOnly so mouse
    // drag-scroll is still handled by the scene's own onPointerDown
    // logic below.
    this.buttons = new HandButtonDwell();
    this.buttons.register(
      "back",
      (x, y) => this._inCircle(x, y, BACK_BTN.cx, BACK_BTN.cy, BACK_BTN.r + 6),
      () => {
        if (this._mode === "detail") this._setMode("carousel");
        else this.onBack();
      }
    );
    this.buttons.register(
      "leftArrow",
      (x, y) => this._inCircle(x, y, ARROW_BTN.leftX, ARROW_BTN.y, ARROW_BTN.r + 6),
      () => this._setCarouselTarget(this._index - 1)
    );
    this.buttons.register(
      "rightArrow",
      (x, y) => this._inCircle(x, y, ARROW_BTN.rightX, ARROW_BTN.y, ARROW_BTN.r + 6),
      () => this._setCarouselTarget(this._index + 1)
    );
    this.buttons.register(
      "centeredCard",
      (x, y) => this._isOverCenteredCard(x, y),
      () => {
        const dish = this._dishes[this._index];
        if (dish) this._showDetailFor(dish);
      },
      { handOnly: true }
    );

    this._unsubscribe = cookingStore.subscribe(() => this._refreshDishes());
    this._onKey = this._onKey.bind(this);
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._refreshDishes();
    this._setMode("carousel");
    window.addEventListener("keydown", this._onKey);
  }

  onExit() {
    window.removeEventListener("keydown", this._onKey);
  }

  // Allow main.js to dispose subscriptions if the scene is ever destroyed.
  destroy() {
    this._unsubscribe?.();
  }

  // ---------- build: top bar ----------

  _buildTopBar() {
    this.backBtn = new Container();
    this.backBtn.label = "BackBtn";
    this.backBtn.position.set(BACK_BTN.cx, BACK_BTN.cy);
    this._backBtnBg = new Graphics();
    const arrow = new Graphics();
    arrow
      .moveTo(7, -8)
      .lineTo(-7, 0)
      .lineTo(7, 8)
      .stroke({ color: COLORS.ink, width: 2 });
    this.backBtn.addChild(this._backBtnBg, arrow);
    this._drawBackBtn();

    this.titleText = new Text({
      text: "Mapo Tofu Collection",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "700",
        fontSize: 40,
        fill: COLORS.titleRed,
      }),
    });
    this.titleText.anchor.set(0, 0.5);
    this.titleText.position.set(TITLE.x, TITLE.cy);

    this.uiLayer.addChild(this.backBtn, this.titleText);
  }

  _drawBackBtn() {
    this._backBtnBg
      .clear()
      .circle(0, 0, BACK_BTN.r)
      .fill(this._hover === "back" ? COLORS.yellowBtnHover : COLORS.yellowBtn);
  }

  // ---------- build: carousel view ----------

  _buildCarouselView() {
    // Cards container — children are individual dish cards laid out at
    // local x = i * CARD_STEP. The container.x is animated so the
    // currently-centered card sits at CANVAS.w / 2.
    this.cardsContainer = new Container();
    this.cardsContainer.position.set(this._carouselX, 0);
    // Hovered/centered cards bump zIndex so their scaled-up edges
    // overlap neighbors instead of getting clipped by them.
    this.cardsContainer.sortableChildren = true;

    // Mask the carousel to the design canvas so peeking cards don't
    // bleed past the viewport into letterbox margins.
    const mask = new Graphics().rect(0, 0, CANVAS.w, CANVAS.h).fill(0xffffff);
    this.carouselLayer.addChild(mask);
    this.cardsContainer.mask = mask;
    this.carouselLayer.addChild(this.cardsContainer);

    // Left / right nav arrows
    this.leftArrowBtn = this._makeArrowButton("left");
    this.leftArrowBtn.position.set(ARROW_BTN.leftX, ARROW_BTN.y);
    this.rightArrowBtn = this._makeArrowButton("right");
    this.rightArrowBtn.position.set(ARROW_BTN.rightX, ARROW_BTN.y);
    this.carouselLayer.addChild(this.leftArrowBtn, this.rightArrowBtn);

    // Bottom prompt
    this.bottomPrompt = new Text({
      text: "Click to view their recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: 40,
        fill: COLORS.titleRed,
      }),
    });
    this.bottomPrompt.anchor.set(0.5, 0.5);
    this.bottomPrompt.position.set(BOTTOM_PROMPT.cx, BOTTOM_PROMPT.y);
    this.carouselLayer.addChild(this.bottomPrompt);

    // Empty-state label (hidden unless dishes is empty)
    this.emptyLabel = new Text({
      text: "No dishes yet — cook your first Mapo Tofu!",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: 32,
        fill: COLORS.titleRed,
        align: "center",
      }),
    });
    this.emptyLabel.anchor.set(0.5, 0.5);
    this.emptyLabel.position.set(CANVAS.w / 2, CANVAS.h / 2);
    this.emptyLabel.visible = false;
    this.carouselLayer.addChild(this.emptyLabel);
  }

  _makeArrowButton(direction) {
    const c = new Container();
    c.label = `ArrowBtn-${direction}`;
    const bg = new Graphics().circle(0, 0, ARROW_BTN.r).fill(COLORS.yellowBtn);
    const arrow = new Graphics();
    if (direction === "left") {
      arrow
        .moveTo(8, -10)
        .lineTo(-6, 0)
        .lineTo(8, 10)
        .stroke({ color: COLORS.ink, width: 3 });
    } else {
      arrow
        .moveTo(-8, -10)
        .lineTo(6, 0)
        .lineTo(-8, 10)
        .stroke({ color: COLORS.ink, width: 3 });
    }
    c.addChild(bg, arrow);
    c._bg = bg;
    return c;
  }

  // ---------- build: detail view ----------

  _buildDetailView() {
    this.detailLayer.visible = false;

    // Header text (set per dish in _showDetailFor)
    this.detailHeader = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "600",
        fontSize: 32,
        fill: COLORS.titleRed,
        align: "center",
      }),
    });
    this.detailHeader.anchor.set(0.5, 0);
    this.detailHeader.position.set(DETAIL_HEADER.cx, DETAIL_HEADER.y);

    this.detailSubHeader = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "400",
        fontSize: 20,
        fill: COLORS.brown,
        align: "center",
      }),
    });
    this.detailSubHeader.anchor.set(0.5, 0);
    this.detailSubHeader.position.set(DETAIL_HEADER.cx, DETAIL_HEADER.y + 48);

    // Left card frame
    const leftBg = new Graphics()
      .roundRect(DETAIL_LEFT.x, DETAIL_LEFT.y, DETAIL_LEFT.w, DETAIL_LEFT.h, DETAIL_LEFT.r)
      .fill({ color: COLORS.cardBg, alpha: 0.85 })
      .stroke({ color: COLORS.cardBorder, width: 1 });

    this.detailDishSprite = new Sprite();
    this.detailDishSprite.anchor.set(0.5);
    this.detailDishSprite.position.set(
      DETAIL_LEFT.x + DETAIL_LEFT.w / 2,
      DETAIL_LEFT.y + DETAIL_LEFT.h / 2
    );
    this.detailDishSprite.visible = false;

    // Right card (outer + inner frames)
    const rightOuter = new Graphics()
      .roundRect(DETAIL_RIGHT.x, DETAIL_RIGHT.y, DETAIL_RIGHT.w, DETAIL_RIGHT.h, DETAIL_RIGHT.r)
      .fill({ color: COLORS.rightOuterBg, alpha: 0.9 })
      .stroke({ color: COLORS.rightOuterBorder, width: 2 });
    const rightInner = new Graphics()
      .roundRect(DETAIL_INNER.x, DETAIL_INNER.y, DETAIL_INNER.w, DETAIL_INNER.h, DETAIL_INNER.r)
      .fill(COLORS.rightInnerBg);

    this.detailRecipeHeading = new Text({
      text: "Mapo Tofu Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: 20,
        fill: COLORS.brown,
        letterSpacing: -0.02 * 20,
      }),
    });
    this.detailRecipeHeading.anchor.set(0.5, 0);
    this.detailRecipeHeading.position.set(DETAIL_HEADING.cx, DETAIL_HEADING.y);

    // Container holding the per-dish ingredient rows; rebuilt each detail enter.
    this.detailListContainer = new Container();
    const listMask = new Graphics()
      .rect(DETAIL_LIST.x - 12, DETAIL_LIST.y - 12, DETAIL_LIST.w + 24, DETAIL_LIST.h + 24)
      .fill(0xffffff);
    this.detailListContainer.mask = listMask;

    this.detailLayer.addChild(
      leftBg,
      this.detailDishSprite,
      rightOuter,
      rightInner,
      this.detailHeader,
      this.detailSubHeader,
      this.detailRecipeHeading,
      listMask,
      this.detailListContainer
    );
  }

  // ---------- data refresh ----------

  _refreshDishes() {
    const all = cookingStore.getState().savedDishes ?? [];
    // Newest first; tolerate missing createdAt by treating it as oldest.
    const sorted = [...all].sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
    );
    this._dishes = sorted;

    // Clamp index to bounds before rebuilding cards
    if (this._index >= sorted.length) this._index = Math.max(0, sorted.length - 1);

    this._rebuildCards();
    this._setCarouselTarget(this._index, /*instant*/ true);
    this._updateArrowVisibility();
    this.emptyLabel.visible = sorted.length === 0;
    this.bottomPrompt.visible = sorted.length > 0;
  }

  _rebuildCards() {
    // Clear previous
    for (const c of this._cardSprites) {
      c.destroy({ children: true });
    }
    this._cardSprites = [];
    this.cardsContainer.removeChildren();

    this._dishes.forEach((dish, i) => {
      const card = this._buildCardSprite(dish);
      // Local x positions card centers at i * CARD_STEP. The container's
      // x is then animated so that the desired index sits at CANVAS.w/2.
      card.position.set(i * CARD_STEP, CARD_CENTER_Y);
      card._dishId = dish.id;
      card._dishIndex = i;
      this.cardsContainer.addChild(card);
      this._cardSprites.push(card);
    });
  }

  _buildCardSprite(dish) {
    const card = new Container();
    card.label = `Card-${dish.id}`;
    card.scale.set(CARD_SCALE_BASE);
    card.zIndex = 0;

    // Background — rounded rect centered at (0, 0)
    const bg = new Graphics()
      .roundRect(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, CARD.r)
      .fill({ color: COLORS.cardBg, alpha: 0.85 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    card.addChild(bg);

    // PLACEHOLDER: replace with Gemini-generated image URL stored on
    // each saved dish (dish.imageUrl). Falls back to MapoTofuillustration.png
    // when imageUrl is missing or fails to load.
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.position.set(0, -CARD.h / 2 + 60 + DISH_BOX.h / 2);
    sprite.visible = false;
    card.addChild(sprite);
    this._loadSpriteFitted(sprite, dish.imageUrl, DISH_BOX);

    // Dish name
    const name = new Text({
      text: dish.dishName || "Untitled",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "600",
        fontSize: 24,
        fill: COLORS.titleRed,
        align: "center",
        wordWrap: true,
        wordWrapWidth: CARD.w - 60,
      }),
    });
    name.anchor.set(0.5, 0);
    name.position.set(0, -CARD.h / 2 + 60 + DISH_BOX.h + 40);
    card.addChild(name);

    // Creation time
    const time = new Text({
      text: formatRelativeTime(dish.createdAt),
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "400",
        fontSize: 16,
        fill: COLORS.brown,
      }),
    });
    time.anchor.set(0.5, 0);
    time.position.set(0, name.y + name.height + 12);
    card.addChild(time);

    return card;
  }

  // Async-load `url` (or fallback) into `sprite`, fitting aspect-preserved
  // into `box` { w, h }. Hidden until the texture lands so we don't flash
  // a 0-sized sprite.
  async _loadSpriteFitted(sprite, url, box) {
    const tryLoad = async (u) => {
      const tex = await Assets.load(u);
      sprite.texture = tex;
      const tw = tex.width || 1;
      const th = tex.height || 1;
      const ratio = tw / th;
      const boxRatio = box.w / box.h;
      if (ratio > boxRatio) {
        sprite.width = box.w;
        sprite.height = box.w / ratio;
      } else {
        sprite.height = box.h;
        sprite.width = box.h * ratio;
      }
      sprite.visible = true;
    };
    try {
      await tryLoad(url || dishPlaceholderUrl);
    } catch (e) {
      if ((url ?? "") !== "" && url !== dishPlaceholderUrl) {
        try {
          await tryLoad(dishPlaceholderUrl);
        } catch (e2) {
          console.warn("CollectionScene: dish image load failed", e2);
        }
      } else {
        console.warn("CollectionScene: dish image load failed", e);
      }
    }
  }

  // ---------- carousel transitions ----------

  _setCarouselTarget(index, instant = false) {
    const clamped = Math.max(0, Math.min(this._dishes.length - 1, index));
    this._index = clamped;
    this._carouselTargetX = CANVAS.w / 2 - clamped * CARD_STEP;
    if (instant) {
      this._carouselX = this._carouselTargetX;
      this.cardsContainer.position.x = this._carouselX;
    }
    this._updateArrowVisibility();
  }

  _updateArrowVisibility() {
    const n = this._dishes.length;
    this.leftArrowBtn.visible = n > 1 && this._index > 0;
    this.rightArrowBtn.visible = n > 1 && this._index < n - 1;
  }

  // ---------- mode switching ----------

  _setMode(mode) {
    this._mode = mode;
    this.carouselLayer.visible = mode === "carousel";
    this.detailLayer.visible = mode === "detail";
  }

  _showDetailFor(dish) {
    if (!dish) return;
    // Header line(s): name on row 1, "by Creator · Date" on row 2 (or just "· Date")
    const dateLabel = formatRelativeTime(dish.createdAt);
    this.detailHeader.text = dish.dishName || "Untitled";
    const sub = dish.userName
      ? `by ${dish.userName}  ·  ${dateLabel}`
      : dateLabel;
    this.detailSubHeader.text = sub;

    // Dish image
    this._loadSpriteFitted(this.detailDishSprite, dish.imageUrl, DETAIL_DISH_BOX);

    // Recipe rows
    this.detailListContainer.removeChildren();
    const ingredients = dish.ingredients ?? [];
    const rowGap = 14;
    const rowHeight = 32;
    let y = DETAIL_LIST.y;
    ingredients.forEach((ing, i) => {
      const label = new Text({
        text: ing.name ?? String(ing),
        style: new TextStyle({
          fontFamily: FONT.mono,
          fontWeight: "500",
          fontSize: 20,
          fill: COLORS.brown,
          letterSpacing: -0.02 * 20,
        }),
      });
      label.anchor.set(0.5, 0);
      label.position.set(DETAIL_LIST.x + DETAIL_LIST.w / 2, y);
      this.detailListContainer.addChild(label);
      y += rowHeight;

      if (i < ingredients.length - 1) {
        const divider = new Graphics()
          .moveTo(DETAIL_LIST.x + 20, y + rowGap / 2)
          .lineTo(DETAIL_LIST.x + DETAIL_LIST.w - 20, y + rowGap / 2)
          .stroke({ color: COLORS.divider, width: 1 });
        this.detailListContainer.addChild(divider);
      }
      y += rowGap;
    });

    this._setMode("detail");
  }

  // ---------- pointer / keyboard ----------

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
    const { x, y, isDown, source } = state;
    const p = this._toDesign(x, y);

    // Keep dwell-eligible buttons in sync with current mode + which
    // arrows are visible at the carousel boundaries.
    this._syncButtonEnable();
    this.buttons?.pointerMove({ x: p.x, y: p.y, source });

    if (p.x == null) {
      this._setHover(null);
      this._hoveredCardIndex = null;
      return;
    }

    if (this._dragging && isDown) {
      const dx = x - this._dragStart.x;
      const dy = y - this._dragStart.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) this._dragMoved = true;
      // Live-track during drag (only in carousel mode + only when the
      // press started on the card area, not on a button).
      if (this._mode === "carousel" && this._dragHit?.kind === "cardArea") {
        const designDx = dx / this._scale;
        this._carouselX = this._dragStart.carouselX + designDx;
        this.cardsContainer.position.x = this._carouselX;
        // Suppress card-level hover while drag-scrolling so cards don't
        // bounce in scale as they slide under the cursor.
        this._hoveredCardIndex = null;
      }
      return;
    }

    // Hover state (cheap, no harm if mode-irrelevant)
    if (this._inCircle(p.x, p.y, BACK_BTN.cx, BACK_BTN.cy, BACK_BTN.r + 8)) {
      this._setHover("back");
    } else if (
      this._mode === "carousel" &&
      this.leftArrowBtn.visible &&
      this._inCircle(p.x, p.y, ARROW_BTN.leftX, ARROW_BTN.y, ARROW_BTN.r + 8)
    ) {
      this._setHover("left");
    } else if (
      this._mode === "carousel" &&
      this.rightArrowBtn.visible &&
      this._inCircle(p.x, p.y, ARROW_BTN.rightX, ARROW_BTN.y, ARROW_BTN.r + 8)
    ) {
      this._setHover("right");
    } else {
      this._setHover(null);
    }

    // Track which card (if any) the pointer is over so the update loop
    // can elevate it. Only meaningful in carousel mode.
    if (this._mode === "carousel") {
      this._hoveredCardIndex = this._cardIndexAt(p.x, p.y);
    } else {
      this._hoveredCardIndex = null;
    }
  }

  onPointerDown(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);
    if (p.x == null) return;

    this._syncButtonEnable();

    // Mouse path: back + arrows fire instantly; card clicks go through
    // the existing drag-detect logic below so mouse drag-scroll keeps
    // working. Hand path: nothing fires here — dwell in pointerMove
    // handles all hand presses.
    if (this.buttons?.pointerDown({ x: p.x, y: p.y, source })) return;
    if (source !== "mouse") return;

    this._dragging = true;
    this._dragMoved = false;
    this._dragStart = { x, y, carouselX: this._carouselX };

    if (this._mode === "carousel") {
      // Back/arrows already handled by HandButtonDwell.pointerDown above
      // for mouse — fall through to the card-area drag handling.
      this._dragHit = { kind: "cardArea", index: this._cardIndexAt(p.x, p.y) };
      return;
    }

    // Detail mode: only the back button is interactive (already handled).
    this._dragHit = null;
  }

  // Flip dwell-button availability based on the current view + which
  // carousel arrows are visible. Called from pointerMove/Down so it's
  // always up-to-date before the helper inspects buttons.
  _syncButtonEnable() {
    if (!this.buttons) return;
    const inCarousel = this._mode === "carousel";
    this.buttons.setEnabled("leftArrow", inCarousel && this.leftArrowBtn.visible);
    this.buttons.setEnabled("rightArrow", inCarousel && this.rightArrowBtn.visible);
    this.buttons.setEnabled("centeredCard", inCarousel && this._dishes.length > 0);
  }

  onPointerUp({ x, y } = {}) {
    if (!this._dragging) return;
    this._dragging = false;

    const hit = this._dragHit;
    this._dragHit = null;

    if (!hit) return;

    if (hit.kind === "cardArea") {
      if (this._dragMoved) {
        // Snap to the nearest card based on the dragged offset.
        const offset = CANVAS.w / 2 - this._carouselX;
        const targetIndex = Math.round(offset / CARD_STEP);
        this._setCarouselTarget(targetIndex);
      } else if (hit.index != null && this._dishes[hit.index]) {
        // It was a click on a card — open detail only if the clicked card
        // is the centered one (matching common carousel UX where edges
        // require a navigation tap first).
        if (hit.index === this._index) {
          this._showDetailFor(this._dishes[hit.index]);
        } else {
          this._setCarouselTarget(hit.index);
        }
      }
      return;
    }
  }

  _onKey(e) {
    if (e.key === "Escape") {
      if (this._mode === "detail") {
        e.preventDefault();
        this._setMode("carousel");
      }
      return;
    }
    if (this._mode !== "carousel") return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      this._setCarouselTarget(this._index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      this._setCarouselTarget(this._index + 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const dish = this._dishes[this._index];
      if (dish) this._showDetailFor(dish);
    }
  }

  update() {
    // Smooth carousel snap
    if (Math.abs(this._carouselX - this._carouselTargetX) > 0.5) {
      this._carouselX += (this._carouselTargetX - this._carouselX) * SNAP_LERP;
      this.cardsContainer.position.x = this._carouselX;
    } else if (this._carouselX !== this._carouselTargetX) {
      this._carouselX = this._carouselTargetX;
      this.cardsContainer.position.x = this._carouselX;
    }

    // Per-card hierarchy: centered card and hovered card both rise to
    // CARD_SCALE_ELEVATED. Everyone else eases back to base. Only the
    // raised cards get zIndex=1 so their scaled edges aren't clipped.
    const elevatedCenter = this._mode === "carousel" ? this._index : -1;
    const elevatedHover =
      this._mode === "carousel" ? this._hoveredCardIndex : null;
    for (let i = 0; i < this._cardSprites.length; i++) {
      const card = this._cardSprites[i];
      const isElevated = i === elevatedCenter || i === elevatedHover;
      const target = isElevated ? CARD_SCALE_ELEVATED : CARD_SCALE_BASE;
      const cur = card.scale.x;
      if (Math.abs(cur - target) > 0.001) {
        const next = cur + (target - cur) * CARD_SCALE_LERP;
        card.scale.set(next);
      } else if (cur !== target) {
        card.scale.set(target);
      }
      card.zIndex = isElevated ? 1 : 0;
    }
  }

  getPointerDwell() {
    return this.buttons?.getDwellProgress() ?? 0;
  }
  getState() {
    return { grabbedId: null, basketCount: 0 };
  }

  // ---------- helpers ----------

  _toDesign(x, y) {
    if (x == null || y == null) return { x: null, y: null };
    return {
      x: (x - this.root.x) / this._scale,
      y: (y - this.root.y) / this._scale,
    };
  }

  _inCircle(px, py, cx, cy, r) {
    return Math.hypot(px - cx, py - cy) <= r;
  }

  // True when the design-space point is inside the currently-centered
  // carousel card. Used by HandButtonDwell so dwelling on the focused
  // card opens its detail view (mirrors the mouse "click centered card"
  // behavior).
  _isOverCenteredCard(px, py) {
    if (this._mode !== "carousel") return false;
    if (!this._dishes.length) return false;
    const cx = this._carouselX + this._index * CARD_STEP;
    return (
      px >= cx - CARD.w / 2 &&
      px <= cx + CARD.w / 2 &&
      py >= CARD_CENTER_Y - CARD.h / 2 &&
      py <= CARD_CENTER_Y + CARD.h / 2
    );
  }

  // Which card is at design coordinates (px, py)? Returns index or null.
  // Cards are at card_local_x = i * CARD_STEP, container_x = this._carouselX,
  // so a card's screen-design center is carouselX + i * CARD_STEP, CARD_CENTER_Y.
  _cardIndexAt(px, py) {
    if (
      py < CARD_CENTER_Y - CARD.h / 2 ||
      py > CARD_CENTER_Y + CARD.h / 2
    ) return null;
    for (let i = 0; i < this._dishes.length; i++) {
      const cx = this._carouselX + i * CARD_STEP;
      if (px >= cx - CARD.w / 2 && px <= cx + CARD.w / 2) return i;
    }
    return null;
  }

  _setHover(name) {
    if (this._hover === name) return;
    this._hover = name;
    this._drawBackBtn();
    // Arrow buttons could also have hover treatments — kept simple here.
  }
}

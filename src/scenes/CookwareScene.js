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
import { HandButtonDwell } from "../input/HandButtonDwell.js";
import { HandHoverPicker } from "../input/HandHoverPicker.js";
import {
  buttonClick,
  itemPickup,
  itemRejected,
  cookwareLand,
} from "../audio/soundEngine.js";

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

// Snap target for the dropped cookware — the burner center, in design coords.
// Cookware bodies should land here; handles extend below per onStove.cy.
const BURNER = { cx: STOVE_REF.burnerX, cy: STOVE_REF.burnerY };

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

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class CookwareScene {
  // bg-blue uses backgroundblue.png with `background-size: cover` so the
  // checkered pattern fills the viewport at any size — no Pixi-drawn grid.
  static bgClass = "bg-blue";
  bgClass = "bg-blue";

  constructor({ onBack, onContinue, onRecipe } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onContinue = onContinue ?? (() => {});
    this.onRecipe = onRecipe ?? (() => {});

    this.root = new Container();
    this.root.label = "CookwareScene";

    // No gridLayer — body.bg-blue PNG provides the checkered backdrop.
    this.cardsLayer = new Container();
    this.stoveLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(
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

    this._buildTopBar();
    this._buildHeadline();
    this._buildStove();
    this._buildOnStoveSprite();
    this._buildCards();
    this._buildStartButton();

    // Hand-hover-to-press for every clickable button. Mouse users still
    // get instant clicks via pointerDown.
    this.buttons = new HandButtonDwell();
    this.buttons.register(
      "back",
      (x, y) => this._inCircle(x, y, this.backBtn, 32),
      () => {
        buttonClick();
        this.onBack();
      }
    );
    this.buttons.register(
      "recipe",
      (x, y) => this._inRecipeBtn(x, y),
      () => {
        buttonClick();
        this.onRecipe();
      }
    );
    this.buttons.register(
      "start",
      (x, y) => this._inStartBtn(x, y),
      () => {
        if (!this._onStoveId) return;
        buttonClick();
        cookingStore.setSelectedCookware(this._onStoveId);
        this.onContinue();
      }
    );

    // Hover-to-pick: 3s of hover over a cookware card triggers grab.
    // Skip the card already on the stove.
    this.cardPicker = new HandHoverPicker({
      getHoveredTarget: (x, y) => {
        const card = this._cardAt(x, y);
        if (!card || card.id === this._onStoveId || !card.sprite.texture)
          return null;
        return card;
      },
      onPick: (card, x, y) => this._grab(card, x, y, "hand"),
    });

    // Reverse-drag picker: hover for 1s on the stove (when something
    // is already on it) to lift the placed cookware off. Drag outside
    // the stove → returns to its source card; drag stays inside → cancel.
    this.stovePicker = new HandHoverPicker({
      getHoveredTarget: (x, y) => {
        if (!this._onStoveId) return null;
        if (!this._overStove(x, y)) return null;
        // Stable identifier so HandHoverPicker's anti-repeat lock works.
        return this._onStoveId;
      },
      onPick: (_id, x, y) => this._grabFromStove(x, y, "hand"),
    });
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._onStoveId = cookingStore.getState().selectedCookware ?? null;
    this._renderState();
  }

  onExit() {}

  setRecipeOpen(open) {
    if (!this.recipeLabel) return;
    this.recipeLabel.text = open ? "Hide Recipe" : "Traditional Recipe";
  }

  // ---------- build ----------

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

    this.recipeLabel = new Text({
      text: "Traditional Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 20,
        fontWeight: "500",
        fill: COLORS.brown,
      }),
    });
    this.recipeLabel.anchor.set(0, 0.5);
    this.recipeLabel.position.set(-RECIPE_BTN.w / 2 + 70, 0);

    this.recipeBtn.addChild(this.recipeBtnBg, icon, this.recipeLabel);
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
    // Soft yellow halo, hidden until drag-over. The breathing pulse is
    // driven via container alpha + scale in update().
    this.stoveGlow = new Graphics()
      .ellipse(0, 0, STOVE.w / 2 + 30, 130)
      .fill({ color: COLORS.yellowBtn, alpha: 0.6 });
    this.stoveGlow.filters = [new BlurFilter({ strength: 32 })];
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
      this.headlineText.visible = false;
    } else {
      this.onStoveSprite.visible = false;
      this._restoreAllCards();
      this.headlineText.visible = true;
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
        this.onStoveSprite.rotation = ((os.rotation || 0) * Math.PI) / 180;
        // Snap to the burner regardless of where the cursor was at drop —
        // body sits on the burner, handle hangs below per onStove.cy.
        this.onStoveSprite.position.set(
          BURNER.cx + (os.cx ?? 0),
          BURNER.cy + (os.cy ?? 0)
        );
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

  onPointerMove(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);

    if (this.grabbed) {
      // Hand grab + hand went idle. Same flicker concern as the other
      // scenes; snap back only if the loss persists.
      if (this.grabbed.source === "hand" && source !== "hand") {
        const now = performance.now();
        this._handGoneSince = this._handGoneSince ?? now;
        if (now - this._handGoneSince > 600) {
          if (this.grabbed.kind === "stove") {
            this._cancelStoveGrab(this.grabbed);
          } else {
            this._snapGhostBack(this.grabbed.card, this.grabbed.ghost);
          }
          this.grabbed = null;
          this._handGoneSince = null;
          this._stoveActive = false;
          this.stoveGlow.visible = false;
        }
        return;
      }
      this._handGoneSince = null;
      if (p.x == null) return;
      this.grabbed.ghost.position.set(p.x, p.y);
      const over = this._overStove(p.x, p.y);
      if (over !== this._stoveActive) {
        this._stoveActive = over;
        this.stoveGlow.visible = over;
      }
      if (this.grabbed.kind === "stove") {
        // Reverse drag (stove → card): hand auto-fires put-back the
        // moment the ghost leaves the stove area. Mouse waits for an
        // explicit release.
        if (this.grabbed.source === "hand" && !over) {
          const g = this.grabbed;
          this.grabbed = null;
          this._stoveActive = false;
          this.stoveGlow.visible = false;
          this._putBackStoveCookware(g);
        }
        return;
      }
      // Forward drag (card → stove): hand grab auto-drops on stove
      // entry. Mouse keeps explicit release.
      if (this.grabbed.source === "hand" && over) {
        const { card, ghost } = this.grabbed;
        this.grabbed = null;
        this._stoveActive = false;
        this.stoveGlow.visible = false;
        this._completeStoveDrop(card, ghost);
      }
      return;
    }

    // The start button is only enabled once a cookware sits on the stove.
    this.buttons?.setEnabled("start", !!this._onStoveId);
    this.buttons?.pointerMove({ x: p.x, y: p.y, source });
    this.cardPicker?.pointerMove({ x: p.x, y: p.y, source });
    this.stovePicker?.pointerMove({ x: p.x, y: p.y, source });

    if (p.x == null) {
      this._setStartHovered(false);
      this._setRecipeHovered(false);
      return;
    }
    this._setStartHovered(!!this._onStoveId && this._inStartBtn(p.x, p.y));
    this._setRecipeHovered(this._inRecipeBtn(p.x, p.y));
  }

  onPointerDown(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);
    if (p.x == null) return;

    this.buttons?.setEnabled("start", !!this._onStoveId);
    if (this.buttons?.pointerDown({ x: p.x, y: p.y, source })) return;

    // Mouse click-to-grab. Hand grabs via hover dwell instead.
    if (source !== "mouse") return;

    // Reverse drag: a click anywhere on the stove (when something is
    // on it) lifts that cookware first — wins over any underlying card.
    if (this._onStoveId && this._overStove(p.x, p.y)) {
      this._grabFromStove(p.x, p.y, "mouse");
      return;
    }

    const card = this._cardAt(p.x, p.y);
    if (!card) return;
    if (card.id === this._onStoveId) return;
    if (!card.sprite.texture) return;
    this._grab(card, p.x, p.y, "mouse");
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const g = this.grabbed;
    this.grabbed = null;
    this._stoveActive = false;
    this.stoveGlow.visible = false;

    const p = this._toDesign(x, y);

    // Reverse drag (stove → card): release outside stove = put back to
    // its source card slot (stove empties); release inside stove =
    // cancel (the cookware just settles back onto the burner).
    if (g.kind === "stove") {
      if (cancelled || p.x == null || !this._overStove(p.x, p.y)) {
        this._putBackStoveCookware(g);
      } else {
        this._cancelStoveGrab(g);
      }
      return;
    }

    // Forward drag (card → stove): existing behavior unchanged.
    const { card, ghost } = g;
    if (cancelled || p.x == null || !this._overStove(p.x, p.y)) {
      this._snapGhostBack(card, ghost);
      return;
    }
    this._completeStoveDrop(card, ghost);
  }

  // The successful-drop path, factored out so both mouse release and
  // hand auto-drop on stove entry land here.
  _completeStoveDrop(card, ghost) {
    // Swapping out a previous cookware → bloop the displaced one
    // before clanging the new one onto the burner.
    if (this._onStoveId && this._onStoveId !== card.id) {
      itemRejected();
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
    cookwareLand();
  }

  getPointerDwell() {
    return Math.max(
      this.buttons?.getDwellProgress() ?? 0,
      this.cardPicker?.getDwellProgress() ?? 0,
      this.stovePicker?.getDwellProgress() ?? 0
    );
  }
  getState() {
    return { grabbedId: this.grabbed?.card?.id ?? null, basketCount: 0 };
  }
  update(now) {
    if (this.stoveGlow.visible) {
      const t = (now ?? performance.now()) / 1000;
      const wave = (Math.sin(t * 4) + 1) / 2;
      this.stoveGlow.alpha = 0.7 + wave * 0.3;
      const s = 1.0 + 0.05 * wave;
      this.stoveGlow.scale.set(s);
    }
  }

  // ---------- drag helpers ----------

  _grab(card, designX, designY, source = "mouse") {
    itemPickup();
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

    this.grabbed = { card, ghost, source, kind: "card" };
  }

  // Lift the cookware that's currently on the stove back into a
  // follow-the-cursor ghost. The on-stove sprite is hidden (not
  // destroyed) for the duration of the drag — if the player drops
  // back on the stove we just restore visibility, no swap.
  _grabFromStove(designX, designY, source = "mouse") {
    if (!this._onStoveId) return;
    const card = this.cards.get(this._onStoveId);
    if (!card || !card.sprite.texture) return;
    itemPickup();

    this.onStoveSprite.visible = false;

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

    this.grabbed = { card, ghost, source, kind: "stove" };
  }

  // Commit a stove → card reverse drag: empty the stove, restore the
  // card visually, snap the ghost back to its slot, and clear the
  // selectedCookware in the shared store so the Start button re-greys.
  // Caller is responsible for clearing this.grabbed first.
  _putBackStoveCookware(g) {
    const { card, ghost } = g;
    const removedId = this._onStoveId;

    this._onStoveId = null;
    this.onStoveSprite.visible = false;
    card.frame.alpha = 1;
    card.label.alpha = 1;
    card.sprite.visible = true;

    this._snapGhostBack(card, ghost);
    this._drawStartBtn();

    if (cookingStore.getState().selectedCookware === removedId) {
      cookingStore.setSelectedCookware(null);
    }
  }

  // Cancel a stove reverse drag: just put the on-stove sprite back and
  // toss the ghost. No state mutation — _onStoveId stays as it was.
  _cancelStoveGrab(g) {
    this.onStoveSprite.visible = true;
    g.ghost.parent?.removeChild(g.ghost);
    g.ghost.destroy({ children: true });
  }

  _snapGhostBack(card, ghost) {
    itemRejected();
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

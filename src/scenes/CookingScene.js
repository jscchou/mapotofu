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
import { cookingStore } from "../cooking/cookingStore.js";
import { findCookware, STOVE_REF } from "../data/cookware.js";

// Scene 5 — Cooking Station.
// Most elements are still wireframe (lid, fire slider, recipe card frame) —
// drop in real assets later. The "pot" itself is now the stove + the cookware
// the user picked in Scene 4 (wok fallback if nothing selected).

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
  cardBg: 0xfffef6,
  cardBorder: 0xffd900,
  yellowBtn: 0xffdb00,
  yellowBtnHover: 0xffe633,
  arrow: 0x000000,
  outline: 0x333333,
  potFill: 0xfdf6e6,
  lidFill: 0xfff3c4,
  trackBg: 0xb8b8b8,
  trackInk: 0x444444,
  thumbFill: 0xffdb00,
  fireActiveTick: 0xd96a3a,
  usedTileTint: 0xc7beb0,
  basketGlow: 0xffdb00,
  labelBrown: 0x4e2700,
};

const FIRE_LEVELS = ["off", "low", "medium", "high"];

// ---------- helpers ----------

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

function formatMMSS(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ---------- layout ----------

const TOP_BAR_H = 120;

const POT = {
  cx: 912,
  cy: 460,
  w: 360,
  h: 280,
};

const SLIDER = {
  trackX0: POT.cx - 220,
  trackX1: POT.cx + 220,
  y: 720,
  thumbR: 14,
};

const TIMER = { cx: POT.cx, y: 180 };

const LID_HOME = { x: POT.cx + 320, y: POT.cy - 80, w: 160, h: 60 };

const COOKED_BTN = { cx: POT.cx, cy: 850, w: 220, h: 70, r: 35 };

const TILE = { size: 110, radius: 22, gap: 18 };
const TILE_LABEL_GAP = 8;

const RECIPE_CARD = {
  x: 1370,
  y: 140,
  w: 524,
  h: 900,
};

// ---------- scene ----------

export class CookingScene {
  static bgClass = "bg-blue";
  bgClass = "bg-blue";

  constructor({ onBack, onCooked } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onCooked = onCooked ?? (() => {});

    this.root = new Container();
    this.root.label = "CookingScene";

    this.bgLayer = new Container();
    this.itemsLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(
      this.bgLayer,
      this.itemsLayer,
      this.uiLayer,
      this.dragLayer
    );

    this.tiles = new Map();
    this.grabbed = null; // { type: 'ingredient'|'lid'|'slider', ...payload }
    this._scale = 1;
    this._potActive = false;

    this._buildBackground();
    this._buildTopBar();
    this._buildLeftHeader();
    this._buildCenter();
    this._buildRightCard();
    this._buildCookedButton();

    this._unsub = cookingStore.subscribe(() => this._onStoreUpdate());
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._clearTiles();
    this._buildIngredientTiles();
    this._loadStoveAndCookware();
    this._onStoreUpdate();
    this._refreshLidVisual();
    this._refreshCookedButton();
  }

  onExit() {
    // Keep store; subscription cleared on full destroy. If we re-enter, we
    // re-render from store state.
  }

  destroy() {
    this._unsub?.();
  }

  // ---------- build ----------

  _buildBackground() {
    // The CSS body provides the blue checkered bg; Pixi canvas is transparent.
    // Just draw a faint card for the left column (header strip).
    const left = new Graphics()
      .roundRect(24, 140, 432, 900, 18)
      .fill({ color: COLORS.cardBg, alpha: 0.92 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    this.bgLayer.addChild(left);
  }

  _buildTopBar() {
    this.backBtn = new Container();
    this.backBtn.label = "BackBtn";
    this.backBtn.position.set(57 + 23, 60 + 23);
    const bg = new Graphics().circle(0, 0, 23).fill(COLORS.yellowBtn);
    const arrow = new Graphics();
    arrow
      .moveTo(7, -8)
      .lineTo(-7, 0)
      .lineTo(7, 8)
      .stroke({ color: COLORS.arrow, width: 2 });
    this.backBtn.addChild(bg, arrow);

    this.titleText = new Text({
      text: "Mapo Tofu, Maybe",
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
    this.titleText.position.set(140, 60 + 22);

    this.uiLayer.addChild(this.backBtn, this.titleText);
  }

  _buildLeftHeader() {
    this.leftHeader = new Text({
      text: "Your Ingredients",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 22,
        fontWeight: "500",
        fill: COLORS.titleRed,
      }),
    });
    this.leftHeader.position.set(56, 168);
    this.uiLayer.addChild(this.leftHeader);
  }

  _buildCenter() {
    // Timer
    this.timerText = new Text({
      text: "00:00",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontWeight: "700",
        fontSize: 56,
        fill: COLORS.ink,
      }),
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.position.set(TIMER.cx, TIMER.y);
    this.uiLayer.addChild(this.timerText);

    // Cooking surface = stove + the cookware the user picked in Scene 4.
    // Both sprites are children of `this.pot` so existing positioning and
    // hit-test logic (POT.cx/cy, _inPot, etc.) keeps working.
    this.pot = new Container();
    this.pot.label = "Pot";
    this.pot.position.set(POT.cx, POT.cy);

    this.potGlow = new Graphics()
      .roundRect(-POT.w / 2 - 8, -POT.h / 2 - 8, POT.w + 16, POT.h + 16, 36)
      .fill({ color: COLORS.basketGlow, alpha: 0.35 });
    this.potGlow.filters = [new BlurFilter({ strength: 18 })];
    this.potGlow.visible = false;

    this.stoveSprite = new Sprite();
    this.stoveSprite.anchor.set(0.5);
    this.stoveSprite.position.set(0, 30); // bias the stove toward the bottom of the pot box
    this.stoveSprite.visible = false;

    this.cookwareSprite = new Sprite();
    this.cookwareSprite.anchor.set(0.5);
    this.cookwareSprite.position.set(0, -60); // sit on the upper portion (the burner)
    this.cookwareSprite.visible = false;

    // Layer for ingredient sprites added to the pot (small, scattered).
    this.potItemsLayer = new Container();

    this.pot.addChild(
      this.potGlow,
      this.stoveSprite,
      this.cookwareSprite,
      this.potItemsLayer
    );

    // Lid (separate, draggable). Initial position = LID_HOME.
    this.lid = new Container();
    this.lid.label = "Lid";
    this._drawLid();
    this._resetLidPosition();

    // Fire slider
    this.slider = new Container();
    this.slider.label = "FireSlider";
    this._drawSlider();
    this.slider.position.set(0, 0);

    this.itemsLayer.addChild(this.pot, this.slider, this.lid);
  }

  async _loadStoveAndCookware() {
    // Scene 5 sizes the stove smaller than Scene 4's reference. The cookware's
    // onStove transform was authored against STOVE_REF; we scale it down by
    // the ratio of our stove dimensions so the composition reads identically.
    const stoveW5 = POT.w + 20;
    let stoveH5 = (stoveW5 * STOVE_REF.height) / STOVE_REF.width;

    // Stove
    try {
      const stoveTex = await Assets.load(stoveUrl);
      this.stoveSprite.texture = stoveTex;
      const aspect =
        (stoveTex.width || STOVE_REF.width) /
        (stoveTex.height || STOVE_REF.height);
      this.stoveSprite.width = stoveW5;
      this.stoveSprite.height = stoveW5 / aspect;
      stoveH5 = this.stoveSprite.height;
      this.stoveSprite.visible = true;
    } catch (e) {
      console.warn("CookingScene: stove load failed", e);
    }

    // Cookware (from store, fallback to wok if nothing was selected)
    let id = cookingStore.getState().selectedCookware;
    if (!id) {
      console.warn("CookingScene: no cookware selected, falling back to wok");
      id = "wok";
    }
    const cw = findCookware(id);
    if (!cw) return;

    try {
      const tex = await Assets.load(cw.imagePath);
      this.cookwareSprite.texture = tex;

      const os = cw.onStove;
      const wFactor = stoveW5 / STOVE_REF.width;
      const hFactor = stoveH5 / STOVE_REF.height;

      // Apply rotation + scaled size
      this.cookwareSprite.width = os.width * wFactor;
      this.cookwareSprite.height = os.height * wFactor;
      this.cookwareSprite.rotation = ((os.rotation || 0) * Math.PI) / 180;

      // Cookware center offset from Scene 4 stove top-left, scaled down
      const offsetX = os.left + os.width / 2 - STOVE_REF.left;
      const offsetY = os.top + os.height / 2 - STOVE_REF.top;

      // In our pot Container, stove is at child position (0, 30) with anchor
      // (0.5), so its top-left in pot coords is (-stoveW5/2, 30 - stoveH5/2).
      const stoveTLx = -stoveW5 / 2;
      const stoveTLy = 30 - stoveH5 / 2;
      this.cookwareSprite.position.set(
        stoveTLx + offsetX * wFactor,
        stoveTLy + offsetY * hFactor
      );

      this.cookwareSprite.visible = true;
    } catch (e) {
      console.warn(`CookingScene: cookware ${id} load failed`, e);
    }
  }

  _drawLid() {
    this.lid.removeChildren();
    const w = LID_HOME.w;
    const h = LID_HOME.h;
    const body = new Graphics()
      .ellipse(0, 0, w / 2, h / 2)
      .fill(COLORS.lidFill)
      .stroke({ color: COLORS.outline, width: 4 });
    const knob = new Graphics()
      .circle(0, -h / 2 - 4, 8)
      .fill(COLORS.outline);
    const label = new Text({
      text: "Place lid",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 12,
        fontWeight: "500",
        fill: COLORS.muted,
      }),
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, h / 2 + 6);
    this.lid.addChild(body, knob, label);
  }

  _resetLidPosition() {
    this.lid.position.set(LID_HOME.x, LID_HOME.y);
    this.lid.alpha = 1;
  }

  _drawSlider() {
    this.slider.removeChildren();

    const labelText = new Text({
      text: "Fire",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 16,
        fontWeight: "500",
        fill: COLORS.ink,
      }),
    });
    labelText.anchor.set(1, 0.5);
    labelText.position.set(SLIDER.trackX0 - 14, SLIDER.y);

    const track = new Graphics()
      .roundRect(SLIDER.trackX0, SLIDER.y - 3, SLIDER.trackX1 - SLIDER.trackX0, 6, 3)
      .fill(COLORS.trackBg);

    const ticks = new Graphics();
    const positions = this._fireTickPositions();
    const currentLevel = cookingStore.getState().fireLevel;
    FIRE_LEVELS.forEach((level, i) => {
      const x = positions[i];
      const isCurrent = level === currentLevel;
      ticks
        .moveTo(x, SLIDER.y - 12)
        .lineTo(x, SLIDER.y + 12)
        .stroke({
          color: isCurrent ? COLORS.fireActiveTick : COLORS.trackInk,
          width: isCurrent ? 3 : 2,
        });
      const t = new Text({
        text: capitalize(level),
        style: new TextStyle({
          fontFamily: FONT.mono,
          fontSize: 13,
          fontWeight: isCurrent ? "600" : "400",
          fill: isCurrent ? COLORS.fireActiveTick : COLORS.muted,
        }),
      });
      t.anchor.set(0.5, 0);
      t.position.set(x, SLIDER.y + 18);
      this.slider.addChild(t);
    });

    const thumb = new Graphics()
      .circle(0, 0, SLIDER.thumbR)
      .fill(COLORS.thumbFill)
      .stroke({ color: COLORS.outline, width: 2 });
    const idx = FIRE_LEVELS.indexOf(currentLevel);
    thumb.position.set(positions[Math.max(0, idx)], SLIDER.y);
    this._sliderThumb = thumb;

    this.slider.addChild(labelText, track, ticks, thumb);
  }

  _fireTickPositions() {
    const x0 = SLIDER.trackX0;
    const x1 = SLIDER.trackX1;
    return FIRE_LEVELS.map((_, i) => x0 + ((x1 - x0) * i) / (FIRE_LEVELS.length - 1));
  }

  _buildRightCard() {
    this.recipeCard = new Container();
    this.recipeCard.position.set(RECIPE_CARD.x, RECIPE_CARD.y);

    const bg = new Graphics()
      .roundRect(0, 0, RECIPE_CARD.w, RECIPE_CARD.h, 16)
      .fill({ color: COLORS.cardBg, alpha: 0.92 })
      .stroke({ color: COLORS.cardBorder, width: 1 });

    const header = new Text({
      text: "Smart Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 22,
        fontWeight: "500",
        fill: COLORS.titleRed,
      }),
    });
    header.position.set(28, 24);

    this.ingHeader = new Text({
      text: "Ingredients",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 16,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.ingHeader.position.set(28, 80);

    this.ingBody = new Text({
      text: "—",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 14,
        fill: COLORS.labelBrown,
        wordWrap: true,
        wordWrapWidth: RECIPE_CARD.w - 56,
        lineHeight: 22,
      }),
    });
    this.ingBody.position.set(28, 112);

    this.procHeader = new Text({
      text: "Process",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 16,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    // Position is updated dynamically based on ingBody height
    this.procHeader.position.set(28, 200);

    this.procBody = new Text({
      text: "—",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 14,
        fill: COLORS.labelBrown,
        wordWrap: true,
        wordWrapWidth: RECIPE_CARD.w - 56,
        lineHeight: 22,
      }),
    });
    this.procBody.position.set(28, 232);

    this.recipeCard.addChild(
      bg,
      header,
      this.ingHeader,
      this.ingBody,
      this.procHeader,
      this.procBody
    );
    this.uiLayer.addChild(this.recipeCard);
  }

  _buildCookedButton() {
    this.cookedBtn = new Container();
    this.cookedBtn.label = "CookedBtn";
    this.cookedBtn.position.set(COOKED_BTN.cx, COOKED_BTN.cy);
    this.cookedBtn.visible = false;

    this.cookedBg = new Graphics();
    this.cookedLabel = new Text({
      text: "Cooked!",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontSize: 26,
        fontWeight: "700",
        fill: COLORS.titleRed,
      }),
    });
    this.cookedLabel.anchor.set(0.5, 0.5);
    this.cookedBtn.addChild(this.cookedBg, this.cookedLabel);
    this._cookedHovered = false;
    this._drawCookedBtn();

    this.uiLayer.addChild(this.cookedBtn);
  }

  _drawCookedBtn() {
    const { w, h, r } = COOKED_BTN;
    this.cookedBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(this._cookedHovered ? COLORS.yellowBtnHover : COLORS.yellowBtn);
  }

  _refreshCookedButton() {
    this.cookedBtn.visible = !!cookingStore.getState().lidPlaced;
  }

  _refreshLidVisual() {
    if (cookingStore.getState().lidPlaced) {
      // Snap lid onto pot, slightly translucent so the user sees it's settled
      this.lid.position.set(POT.cx, POT.cy - POT.h / 2 + 10);
      this.lid.alpha = 0.95;
    } else {
      this._resetLidPosition();
    }
  }

  // ---------- ingredient tiles ----------

  _clearTiles() {
    for (const tile of this.tiles.values()) {
      tile.container.parent?.removeChild(tile.container);
      tile.container.destroy({ children: true });
    }
    this.tiles.clear();
  }

  _buildIngredientTiles() {
    const items = cookingStore.getState().selectedIngredients;
    const startY = 210;
    let y = startY;
    for (const ing of items) {
      const tile = this._buildTile(ing, 56, y);
      this.tiles.set(ing.id, tile);
      y += TILE.size + TILE_LABEL_GAP + 22 + TILE.gap;
    }
  }

  _buildTile(ingredient, x, y) {
    const c = new Container();
    c.label = `Tile:${ingredient.id}`;
    c.position.set(x, y);

    const bg = new Graphics()
      .roundRect(0, 0, TILE.size, TILE.size, TILE.radius)
      .fill({ color: 0xffffff, alpha: 0.6 })
      .stroke({ color: COLORS.cardBorder, width: 1 });

    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.position.set(TILE.size / 2, TILE.size / 2);
    sprite.visible = false;

    const label = new Text({
      text: ingredient.name,
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 13,
        fontWeight: "500",
        fill: COLORS.labelBrown,
        align: "center",
        wordWrap: true,
        wordWrapWidth: TILE.size + 20,
        lineHeight: 16,
      }),
    });
    label.anchor.set(0.5, 0);
    label.position.set(TILE.size / 2, TILE.size + TILE_LABEL_GAP);

    const overlay = new Graphics()
      .roundRect(0, 0, TILE.size, TILE.size, TILE.radius)
      .fill({ color: 0xffffff, alpha: 0.55 });
    overlay.visible = false;
    const check = new Text({
      text: "✓",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontSize: 30,
        fontWeight: "700",
        fill: 0x4a8a4a,
      }),
    });
    check.anchor.set(0.5);
    check.position.set(TILE.size / 2, TILE.size / 2);
    check.visible = false;

    c.addChild(bg, sprite, overlay, check, label);
    this.itemsLayer.addChild(c);

    const tile = {
      id: ingredient.id,
      name: ingredient.name,
      ingredient,
      container: c,
      sprite,
      overlay,
      check,
      origin: { x, y },
      size: TILE.size,
      used: false,
      hasAsset: !!ingredient.imagePath,
    };

    if (ingredient.imagePath) {
      Assets.load(ingredient.imagePath)
        .then((tex) => {
          sprite.texture = tex;
          if (ingredient.hasBakedBackground) {
            sprite.width = TILE.size - 8;
            sprite.height = TILE.size - 8;
          } else {
            const tw = tex.width || 1;
            const th = tex.height || 1;
            const max = TILE.size - 28;
            const ratio = tw / th;
            if (ratio >= 1) {
              sprite.width = max;
              sprite.height = max / ratio;
            } else {
              sprite.height = max;
              sprite.width = max * ratio;
            }
          }
          sprite.visible = true;
        })
        .catch(() => {});
    }

    return tile;
  }

  _markTileUsed(tile) {
    tile.used = true;
    tile.overlay.visible = true;
    tile.check.visible = true;
    tile.container.alpha = 0.65;
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
      this._handleGrabMove(p.x, p.y);
      return;
    }

    if (p.x == null) {
      this._setCookedHovered(false);
      return;
    }
    this._setCookedHovered(this._inCookedBtn(p.x, p.y));
  }

  onPointerDown({ x, y }) {
    const p = this._toDesign(x, y);
    if (p.x == null) return;

    if (this._inCircle(p.x, p.y, this.backBtn, 32)) {
      this.onBack();
      return;
    }
    if (
      cookingStore.getState().lidPlaced &&
      this._inCookedBtn(p.x, p.y)
    ) {
      this.onCooked();
      return;
    }

    // Lid (only if not yet placed)
    if (!cookingStore.getState().lidPlaced && this._inLid(p.x, p.y)) {
      this.grabbed = {
        type: "lid",
        offsetX: p.x - this.lid.x,
        offsetY: p.y - this.lid.y,
      };
      return;
    }

    // Slider thumb
    if (
      !cookingStore.getState().lidPlaced &&
      this._inSliderThumb(p.x, p.y)
    ) {
      this.grabbed = { type: "slider" };
      this._handleSliderMove(p.x);
      return;
    }

    // Ingredient tile
    if (!cookingStore.getState().lidPlaced) {
      const tile = this._tileAt(p.x, p.y);
      if (tile && !tile.used && tile.hasAsset) {
        this._grabIngredient(tile, p.x, p.y);
      }
    }
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const g = this.grabbed;
    this.grabbed = null;
    this._potActive = false;
    this.potGlow.visible = false;

    const p = this._toDesign(x, y);

    if (g.type === "ingredient") {
      const tile = g.tile;
      const ghost = g.ghost;
      if (cancelled || p.x == null || !this._inPot(p.x, p.y)) {
        this._snapGhostBack(tile, ghost);
      } else {
        this._dropIntoPot(tile, ghost);
      }
      return;
    }

    if (g.type === "lid") {
      if (!cancelled && p.x != null && this._inPot(p.x, p.y)) {
        cookingStore.placeLid();
        this._refreshLidVisual();
        this._refreshCookedButton();
      } else {
        this._resetLidPosition();
      }
      return;
    }

    if (g.type === "slider") {
      // Snap to nearest tick
      if (p.x != null) {
        const level = this._sliderLevelFromX(p.x);
        cookingStore.setFireLevel(level);
      }
      this._drawSlider();
      return;
    }
  }

  getPointerDwell() {
    return 0;
  }

  getState() {
    return {
      grabbedId: this.grabbed?.tile?.id ?? null,
      basketCount: cookingStore.getState().potOrder.length,
    };
  }

  update() {
    // Live timer text
    const s = cookingStore.getState();
    if (s.cookStartedAt) {
      this.timerText.text = formatMMSS(cookingStore.getElapsedSeconds());
    } else {
      this.timerText.text = "00:00";
    }
  }

  // ---------- grab/drop helpers ----------

  _grabIngredient(tile, designX, designY) {
    const ghost = new Container();
    const tex = tile.sprite.texture;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = tile.sprite.width;
    sp.height = tile.sprite.height;
    const shadow = new Graphics()
      .ellipse(0, 12, 36, 8)
      .fill({ color: 0x000000, alpha: 0.25 });
    shadow.filters = [new BlurFilter({ strength: 6 })];
    ghost.addChild(shadow, sp);
    ghost.scale.set(1.1);
    ghost.position.set(designX, designY);
    this.dragLayer.addChild(ghost);
    this.grabbed = { type: "ingredient", tile, ghost };
  }

  _handleGrabMove(designX, designY) {
    if (this.grabbed.type === "ingredient") {
      this.grabbed.ghost.position.set(designX, designY);
      const over = this._inPot(designX, designY);
      if (over !== this._potActive) {
        this._potActive = over;
        this.potGlow.visible = over;
      }
      return;
    }
    if (this.grabbed.type === "lid") {
      this.lid.position.set(
        designX - this.grabbed.offsetX,
        designY - this.grabbed.offsetY
      );
      const over = this._inPot(designX, designY);
      if (over !== this._potActive) {
        this._potActive = over;
        this.potGlow.visible = over;
      }
      return;
    }
    if (this.grabbed.type === "slider") {
      this._handleSliderMove(designX);
      return;
    }
  }

  _handleSliderMove(designX) {
    // Update thumb visually + level live
    const x = Math.max(SLIDER.trackX0, Math.min(SLIDER.trackX1, designX));
    if (this._sliderThumb) this._sliderThumb.position.x = x;
    const level = this._sliderLevelFromX(x);
    cookingStore.setFireLevel(level);
  }

  _sliderLevelFromX(designX) {
    const positions = this._fireTickPositions();
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const d = Math.abs(positions[i] - designX);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return FIRE_LEVELS[bestI];
  }

  _snapGhostBack(tile, ghost) {
    const from = { x: ghost.x, y: ghost.y };
    const to = {
      x: tile.origin.x + tile.size / 2,
      y: tile.origin.y + tile.size / 2,
    };
    this._tween(ghost, from, to, 200, () => {
      ghost.parent?.removeChild(ghost);
      ghost.destroy({ children: true });
    });
  }

  _dropIntoPot(tile, ghost) {
    cookingStore.addToPot({ id: tile.id, name: tile.name });
    this._markTileUsed(tile);

    // Spawn a small persistent sprite in the pot at a scattered spot
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 100;
    const offX = Math.cos(angle) * r;
    const offY = Math.sin(angle) * r * 0.6;

    const tex = tile.sprite.texture;
    const inPot = new Sprite(tex);
    inPot.anchor.set(0.5);
    inPot.width = Math.min(54, tile.sprite.width * 0.55);
    inPot.height = Math.min(54, tile.sprite.height * 0.55);
    inPot.position.set(offX, offY);
    inPot.alpha = 0;
    this.potItemsLayer.addChild(inPot);

    const target = { x: this.pot.x + offX, y: this.pot.y + offY };
    const from = { x: ghost.x, y: ghost.y };
    const start = performance.now();
    const dur = 240;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      ghost.position.set(
        from.x + (target.x - from.x) * e,
        from.y + (target.y - from.y) * e
      );
      const s =
        t < 0.45 ? 1.1 + (1.3 - 1.1) * (t / 0.45) : 1.3 * (1 - (t - 0.45) / 0.55);
      ghost.scale.set(Math.max(0, s));
      ghost.alpha = 1 - Math.max(0, (t - 0.55) / 0.45);
      inPot.alpha = Math.min(1, t * 1.4);
      if (t < 1) requestAnimationFrame(step);
      else {
        ghost.parent?.removeChild(ghost);
        ghost.destroy({ children: true });
        inPot.alpha = 1;
      }
    };
    requestAnimationFrame(step);
  }

  _tween(target, from, to, dur, onDone) {
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      target.position.set(
        from.x + (to.x - from.x) * e,
        from.y + (to.y - from.y) * e
      );
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    };
    requestAnimationFrame(step);
  }

  // ---------- recipe card ----------

  _onStoreUpdate() {
    const s = cookingStore.getState();

    // Ingredients section: "1. Soft Tofu Cubes"
    const ingLines = s.potOrder.map(
      (it, i) => `${i + 1}. ${it.name}`
    );
    this.ingBody.text = ingLines.length ? ingLines.join("\n") : "—";

    // Process: chronological events
    const events = [];
    for (const ing of s.potOrder) {
      events.push({ kind: "ing", ...ing });
    }
    for (const f of s.fireHistory) {
      events.push({ kind: "fire", ...f });
    }
    if (s.lidPlaced && s.cookEndedAt && s.cookStartedAt) {
      events.push({
        kind: "lid",
        t: (s.cookEndedAt - s.cookStartedAt) / 1000,
      });
    }
    events.sort((a, b) => a.t - b.t);

    let firstIngredient = true;
    const lines = [];
    for (const e of events) {
      const ts = formatMMSS(e.t);
      if (e.kind === "ing") {
        if (firstIngredient) {
          lines.push(
            `Heated ${e.name} on ${capitalize(s.fireHistory[0]?.level ?? "off")} fire`
          );
          firstIngredient = false;
        } else {
          lines.push(`Added ${e.name} at ${ts}`);
        }
      } else if (e.kind === "fire") {
        if (e.t === 0) continue; // initial seed; covered by "Heated …" line
        lines.push(`Fire set to ${capitalize(e.level)} at ${ts}`);
      } else if (e.kind === "lid") {
        lines.push(`Lid placed at ${ts}, cook time paused`);
      }
    }
    this.procBody.text = lines.length ? lines.join("\n") : "—";

    // Re-flow the Process header below the Ingredients block
    const procY = this.ingHeader.y + 32 + this.ingBody.height + 12;
    this.procHeader.position.set(28, Math.min(procY, RECIPE_CARD.h - 100));
    this.procBody.position.set(28, this.procHeader.y + 32);

    // Re-draw slider so the active tick highlight tracks store level
    this._drawSlider();
  }

  // ---------- hit tests (design space) ----------

  _toDesign(x, y) {
    if (x == null || y == null) return { x: null, y: null };
    return {
      x: (x - this.root.x) / this._scale,
      y: (y - this.root.y) / this._scale,
    };
  }

  _tileAt(x, y) {
    for (const tile of this.tiles.values()) {
      if (
        x >= tile.origin.x &&
        x <= tile.origin.x + tile.size &&
        y >= tile.origin.y &&
        y <= tile.origin.y + tile.size
      ) {
        return tile;
      }
    }
    return null;
  }

  _inPot(x, y) {
    return pointInRect(x, y, {
      x: POT.cx - POT.w / 2,
      y: POT.cy - POT.h / 2,
      width: POT.w,
      height: POT.h,
    });
  }

  _inLid(x, y) {
    const dx = x - this.lid.x;
    const dy = y - this.lid.y;
    return Math.abs(dx) <= LID_HOME.w / 2 && Math.abs(dy) <= LID_HOME.h / 2 + 8;
  }

  _inSliderThumb(x, y) {
    if (!this._sliderThumb) return false;
    // Generous hit area for hand tracking — easier to grab than the
    // ~14px visible thumb suggests.
    const dx = x - this._sliderThumb.position.x;
    const dy = y - this._sliderThumb.position.y;
    if (Math.hypot(dx, dy) <= SLIDER.thumbR + 16) return true;
    // Also accept anywhere on the track itself
    const onTrackY = Math.abs(y - SLIDER.y) <= 18;
    const onTrackX = x >= SLIDER.trackX0 - 10 && x <= SLIDER.trackX1 + 10;
    return onTrackY && onTrackX;
  }

  _inCircle(x, y, container, radius) {
    const dx = x - container.x;
    const dy = y - container.y;
    return Math.hypot(dx, dy) <= radius;
  }

  _inCookedBtn(x, y) {
    if (!cookingStore.getState().lidPlaced) return false;
    return pointInRect(x, y, {
      x: this.cookedBtn.x - COOKED_BTN.w / 2,
      y: this.cookedBtn.y - COOKED_BTN.h / 2,
      width: COOKED_BTN.w,
      height: COOKED_BTN.h,
    });
  }

  _setCookedHovered(v) {
    if (v === this._cookedHovered) return;
    this._cookedHovered = v;
    this._drawCookedBtn();
  }
}

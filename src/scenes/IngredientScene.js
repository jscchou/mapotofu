import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
  BlurFilter,
} from "pixi.js";
import basketUrl from "../assets/FoodPrepBasket.png";
import { ingredients as INGREDIENT_DATA } from "../data/ingredients.js";
import { HandButtonDwell } from "../input/HandButtonDwell.js";
import { HandHoverPicker } from "../input/HandHoverPicker.js";
import {
  buttonClick,
  buttonDisabled,
  hoverTick,
  itemPickup,
  itemDropBasket,
  itemRejected,
} from "../audio/soundEngine.js";

// ---------- Design canvas ----------
// Everything is laid out in 1920x1080 design coords. The root Container is
// uniformly scaled and centered to fit the actual viewport in resize().
const CANVAS = { w: 1920, h: 1080 };

const FONT = {
  mono:
    '"Intel One Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lato: '"Lato", system-ui, -apple-system, sans-serif',
};

const COLORS = {
  black: 0x000000,
  white: 0xffffff,
  cardBg: 0xfffef6,
  cardBorder: 0xffd900,
  yellowBtn: 0xffdb00,
  yellowBtnHover: 0xffe633,
  titleRed: 0x980007,
  brown: 0x8a5c31,
  bookCream: 0xfffbe4,
  labelBrown: 0x4e2700,
  gridStripe: 0xd6f1fe,
  continueDisabled: 0xe2e2e2,
  continueDisabledText: 0xffffff,
  continueText: 0x980007,
  basketGlow: 0xffdb00,
  arrow: 0x000000,
  // Embossed inset stack approximation (Pixi can't replicate CSS box-shadow
  // exactly; we add a thin indigo stroke + soft shadow to suggest depth).
  embossInner: 0x4834d4,
};

// Tile geometry per panel
const BASE_TILE = { size: 160, radius: 24 };
const RIGHT_TILE = { size: 130, radius: 24 };

// ---------- Slot lists (positions in design coords) ----------

const TOFU_SLOTS = [
  { id: "soft-tofu-cubes", name: "Soft Tofu Cubes", x: 90, y: 289 },
  { id: "crumbled-tofu", name: "Crumbled Tofu", x: 290, y: 289 },
  { id: "hard-tofu-cubes", name: "Hard Tofu Cubes", x: 490, y: 289 },
  { id: "frozen-tofu", name: "Frozen Tofu", x: 90, y: 519 },
];

const OIL_SLOTS = [
  { id: "peanut-oil", name: "Peanut Oil", x: 90, y: 803 },
  { id: "olive-oil", name: "Olive Oil", x: 290, y: 803 },
  { id: "corn-oil", name: "Corn Oil", x: 490, y: 803 },
];

// Right-panel grid is data-driven now: every entry in the data file with
// category === "ingredient" becomes a slot, in file order, 4 columns wide.
const RIGHT_COLS = [1271, 1421, 1571, 1721];
const RIGHT_FIRST_ROW_Y = 214;
const RIGHT_ROW_PITCH = 192;

const RIGHT_SLOTS = INGREDIENT_DATA.filter(
  (d) => d.category === "ingredient"
).map((d, i) => ({
  id: d.id,
  name: d.name,
  x: RIGHT_COLS[i % 4],
  y: RIGHT_FIRST_ROW_Y + Math.floor(i / 4) * RIGHT_ROW_PITCH,
}));

// Basket bounding box (centered horizontally between panels). The
// FoodPrepBasket asset is square; size is per the new spec — 688×688
// at left:617, top:238 in 1920×1080 design canvas → center (961, 582).
const BASKET = {
  w: 688,
  h: 688,
  cx: CANVAS.w / 2, // ≈ 961 — Figma says 961, design canvas is 1920 wide
  cy: 582,
  radius: 344, // matches the full 688px diameter for drop hit-testing
};

// Top-right "Traditional Recipe" pill — sized + positioned to match
// CookwareScene and CookingScene so the button reads identically across
// the three eligible scenes.
const RECIPE_BTN = {
  w: 349,
  h: 75,
  r: 40,
  x: CANVAS.w - 35 - 349,
  y: 35,
};

// Mini-tile inside the basket when an ingredient is dropped. Bumped from
// 60 → 80 so dropped items read at a similar weight to the basket art
// and don't feel "tiny" against the 688px basket bounding box.
const BASKET_ITEM = { size: 80 };

// Items pile inside the visible woven interior of the basket art, not
// the full hit-test radius. The PNG's interior is ~50% of its bounding
// box, so cluster tightly and bias toward the center.
const BASKET_PILE_RADIUS = 155;

// ---------- Helpers ----------

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

function rightLabelStyle(name) {
  // Label sizing scales by length per spec
  const len = name.length;
  if (len <= 12) {
    return { fontSize: 16, lineHeight: 22, letterSpacing: 0 };
  }
  if (len <= 18) {
    return { fontSize: 14, lineHeight: 19, letterSpacing: -0.02 * 14 };
  }
  return { fontSize: 12, lineHeight: 17, letterSpacing: -0.02 * 12 };
}

function dataFor(id) {
  return INGREDIENT_DATA.find((d) => d.id === id);
}

// ---------- Scene ----------

export class IngredientScene {
  static bgClass = "bg-nude";
  bgClass = "bg-nude";

  constructor({ onBack, onContinue, onRecipe } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onContinue = onContinue ?? (() => {});
    this.onRecipe = onRecipe ?? (() => {});

    this.root = new Container();
    this.root.label = "IngredientScene";

    // Layers (rendered bottom → top). The body's BackgroundNude.png shows
    // through the transparent Pixi canvas; no gridLayer needed anymore.
    this.basketLayer = new Container();
    this.panelsLayer = new Container();
    this.tilesLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(
      this.basketLayer,
      this.panelsLayer,
      this.tilesLayer,
      this.uiLayer,
      this.dragLayer
    );

    this.tiles = new Map();
    this.basketItems = []; // { id, sprite }
    this.grabbed = null;
    this._scale = 1;

    this._backHovered = false;
    this._recipeHovered = false;
    this._continueHovered = false;
    this._basketActive = false;
    // Last hovered tile id, so we can fire a single hoverTick on the
    // edge instead of every frame.
    this._lastHoveredTileId = null;

    this._buildPanels();
    this._buildBasket();
    this._buildTiles();
    this._buildTopBar();
    this._buildInstruction();
    this._buildContinue();

    this._updateContinueState();

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
      "continue",
      (x, y) => this._inContinueBtn(x, y),
      () => {
        if (this._isValid()) {
          buttonClick();
          this.onContinue();
        } else {
          buttonDisabled();
        }
      }
    );

    // Hover-to-pick: 3s of hover over a tile starts the grab — no fist
    // gesture required. Auto-drop happens in onPointerMove the moment
    // the ghost cursor enters the basket.
    this.tilePicker = new HandHoverPicker({
      getHoveredTarget: (x, y) => {
        const tile = this._tileAt(x, y);
        return tile && tile.hasAsset ? tile : null;
      },
      onPick: (tile, x, y) => this._grab(tile, x, y, "hand"),
    });

    // Reverse-drag picker: hover for 1s on an existing basket item to
    // lift it back out of the basket. Drag outside the basket boundary
    // and the item snaps back to its source tile slot.
    this.basketPicker = new HandHoverPicker({
      getHoveredTarget: (x, y) => this._basketItemAt(x, y),
      onPick: (entry, x, y) => this._grabBasketItem(entry, x, y, "hand"),
    });
  }

  // ---------- Lifecycle ----------
  onEnter() {}
  onExit() {}

  // External hook so main.js can flip the recipe button label when
  // the shared traditionalRecipeOpen state changes.
  setRecipeOpen(open) {
    if (!this.recipeText) return;
    this.recipeText.text = open ? "Hide Recipe" : "Traditional Recipe";
  }

  // ---------- Build: panels ----------

  _buildPanels() {
    // Left panel
    this.leftPanel = new Container();
    this.leftPanel.position.set(48, 136);
    const leftBg = new Graphics()
      .roundRect(0, 0, 637, 888, 12)
      .fill({ color: COLORS.cardBg, alpha: 0.92 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    this.leftPanel.addChild(leftBg);

    const leftHeader = new Text({
      text: "Base (Required)",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 24,
        fontWeight: "500",
        fill: COLORS.titleRed,
        lineHeight: 33,
      }),
    });
    leftHeader.position.set(40, 28);
    this.leftPanel.addChild(leftHeader);

    // Sub-section labels live in canvas coords per spec
    const tofuLabel = new Text({
      text: "Tofu (Choose 1)",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 20,
        fontWeight: "400",
        fill: COLORS.titleRed,
        lineHeight: 28,
        letterSpacing: -0.06 * 20,
      }),
    });
    tofuLabel.position.set(88, 237);

    const oilLabel = new Text({
      text: "Oil (Choose 1)",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 20,
        fontWeight: "400",
        fill: COLORS.titleRed,
        lineHeight: 28,
        letterSpacing: -0.06 * 20,
      }),
    });
    oilLabel.position.set(84, 751);

    this.panelsLayer.addChild(this.leftPanel, tofuLabel, oilLabel);

    // Right panel
    this.rightPanel = new Container();
    this.rightPanel.position.set(1245, 136);
    const rightBg = new Graphics()
      .roundRect(0, 0, 627, 888, 12)
      .fill({ color: COLORS.cardBg, alpha: 0.92 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    this.rightPanel.addChild(rightBg);

    const rightHeader = new Text({
      text: "Ingredients",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 24,
        fontWeight: "500",
        fill: COLORS.titleRed,
        lineHeight: 33,
      }),
    });
    rightHeader.position.set(40, 28);
    this.rightPanel.addChild(rightHeader);

    // Sub-caption matching the "Tofu (Choose 1)" / "Oil (Choose 1)"
    // pattern on the left panel — tells the player the right panel
    // accepts any number of picks.
    const ingredientsCaption = new Text({
      text: "(Choose as many kinds as you like)",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 18,
        fontWeight: "400",
        fill: COLORS.titleRed,
        lineHeight: 26,
        letterSpacing: -0.04 * 18,
      }),
    });
    ingredientsCaption.anchor.set(0, 0.5);
    // Place it baseline-aligned with the "Ingredients" header — same
    // y-center as the header text, just to the right of it.
    ingredientsCaption.position.set(40 + rightHeader.width + 12, 28 + 33 / 2);
    this.rightPanel.addChild(ingredientsCaption);

    this.panelsLayer.addChild(this.rightPanel);
  }

  // ---------- Build: basket ----------

  _buildBasket() {
    this.basketContainer = new Container();
    this.basketContainer.label = "Basket";
    this.basketContainer.position.set(BASKET.cx, BASKET.cy);

    // Soft glow (hidden until drag-over)
    // Base alpha is high enough that the glow reads at a glance; the
    // breathing pulse is driven via container alpha + scale in update().
    this.basketGlow = new Graphics()
      .circle(0, 0, BASKET.radius + 30)
      .fill({ color: COLORS.basketGlow, alpha: 0.55 });
    this.basketGlow.filters = [new BlurFilter({ strength: 28 })];
    this.basketGlow.visible = false;

    this.basketSprite = new Sprite();
    this.basketSprite.anchor.set(0.5);
    this.basketSprite.width = BASKET.w;
    this.basketSprite.height = BASKET.h;

    // Layer for items dropped into the basket
    this.basketItemsLayer = new Container();

    this.basketContainer.addChild(
      this.basketGlow,
      this.basketSprite,
      this.basketItemsLayer
    );
    this.basketLayer.addChild(this.basketContainer);

    Assets.load(basketUrl)
      .then((tex) => {
        this.basketSprite.texture = tex;
      })
      .catch((e) =>
        console.warn("IngredientScene: failed to load basket", e)
      );
  }

  // ---------- Build: tiles ----------

  _buildTiles() {
    for (const slot of TOFU_SLOTS) this._buildBaseTile(slot, "tofu");
    for (const slot of OIL_SLOTS) this._buildBaseTile(slot, "oil");
    for (const slot of RIGHT_SLOTS) this._buildRightTile(slot);
  }

  _buildBaseTile(slot, category) {
    const data = dataFor(slot.id);
    const tile = this._makeTile({
      id: slot.id,
      name: slot.name,
      category,
      x: slot.x,
      y: slot.y,
      tileSize: BASE_TILE.size,
      tileRadius: BASE_TILE.radius,
      labelStyle: { fontSize: 16, lineHeight: 22, letterSpacing: 0 },
      labelAlign: "left",
      bakedBackground: data?.bakedBackground ?? "none",
      imagePath: data?.imagePath ?? null,
      parent: this.tilesLayer,
    });
    this.tiles.set(slot.id, tile);
  }

  _buildRightTile(slot) {
    const data = dataFor(slot.id);
    const labelStyle = rightLabelStyle(slot.name);
    const tile = this._makeTile({
      id: slot.id,
      name: slot.name,
      category: "ingredient",
      x: slot.x,
      y: slot.y,
      tileSize: RIGHT_TILE.size,
      tileRadius: RIGHT_TILE.radius,
      labelStyle,
      labelAlign: "center",
      bakedBackground: data?.bakedBackground ?? "none",
      imagePath: data?.imagePath ?? null,
      parent: this.tilesLayer,
    });
    this.tiles.set(slot.id, tile);
  }

  _makeTile({
    id,
    name,
    category,
    x,
    y,
    tileSize,
    tileRadius,
    labelStyle,
    labelAlign,
    bakedBackground,
    imagePath,
    parent,
  }) {
    const c = new Container();
    c.label = `Tile:${id}`;
    c.position.set(x, y);

    // Yellow-bordered rounded-rect frame, transparent fill — the panel's
    // cream backdrop shows through, per the new design.
    const bg = new Graphics()
      .roundRect(0, 0, tileSize, tileSize, tileRadius)
      .stroke({ color: COLORS.cardBorder, width: 1 });
    c.addChild(bg);

    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.position.set(tileSize / 2, tileSize / 2);
    sprite.visible = false;
    c.addChild(sprite);

    const label = new Text({
      text: name,
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: labelStyle.fontSize,
        lineHeight: labelStyle.lineHeight,
        letterSpacing: labelStyle.letterSpacing ?? 0,
        fill: COLORS.labelBrown,
        align: labelAlign,
        wordWrap: true,
        wordWrapWidth: tileSize,
      }),
    });
    if (labelAlign === "center") {
      label.anchor.set(0.5, 0);
      label.position.set(tileSize / 2, tileSize + 12);
    } else {
      label.anchor.set(0, 0);
      label.position.set(0, tileSize + 12);
    }
    c.addChild(label);

    // Selected-state badge — green disc + check, top-right corner. Hidden
    // until the player actually drops this tile into the basket.
    const badge = new Container();
    const badgeBg = new Graphics()
      .circle(tileSize - 16, 16, 12)
      .fill(0x4a8a4a)
      .stroke({ color: 0xffffff, width: 2 });
    const badgeText = new Text({
      text: "✓",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontSize: 14,
        fontWeight: "700",
        fill: 0xffffff,
      }),
    });
    badgeText.anchor.set(0.5);
    badgeText.position.set(tileSize - 16, 16);
    badge.addChild(badgeBg, badgeText);
    badge.visible = false;
    c.addChild(badge);

    (parent ?? this.tilesLayer).addChild(c);

    const tile = {
      id,
      name,
      category,
      container: c,
      bg,
      sprite,
      label,
      badge,
      origin: { x, y },
      size: tileSize,
      hasAsset: !!imagePath,
      bakedBackground,
      imagePath,
      selected: false,
    };

    if (imagePath) {
      Assets.load(imagePath)
        .then((tex) => {
          sprite.texture = tex;
          this._sizeTileSprite(tile);
          sprite.visible = true;
        })
        .catch((e) =>
          console.warn(`IngredientScene: failed to load ${id}`, e)
        );
    }

    return tile;
  }

  // Sprite bounding box per tile type:
  //   Base (160) → ~120 (75% of tile)
  //   Right-panel (130) → ~104 (80% of tile)
  // Aspect ratio is always preserved so tall bottles read correctly.
  _sizeTileSprite(tile) {
    const { sprite, size } = tile;
    const max = size === 160 ? 120 : size * 0.8;
    const tex = sprite.texture;
    const tw = tex?.width || 1;
    const th = tex?.height || 1;
    const ratio = tw / th;
    if (ratio >= 1) {
      sprite.width = max;
      sprite.height = max / ratio;
    } else {
      sprite.height = max;
      sprite.width = max * ratio;
    }
  }

  _setTileSelected(tile, selected) {
    if (tile.selected === selected) return;
    tile.selected = selected;
    tile.badge.visible = selected;
    tile.container.alpha = selected ? 0.55 : 1;
  }

  // Re-evaluate tile selection from the basket. Called whenever the
  // basket changes so visual marks always reflect what's been added.
  _refreshSelectedTiles() {
    const inBasket = new Set(this.basketItems.map((it) => it.id));
    for (const tile of this.tiles.values()) {
      this._setTileSelected(tile, inBasket.has(tile.id));
    }
  }

  // ---------- Build: top bar ----------

  _buildTopBar() {
    // Back button (yellow circle + chevron)
    this.backBtn = new Container();
    this.backBtn.label = "BackBtn";
    this.backBtn.position.set(57 + 23, 60 + 23); // center of 46x46 circle
    const backBg = new Graphics()
      .circle(0, 0, 23)
      .fill(COLORS.yellowBtn);
    const arrow = new Graphics();
    arrow
      .moveTo(7, -8)
      .lineTo(-7, 0)
      .lineTo(7, 8)
      .stroke({ color: COLORS.arrow, width: 2 });
    this.backBtn.addChild(backBg, arrow);

    // Title
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
    // Top spec: "left ~250px, top 60px (vertically centered with back btn)"
    // Back button center y = 60 + 23 = 83. So title baseline-ish around there.
    this.titleText.anchor.set(0, 0.5);
    this.titleText.position.set(140, 60 + 22);

    // Recipe pill (top-right): yellow rounded-rect with book icon +
    // "Traditional Recipe" label. Same RECIPE_BTN dimensions as
    // CookwareScene / CookingScene so the three scenes feel identical.
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

    this.recipeText = new Text({
      text: "Traditional Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: 20,
        lineHeight: 28,
        letterSpacing: -0.02 * 20,
        fill: COLORS.brown,
      }),
    });
    this.recipeText.anchor.set(0, 0.5);
    this.recipeText.position.set(-RECIPE_BTN.w / 2 + 70, 0);

    this.recipeBtn.addChild(this.recipeBtnBg, icon, this.recipeText);
    this.uiLayer.addChild(this.backBtn, this.titleText, this.recipeBtn);
  }

  _makeRecipeIcon() {
    // Compact book glyph — anchored at (0, 0) so the parent Container
    // can position it via icon.position.set().
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

  // ---------- Build: instruction + continue ----------

  _buildInstruction() {
    this.instruction = new Text({
      text: "Drag the ingredients into the prep basket",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "600",
        fontSize: 32,
        lineHeight: 44,
        fill: COLORS.black,
        align: "center",
        wordWrap: true,
        wordWrapWidth: 478,
      }),
    });
    this.instruction.anchor.set(0.5, 0);
    this.instruction.position.set(960, 120);
    this.uiLayer.addChild(this.instruction);
  }

  _buildContinue() {
    this.continueBtn = new Container();
    this.continueBtn.label = "ContinueBtn";
    this.continueBtn.position.set(960, 934 + 45); // center y = top + h/2

    this.continueShadow = new Graphics();
    this.continueBg = new Graphics();
    this.continueLabel = new Text({
      text: "Continue",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontWeight: "700",
        fontSize: 30,
        fill: COLORS.continueDisabledText,
      }),
    });
    this.continueLabel.anchor.set(0.5, 0.5);

    this.continueBtn.addChild(
      this.continueShadow,
      this.continueBg,
      this.continueLabel
    );
    this.uiLayer.addChild(this.continueBtn);
  }

  _drawContinue() {
    const enabled = this._isValid();
    const w = 299;
    const h = 90;
    const r = 40;

    this.continueShadow.clear();
    this.continueBg.clear();

    if (!enabled) {
      this.continueBg
        .roundRect(-w / 2, -h / 2, w, h, r)
        .fill(COLORS.continueDisabled);
      this.continueLabel.style.fill = COLORS.continueDisabledText;
      this.continueBtn.scale.set(1);
      return;
    }

    // Soft drop shadow approximation
    this.continueShadow
      .roundRect(-w / 2, -h / 2 + 2, w, h, r)
      .fill({ color: 0x140e3e, alpha: 0.15 });
    this.continueShadow.filters = [new BlurFilter({ strength: 3 })];

    // Hovered = brighter yellow
    const fill = this._continueHovered
      ? COLORS.yellowBtnHover
      : COLORS.yellowBtn;
    this.continueBg
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(fill)
      .stroke({ color: COLORS.embossInner, width: 1, alignment: 1 });

    // Inset highlight (top) and inset shadow (bottom) — approximations
    this.continueBg
      .roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, 2, r)
      .fill({ color: 0xffffff, alpha: 0.45 });
    this.continueBg
      .roundRect(-w / 2 + 1, h / 2 - 3, w - 2, 2, r)
      .fill({ color: 0x3423aa, alpha: 0.35 });

    this.continueLabel.style.fill = COLORS.continueText;
    this.continueBtn.scale.set(this._continueHovered ? 1.04 : 1);
  }

  _updateContinueState() {
    this._drawContinue();
  }

  // ---------- Resize / scale to viewport ----------

  resize(screenW, screenH) {
    const scale = Math.min(screenW / CANVAS.w, screenH / CANVAS.h);
    this._scale = scale;
    this.root.scale.set(scale);
    const dx = (screenW - CANVAS.w * scale) / 2;
    const dy = (screenH - CANVAS.h * scale) / 2;
    this.root.position.set(dx, dy);
  }

  // ---------- Pointer API ----------

  onPointerMove(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);

    if (this.grabbed) {
      // Hand-grabbed and the hand briefly disappeared. MediaPipe drops
      // hands on noisy frames; without a grace window we'd snap back
      // after one missed frame. Freeze ghost during the grace; only
      // snap back if the hand stays gone.
      if (this.grabbed.source === "hand" && source !== "hand") {
        const now = performance.now();
        this._handGoneSince = this._handGoneSince ?? now;
        if (now - this._handGoneSince > 600) {
          // Cancel cleanly depending on grab kind.
          if (this.grabbed.kind === "basket") {
            this._cancelBasketGrab(this.grabbed);
          } else {
            this._snapGhostBack(this.grabbed.tile, this.grabbed.ghost);
          }
          this.grabbed = null;
          this._handGoneSince = null;
          this._basketActive = false;
          this.basketGlow.visible = false;
        }
        return;
      }
      this._handGoneSince = null;
      if (p.x == null) return;
      this.grabbed.ghost.position.set(p.x, p.y);
      const over = this._overBasket(p.x, p.y);
      if (over !== this._basketActive) {
        this._basketActive = over;
        this.basketGlow.visible = over;
      }
      if (this.grabbed.kind === "basket") {
        // Reverse drag: hand auto-fires the put-back the moment the
        // ghost leaves the basket boundary. Mouse waits for an
        // explicit release (handled in onPointerUp).
        if (this.grabbed.source === "hand" && !over) {
          const g = this.grabbed;
          this.grabbed = null;
          this._basketActive = false;
          this.basketGlow.visible = false;
          this._putBackBasketEntry(g);
        }
        return;
      }
      // Hand-grab auto-drops the moment the ghost reaches the basket.
      // Mouse keeps the explicit click-and-release semantic — there the
      // user actively releases by letting go of the button.
      if (this.grabbed.source === "hand" && over) {
        const { tile, ghost } = this.grabbed;
        this.grabbed = null;
        this._basketActive = false;
        this.basketGlow.visible = false;
        this._addToBasket(tile, ghost);
      }
      return;
    }

    // Drive hand-hover dwell for every registered button + tile + basket entry.
    this.buttons.pointerMove({ x: p.x, y: p.y, source });
    this.tilePicker.pointerMove({ x: p.x, y: p.y, source });
    this.basketPicker.pointerMove({ x: p.x, y: p.y, source });

    if (p.x == null) {
      this._setBackHovered(false);
      this._setRecipeHovered(false);
      this._setContinueHovered(false);
      return;
    }

    this._setBackHovered(this._inCircle(p.x, p.y, this.backBtn, 32));
    this._setRecipeHovered(this._inRecipeBtn(p.x, p.y));
    this._setContinueHovered(this._inContinueBtn(p.x, p.y));

    // Tile hover blip — fire once on the edge, regardless of input source.
    const tile = this._tileAt(p.x, p.y);
    const hoveredId = tile && tile.hasAsset ? tile.id : null;
    if (hoveredId !== this._lastHoveredTileId) {
      this._lastHoveredTileId = hoveredId;
      if (hoveredId) hoverTick();
    }
  }

  onPointerDown(state) {
    const { x, y, source } = state;
    const p = this._toDesign(x, y);
    if (p.x == null) return;

    // Mouse buttons fire on click; hand buttons use dwell.
    if (this.buttons.pointerDown({ x: p.x, y: p.y, source })) return;

    // Mouse picks via click-and-drag. Hand picks via hover dwell
    // (HandHoverPicker), so we ignore hand presses here entirely.
    if (source !== "mouse") return;

    // Reverse drag: a click on an existing basket entry lifts it out
    // first — that wins over the underlying basket area.
    const basketEntry = this._basketItemAt(p.x, p.y);
    if (basketEntry) {
      this._grabBasketItem(basketEntry, p.x, p.y, "mouse");
      return;
    }

    const tile = this._tileAt(p.x, p.y);
    if (!tile || !tile.hasAsset) return;
    this._grab(tile, p.x, p.y, "mouse");
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const g = this.grabbed;
    this.grabbed = null;
    this._basketActive = false;
    this.basketGlow.visible = false;

    const p = this._toDesign(x, y);

    // Reverse drag (basket → outside): release outside basket = put
    // back to source tile; release inside basket = cancel (no state
    // change, the entry just settles back into place).
    if (g.kind === "basket") {
      if (cancelled || p.x == null || !this._overBasket(p.x, p.y)) {
        this._putBackBasketEntry(g);
      } else {
        this._cancelBasketGrab(g);
      }
      return;
    }

    // Forward drag (tile → basket): existing behavior unchanged.
    const { tile, ghost } = g;
    if (cancelled || p.x == null || !this._overBasket(p.x, p.y)) {
      this._snapGhostBack(tile, ghost);
      return;
    }
    this._addToBasket(tile, ghost);
  }

  update(now) {
    // Soft breathing on the basket "shine" while a ghost is hovering
    // over the basket — alpha and scale together make it feel inviting
    // rather than a static halo. Driven off performance.now so it stays
    // smooth even if frames stutter.
    if (this.basketGlow.visible) {
      const t = (now ?? performance.now()) / 1000;
      const wave = (Math.sin(t * 4) + 1) / 2; // 0..1, ~0.6 Hz
      this.basketGlow.alpha = 0.7 + wave * 0.3;
      const s = 1.0 + 0.05 * wave;
      this.basketGlow.scale.set(s);
    }
  }

  getPointerDwell() {
    return Math.max(
      this.buttons?.getDwellProgress() ?? 0,
      this.tilePicker?.getDwellProgress() ?? 0,
      this.basketPicker?.getDwellProgress() ?? 0
    );
  }

  getState() {
    return {
      grabbedId: this.grabbed?.tile?.id ?? null,
      basketCount: this.basketItems.length,
    };
  }

  // Snapshot of the basket for the cooking store: deduped by id, in the
  // order they were first added. Returns full data records (id/name/imagePath
  // /bakedBackground/category) so Scene 5 can render the same tiles.
  getBasketContents() {
    const seen = new Set();
    const out = [];
    for (const item of this.basketItems) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const data = INGREDIENT_DATA.find((d) => d.id === item.id);
      if (data) out.push({ ...data });
    }
    return out;
  }

  // ---------- Drag / drop internals ----------

  _grab(tile, designX, designY, source = "mouse") {
    itemPickup();
    const ghost = new Container();
    ghost.label = `Ghost:${tile.id}`;

    // Just the sprite (with a soft shadow); ingredients are stamps, not tiles.
    const shadow = new Graphics()
      .ellipse(0, 8, 36, 8)
      .fill({ color: 0x000000, alpha: 0.25 });
    shadow.filters = [new BlurFilter({ strength: 6 })];

    const tex = tile.sprite.texture;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = tile.sprite.width;
    sp.height = tile.sprite.height;

    ghost.addChild(shadow, sp);
    ghost.scale.set(1.1);
    ghost.position.set(designX, designY);
    this.dragLayer.addChild(ghost);

    this.grabbed = { tile, ghost, source, kind: "tile" };
  }

  // Lift an existing basket entry back into a follow-the-cursor ghost.
  // Mirrors _grab's visuals so a basket pickup feels like a tile pickup.
  // The basket sprite is hidden (not destroyed) for the duration of
  // the drag — if the player drops back inside the basket, we just
  // restore visibility instead of re-running the basket-add animation.
  _grabBasketItem(entry, designX, designY, source = "mouse") {
    const tile = this.tiles.get(entry.id);
    if (!tile) return;
    itemPickup();

    entry.sprite.visible = false;

    const ghost = new Container();
    ghost.label = `Ghost:${tile.id}:basket`;

    const shadow = new Graphics()
      .ellipse(0, 8, 36, 8)
      .fill({ color: 0x000000, alpha: 0.25 });
    shadow.filters = [new BlurFilter({ strength: 6 })];

    const tex = tile.sprite.texture;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = tile.sprite.width;
    sp.height = tile.sprite.height;

    ghost.addChild(shadow, sp);
    ghost.scale.set(1.1);
    ghost.position.set(designX, designY);
    this.dragLayer.addChild(ghost);

    this.grabbed = { tile, ghost, source, kind: "basket", entry };
  }

  // Commit a reverse-drag: remove the basket entry, animate the ghost
  // back to its source tile slot, and re-enable the tile so the player
  // can re-pick it. Always called from a non-cancelled state — caller
  // is responsible for clearing this.grabbed.
  _putBackBasketEntry(g) {
    const { tile, ghost, entry } = g;
    const idx = this.basketItems.indexOf(entry);
    if (idx >= 0) this.basketItems.splice(idx, 1);
    entry.sprite.parent?.removeChild(entry.sprite);
    entry.sprite.destroy({ children: true });
    this._snapGhostBack(tile, ghost);
    this._refreshSelectedTiles();
    this._updateContinueState();
  }

  // Cancel a reverse-drag: just restore the basket sprite and toss the
  // ghost. No state mutation — the basket entry stays exactly where it was.
  _cancelBasketGrab(g) {
    g.entry.sprite.visible = true;
    g.ghost.parent?.removeChild(g.ghost);
    g.ghost.destroy({ children: true });
  }

  _snapGhostBack(tile, ghost) {
    itemRejected();
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

  _addToBasket(tile, ghost) {
    itemDropBasket();
    // Mutex on tofu/oil — validation requires exactly one of each, so a
    // new drop in those categories replaces any prior one in the basket.
    if (tile.category === "tofu" || tile.category === "oil") {
      for (let i = this.basketItems.length - 1; i >= 0; i--) {
        const existing = this.basketItems[i];
        const existingTile = this.tiles.get(existing.id);
        if (existingTile && existingTile.category === tile.category) {
          existing.sprite.parent?.removeChild(existing.sprite);
          existing.sprite.destroy({ children: true });
          this.basketItems.splice(i, 1);
        }
      }
    }

    // Phyllotaxis ("sunflower") placement keyed off the current
    // basket-item count. Each new drop lands at a fresh ~137.5° step
    // from the previous, so successive items fan out around the
    // centre instead of stacking on top of one another. Tiny jitter
    // keeps the look organic without breaking the spread.
    const i = this.basketItems.length;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const SPACING = 44; // √12 * 44 ≈ 152, fits inside BASKET_PILE_RADIUS
    const radius =
      i === 0 ? 0 : Math.min(BASKET_PILE_RADIUS, Math.sqrt(i) * SPACING);
    const angle = i * GOLDEN_ANGLE;
    const jitterX = (Math.random() - 0.5) * 4;
    const jitterY = (Math.random() - 0.5) * 4;
    const offX = Math.cos(angle) * radius + jitterX;
    const offY = Math.sin(angle) * radius + jitterY;
    const target = {
      x: this.basketContainer.x + offX,
      y: this.basketContainer.y + offY,
    };
    const from = { x: ghost.x, y: ghost.y };

    // Build a small mini-tile (just the sprite, no border or tint disc —
    // the basket already provides its own visual frame).
    const item = this._makeBasketMiniTile(tile);
    item.position.set(offX, offY);
    item.alpha = 0;
    this.basketItemsLayer.addChild(item);
    this.basketItems.push({ id: tile.id, sprite: item });

    this._refreshSelectedTiles();
    this._updateContinueState();

    // Tween + scale pulse
    const start = performance.now();
    const dur = 240;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      ghost.position.set(
        from.x + (target.x - from.x) * e,
        from.y + (target.y - from.y) * e
      );
      // Scale 1.1 → 1.3 → 0
      const s = t < 0.45 ? 1.1 + (1.3 - 1.1) * (t / 0.45) : 1.3 * (1 - (t - 0.45) / 0.55);
      ghost.scale.set(Math.max(0, s));
      ghost.alpha = 1 - Math.max(0, (t - 0.55) / 0.45);
      // Reveal the basket item near the end
      item.alpha = Math.min(1, t * 1.4);
      if (t < 1) requestAnimationFrame(step);
      else {
        ghost.parent?.removeChild(ghost);
        ghost.destroy({ children: true });
        item.alpha = 1;
      }
    };
    requestAnimationFrame(step);
  }

  // Small sprite shown inside the basket once an ingredient is dropped.
  // The basket image already provides the visual frame, so we don't draw
  // a border or background — just the PNG, aspect-preserved, fitting in
  // a BASKET_ITEM.size box.
  _makeBasketMiniTile(tile) {
    const c = new Container();
    const size = BASKET_ITEM.size;
    const tex = tile.sprite.texture;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    const tw = tex?.width || 1;
    const th = tex?.height || 1;
    const ratio = tw / th;
    if (ratio >= 1) {
      sp.width = size;
      sp.height = size / ratio;
    } else {
      sp.height = size;
      sp.width = size * ratio;
    }
    c.addChild(sp);
    return c;
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

  // ---------- Validation ----------

  _isValid() {
    let tofu = 0;
    let oil = 0;
    for (const it of this.basketItems) {
      const tile = this.tiles.get(it.id);
      if (!tile) continue;
      if (tile.category === "tofu") tofu++;
      else if (tile.category === "oil") oil++;
    }
    return tofu >= 1 && oil >= 1;
  }

  // ---------- Hit tests (design space) ----------

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

  _overBasket(x, y) {
    const dx = x - this.basketContainer.x;
    const dy = y - this.basketContainer.y;
    return Math.hypot(dx, dy) <= BASKET.radius;
  }

  // Which basket entry sits under the (design-coord) cursor, if any.
  // Used by the reverse-drag picker so a player can grab an ingredient
  // back out of the basket. Iterates newest-first so an entry placed on
  // top of an earlier one wins the hit-test.
  _basketItemAt(x, y) {
    const r = BASKET_ITEM.size / 2;
    for (let i = this.basketItems.length - 1; i >= 0; i--) {
      const entry = this.basketItems[i];
      // sprite is hidden when in flight — don't grab it again mid-drag.
      if (!entry.sprite.visible) continue;
      const cx = this.basketContainer.x + entry.sprite.x;
      const cy = this.basketContainer.y + entry.sprite.y;
      if (Math.hypot(x - cx, y - cy) <= r) return entry;
    }
    return null;
  }

  _inCircle(x, y, container, radius) {
    const dx = x - container.x;
    const dy = y - container.y;
    return Math.hypot(dx, dy) <= radius;
  }


  _inRecipeBtn(x, y) {
    return pointInRect(x, y, {
      x: RECIPE_BTN.x,
      y: RECIPE_BTN.y,
      width: RECIPE_BTN.w,
      height: RECIPE_BTN.h,
    });
  }

  _inContinueBtn(x, y) {
    const w = 299;
    const h = 90;
    return pointInRect(x, y, {
      x: this.continueBtn.x - w / 2,
      y: this.continueBtn.y - h / 2,
      width: w,
      height: h,
    });
  }

  // ---------- Hover setters ----------

  _setBackHovered(v) {
    if (v === this._backHovered) return;
    this._backHovered = v;
    // (Spec doesn't define a hover state for back; keep it simple.)
  }
  _setRecipeHovered(v) {
    if (v === this._recipeHovered) return;
    this._recipeHovered = v;
    this._drawRecipeBtn();
  }
  _setContinueHovered(v) {
    if (v === this._continueHovered) return;
    this._continueHovered = v;
    this._drawContinue();
  }
}

import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
  BlurFilter,
} from "pixi.js";
import basketUrl from "../assets/basket-placeholder.svg?url";
import { ingredients as INGREDIENT_DATA } from "../data/ingredients.js";

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

const RIGHT_INGREDIENTS = [
  ["scallion", "Scallion"],
  ["ginger", "Ginger"],
  ["tomato", "Tomato"],
  ["red-pepper", "Red Pepper"],
  ["chili", "Chili"],
  ["ground-beef", "Ground Beef"],
  ["minced-pork", "Minced Pork"],
  ["sugar", "Sugar"],
  ["salt", "Salt"],
  ["soy-sauce", "Soy Sauce"],
  ["black-vinegar", "Black Vinegar"],
  ["starch-water", "Starch Water"],
  ["pixian-chili-sauce", "Pixian Chili Sauce"],
  ["szechuan-pepper-powder", "Szechuan Pepper Powder"],
  ["shaoxing-cooking-wine", "Shaoxing Cooking Wine"],
  ["fermented-black-bean", "Fermented Black Bean"],
];

const RIGHT_COLS = [1271, 1421, 1571, 1721];
const RIGHT_ROWS = [214, 406, 598, 790];

const RIGHT_SLOTS = RIGHT_INGREDIENTS.map(([id, name], i) => ({
  id,
  name,
  x: RIGHT_COLS[i % 4],
  y: RIGHT_ROWS[Math.floor(i / 4)],
}));

// Basket bounding box (centered horizontally between panels)
const BASKET = {
  w: 691,
  h: 662,
  cx: CANVAS.w / 2,
  cy: 253 + 662 / 2,
  radius: 280, // hit-test radius (smaller than visible bounds for nicer feel)
};

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
  static bgClass = "bg-white";
  bgClass = "bg-white";

  constructor({ onBack, onContinue, onRecipe } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onContinue = onContinue ?? (() => {});
    this.onRecipe = onRecipe ?? (() => {});

    this.root = new Container();
    this.root.label = "IngredientScene";

    // Layers (rendered bottom → top)
    this.gridLayer = new Container();
    this.basketLayer = new Container();
    this.panelsLayer = new Container();
    this.tilesLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(
      this.gridLayer,
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

    this._buildGrid();
    this._buildPanels();
    this._buildBasket();
    this._buildTiles();
    this._buildTopBar();
    this._buildInstruction();
    this._buildContinue();

    this._updateContinueState();
  }

  // ---------- Build: grid ----------

  _buildGrid() {
    // White base
    const base = new Graphics()
      .rect(0, 0, CANVAS.w, CANVAS.h)
      .fill(COLORS.white);
    this.gridLayer.addChild(base);

    // Stripes (1923 × 70 each)
    const horizTops = [102, 271, 457, 623, 792, 941];
    for (const y of horizTops) {
      const g = new Graphics()
        .rect(0, 0, 1923, 70)
        .fill(COLORS.gridStripe);
      g.position.set(0, y);
      this.gridLayer.addChild(g);
    }

    const vert = [
      [128, -439],
      [359, -419],
      [612, -382],
      [904, -396],
      [1167, -407.57],
      [1451, -381],
      [1711, -393],
    ];
    const tilt = (89.58 * Math.PI) / 180;
    for (const [x, y] of vert) {
      const g = new Graphics()
        .rect(0, 0, 1923, 70)
        .fill(COLORS.gridStripe);
      g.position.set(x, y);
      g.rotation = tilt;
      this.gridLayer.addChild(g);
    }

    // Mask the grid so stripes don't bleed past the canvas (overflow:hidden)
    const mask = new Graphics()
      .rect(0, 0, CANVAS.w, CANVAS.h)
      .fill(COLORS.white);
    this.gridLayer.addChild(mask);
    this.gridLayer.mask = mask;
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

    this.panelsLayer.addChild(this.rightPanel);
  }

  // ---------- Build: basket ----------

  _buildBasket() {
    this.basketContainer = new Container();
    this.basketContainer.label = "Basket";
    this.basketContainer.position.set(BASKET.cx, BASKET.cy);

    // Soft glow (hidden until drag-over)
    this.basketGlow = new Graphics()
      .circle(0, 0, BASKET.radius + 30)
      .fill({ color: COLORS.basketGlow, alpha: 0.28 });
    this.basketGlow.filters = [new BlurFilter({ strength: 24 })];
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
      hasBakedBackground: data?.hasBakedBackground ?? false,
      imagePath: data?.imagePath ?? null,
      // Sprite sizing rules:
      //   - Tofu (baked-bg): 120×120 centered (per spec)
      //   - Oil: 50×134.5, vertically + horizontally centered (per spec)
      spriteSize:
        category === "oil"
          ? { w: 50, h: 134.5, fit: "fixed" }
          : { w: 120, h: 120, fit: "fixed" },
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
      hasBakedBackground: data?.hasBakedBackground ?? false,
      imagePath: data?.imagePath ?? null,
      // Right tiles: fit PNG within ~100×100 box, preserve aspect ratio
      spriteSize: { w: 100, h: 100, fit: "contain" },
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
    hasBakedBackground,
    imagePath,
    spriteSize,
  }) {
    const c = new Container();
    c.label = `Tile:${id}`;
    c.position.set(x, y);

    // Tile bg: transparent fill + yellow border
    const bg = new Graphics()
      .roundRect(0, 0, tileSize, tileSize, tileRadius)
      .stroke({ color: COLORS.cardBorder, width: 1 });
    c.addChild(bg);

    // Sprite (centered in tile)
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.position.set(tileSize / 2, tileSize / 2);
    sprite.visible = false;
    c.addChild(sprite);

    // Label below tile
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

    this.tilesLayer.addChild(c);

    const tile = {
      id,
      name,
      category,
      container: c,
      bg,
      sprite,
      label,
      origin: { x, y },
      size: tileSize,
      hasAsset: !!imagePath,
      hasBakedBackground,
      imagePath,
      spriteSize,
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

  _sizeTileSprite(tile) {
    const { sprite, spriteSize } = tile;
    if (spriteSize.fit === "fixed") {
      sprite.width = spriteSize.w;
      sprite.height = spriteSize.h;
      return;
    }
    // contain
    const tex = sprite.texture;
    const tw = tex?.width || 1;
    const th = tex?.height || 1;
    const ratio = tw / th;
    if (ratio >= spriteSize.w / spriteSize.h) {
      sprite.width = spriteSize.w;
      sprite.height = spriteSize.w / ratio;
    } else {
      sprite.height = spriteSize.h;
      sprite.width = spriteSize.h * ratio;
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

    // Recipe button (icon + text)
    this.recipeBtn = new Container();
    this.recipeBtn.label = "RecipeBtn";
    this.recipeBtn.position.set(1564, 50);
    this._drawRecipeIcon();

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
    // Spec: text at canvas (1616, 58). Container is at (1564, 50), so text
    // sits at relative (52, 8).
    this.recipeText.position.set(52, 8);
    this.recipeBtn.addChild(this.recipeText);

    this.uiLayer.addChild(this.backBtn, this.titleText, this.recipeBtn);
  }

  _drawRecipeIcon() {
    const icon = new Container();
    const g = new Graphics();
    // Open book: two rounded "pages" with a center spine.
    const pageW = 17;
    const pageH = 36;
    // Left page
    g.roundRect(0, 8, pageW, pageH, 3)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    // Right page
    g.roundRect(pageW + 2, 8, pageW, pageH, 3)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    // Center spine line
    g.moveTo(pageW + 1, 10)
      .lineTo(pageW + 1, 42)
      .stroke({ color: COLORS.brown, width: 2 });
    // Bookmark sticking up
    g.roundRect(pageW - 4, 0, 9, 14, 1)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    // Subtle dots suggesting recipe lines
    for (let i = 0; i < 3; i++) {
      g.circle(7, 18 + i * 7, 1.2).fill(COLORS.brown);
      g.circle(pageW + 9, 18 + i * 7, 1.2).fill(COLORS.brown);
    }
    icon.addChild(g);
    this.recipeBtn.addChild(icon);
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

  onPointerMove({ x, y }) {
    const p = this._toDesign(x, y);

    if (this.grabbed) {
      if (p.x == null) return;
      this.grabbed.ghost.position.set(p.x, p.y);
      const over = this._overBasket(p.x, p.y);
      if (over !== this._basketActive) {
        this._basketActive = over;
        this.basketGlow.visible = over;
      }
      return;
    }

    if (p.x == null) {
      this._setBackHovered(false);
      this._setRecipeHovered(false);
      this._setContinueHovered(false);
      return;
    }

    this._setBackHovered(this._inCircle(p.x, p.y, this.backBtn, 32));
    this._setRecipeHovered(this._inRecipeBtn(p.x, p.y));
    this._setContinueHovered(this._inContinueBtn(p.x, p.y));
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
    if (this._inContinueBtn(p.x, p.y) && this._isValid()) {
      this.onContinue();
      return;
    }

    const tile = this._tileAt(p.x, p.y);
    if (!tile || !tile.hasAsset) return;
    this._grab(tile, p.x, p.y);
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const { tile, ghost } = this.grabbed;
    this.grabbed = null;
    this._basketActive = false;
    this.basketGlow.visible = false;

    const p = this._toDesign(x, y);
    if (cancelled || p.x == null || !this._overBasket(p.x, p.y)) {
      this._snapGhostBack(tile, ghost);
      return;
    }
    this._addToBasket(tile, ghost);
  }

  getPointerDwell() {
    return 0;
  }

  getState() {
    return {
      grabbedId: this.grabbed?.tile?.id ?? null,
      basketCount: this.basketItems.length,
    };
  }

  // Snapshot of the basket for the cooking store: deduped by id, in the
  // order they were first added. Returns full data records (id/name/imagePath
  // /hasBakedBackground/category) so Scene 5 can render the same tiles.
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

  _grab(tile, designX, designY) {
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

    this.grabbed = { tile, ghost };
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

  _addToBasket(tile, ghost) {
    // Pick a scattered spot inside the basket (relative to basket center)
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 220;
    const offX = Math.cos(angle) * r;
    const offY = Math.sin(angle) * r;
    const target = {
      x: this.basketContainer.x + offX,
      y: this.basketContainer.y + offY,
    };
    const from = { x: ghost.x, y: ghost.y };

    // Spawn the persistent basket item now (hidden until drop animation lands)
    const tex = tile.sprite.texture;
    const item = new Sprite(tex);
    item.anchor.set(0.5);
    item.width = Math.min(80, tile.sprite.width * 0.7);
    item.height = Math.min(80, tile.sprite.height * 0.7);
    item.position.set(offX, offY);
    item.alpha = 0;
    this.basketItemsLayer.addChild(item);
    this.basketItems.push({ id: tile.id, sprite: item });

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

  _inCircle(x, y, container, radius) {
    const dx = x - container.x;
    const dy = y - container.y;
    return Math.hypot(dx, dy) <= radius;
  }

  _inRecipeBtn(x, y) {
    // Bounding rect ~ 290×44 starting at (1564, 50)
    return pointInRect(x, y, { x: 1564, y: 50, width: 300, height: 44 });
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
  }
  _setContinueHovered(v) {
    if (v === this._continueHovered) return;
    this._continueHovered = v;
    this._drawContinue();
  }
}

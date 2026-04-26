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

const FONT_STACK =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const COLORS = {
  ink: 0x2a2a2a,
  muted: 0x6f6a62,
  titleRed: 0x8e1f1f,
  panelBg: 0xffffff,
  panelStroke: 0xd4dde6,
  subPanelBg: 0xeef4f9,
  pillYellow: 0xf4cf3c,
  pillYellowHover: 0xebc02a,
  pillDisabled: 0xd8d3cc,
  pillTextDisabled: 0x9c9690,
  basketActiveStroke: 0xd96a3a,
  basketTint: 0xffe7a8,
  checkBadge: 0x4a8a4a,
};

const LAYOUT = {
  pad: 24,
  topBarH: 64,
  backBtnR: 24,
  recipeBtn: { w: 220, h: 42, r: 21 },
  continueBtn: { w: 200, h: 56, r: 28 },
  leftPanelW: 312,
  rightPanelW: 408,
  panelPad: 20,
  panelRadius: 18,
  subPanelRadius: 14,
  subPanelPad: 16,
  tileR: 32,
  tileW: 80,
  tileH: 100,
  tileGapX: 16,
  tileGapY: 14,
  basket: 360,
  centerColumnW: 360,
  panelGap: 28,
};

const TOFU = [
  { id: "soft-tofu-cubes", label: "Soft Tofu Cubes" },
  { id: "crumbled-tofu", label: "Crumbled Tofu" },
  { id: "hard-tofu-cubes", label: "Hard Tofu Cubes" },
  { id: "frozen-tofu", label: "Frozen Tofu" },
];
const OILS = [
  { id: "peanut-oil", label: "Peanut Oil" },
  { id: "olive-oil", label: "Olive Oil" },
  { id: "corn-oil", label: "Corn Oil" },
];
const INGREDIENTS = [
  { id: "scallion", label: "Scallion" },
  { id: "ginger", label: "Ginger" },
  { id: "tomato", label: "Tomato" },
  { id: "red-pepper", label: "Red Pepper" },
  { id: "chili", label: "Chili" },
  { id: "ground-beef", label: "Ground Beef" },
  { id: "minced-pork", label: "Minced Pork" },
  { id: "sugar", label: "Sugar" },
  { id: "salt", label: "Salt" },
  { id: "soy-sauce", label: "Soy Sauce" },
  { id: "black-vinegar", label: "Black Vinegar" },
  { id: "starch-water", label: "Starch Water" },
  { id: "pixian-chili-sauce", label: "Pixian Chili Sauce" },
  { id: "szechuan-pepper-powder", label: "Szechuan Pepper Pwd" },
  { id: "shaoxing-cooking-wine", label: "Shaoxing Wine" },
  { id: "fermented-black-bean", label: "Fermented Black Bean" },
];

// Eagerly resolve URLs for every ingredient SVG; load textures lazily.
const ingredientUrlsRaw = import.meta.glob(
  "../assets/ingredients/*.svg",
  { eager: true, query: "?url", import: "default" }
);
const URL_BY_ID = {};
for (const [path, url] of Object.entries(ingredientUrlsRaw)) {
  const m = path.match(/\/([^/]+)\.svg$/);
  if (m) URL_BY_ID[m[1]] = url;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class IngredientScene {
  static bgClass = "bg-blue";
  bgClass = "bg-blue";

  constructor({ onBack, onContinue, onRecipe } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onContinue = onContinue ?? (() => {});
    this.onRecipe = onRecipe ?? (() => {});

    this.root = new Container();
    this.root.label = "IngredientScene";

    this.panelsLayer = new Container();
    this.itemsLayer = new Container();
    this.uiLayer = new Container();
    this.dragLayer = new Container();
    this.root.addChild(
      this.panelsLayer,
      this.itemsLayer,
      this.uiLayer,
      this.dragLayer
    );

    this.tiles = new Map();
    this.selected = new Set();
    this.grabbed = null;
    this._lastResize = null;

    this._basketActive = false;
    this._continueHovered = false;
    this._backHovered = false;
    this._recipeHovered = false;

    this._buildTopBar();
    this._buildPanels();
    this._buildCenter();
    this._buildItems();

    this._updateValidation();
    this._updateSelectedList();
  }

  // -------- construction --------

  _buildTopBar() {
    // Back arrow circle (yellow)
    this.backBtn = new Container();
    this.backBtn.label = "BackBtn";
    this.backBtnBg = new Graphics();
    this.backBtnArrow = new Text({
      text: "←",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 24,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.backBtnArrow.anchor.set(0.5);
    this.backBtn.addChild(this.backBtnBg, this.backBtnArrow);
    this._drawBackBtn(false);

    this.titleText = new Text({
      text: "Mapo Tofu, Maybe",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 22,
        fontWeight: "600",
        fill: COLORS.titleRed,
        letterSpacing: 0.3,
      }),
    });
    this.titleText.anchor.set(0, 0.5);

    this.recipeBtn = new Container();
    this.recipeBtn.label = "RecipeBtn";
    this.recipeBtnBg = new Graphics();
    this.recipeBtnLabel = new Text({
      text: "Traditional Recipe",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 14,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.recipeBtnLabel.anchor.set(0.5, 0.5);
    this.recipeBtn.addChild(this.recipeBtnBg, this.recipeBtnLabel);
    this._drawRecipeBtn(false);

    this.uiLayer.addChild(this.backBtn, this.titleText, this.recipeBtn);
  }

  _buildPanels() {
    // Left panel
    this.leftBg = new Graphics();
    this.leftHeader = new Text({
      text: "Base (Required)",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 15,
        fontWeight: "600",
        fill: COLORS.titleRed,
      }),
    });
    this.tofuSubBg = new Graphics();
    this.tofuLabel = new Text({
      text: "Tofu (Choose 1)",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 12,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.oilSubBg = new Graphics();
    this.oilLabel = new Text({
      text: "Oil (Choose 1)",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 12,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.panelsLayer.addChild(
      this.leftBg,
      this.leftHeader,
      this.tofuSubBg,
      this.tofuLabel,
      this.oilSubBg,
      this.oilLabel
    );

    // Right panel
    this.rightBg = new Graphics();
    this.rightHeader = new Text({
      text: "Ingredients",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 15,
        fontWeight: "600",
        fill: COLORS.titleRed,
      }),
    });
    this.panelsLayer.addChild(this.rightBg, this.rightHeader);
  }

  _buildCenter() {
    this.instruction = new Text({
      text: "Drag the ingredients into the prep basket",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 16,
        fill: COLORS.ink,
        align: "center",
        wordWrap: true,
        wordWrapWidth: LAYOUT.centerColumnW,
        lineHeight: 22,
      }),
    });
    this.instruction.anchor.set(0.5, 0);

    this.basketContainer = new Container();
    this.basketContainer.label = "Basket";
    this.basketSprite = new Sprite();
    this.basketSprite.anchor.set(0.5);
    this.basketSprite.width = LAYOUT.basket;
    this.basketSprite.height = LAYOUT.basket;
    this.basketRing = new Graphics();
    this.basketContainer.addChild(this.basketRing, this.basketSprite);
    this.uiLayer.addChild(this.instruction, this.basketContainer);

    Assets.load(basketUrl)
      .then((tex) => {
        this.basketSprite.texture = tex;
      })
      .catch((e) =>
        console.warn("IngredientScene: failed to load basket", e)
      );

    this.selectedListText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 13,
        fill: COLORS.muted,
        align: "center",
        wordWrap: true,
        wordWrapWidth: 360,
        lineHeight: 18,
      }),
    });
    this.selectedListText.anchor.set(0.5, 0);
    this.uiLayer.addChild(this.selectedListText);

    // Continue button
    this.continueBtn = new Container();
    this.continueBtn.label = "ContinueBtn";
    this.continueBtnBg = new Graphics();
    this.continueBtnLabel = new Text({
      text: "Continue",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 18,
        fontWeight: "600",
        fill: COLORS.ink,
      }),
    });
    this.continueBtnLabel.anchor.set(0.5, 0.5);
    this.continueBtn.addChild(this.continueBtnBg, this.continueBtnLabel);
    this.uiLayer.addChild(this.continueBtn);
  }

  _buildItems() {
    const all = [
      ...TOFU.map((it) => ({ ...it, category: "tofu" })),
      ...OILS.map((it) => ({ ...it, category: "oil" })),
      ...INGREDIENTS.map((it) => ({ ...it, category: "ingredient" })),
    ];
    for (const it of all) this.tiles.set(it.id, this._buildTile(it));
  }

  _buildTile({ id, label, category }) {
    const c = new Container();
    c.label = `Tile:${id}`;

    const placeholder = new Graphics()
      .circle(0, 0, LAYOUT.tileR)
      .fill(0xcfd8dd);
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.width = LAYOUT.tileR * 2;
    sprite.height = LAYOUT.tileR * 2;
    sprite.visible = false;

    const labelText = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 11,
        fill: COLORS.ink,
        align: "center",
        wordWrap: true,
        wordWrapWidth: LAYOUT.tileW,
        lineHeight: 13,
      }),
    });
    labelText.anchor.set(0.5, 0);
    labelText.position.set(0, LAYOUT.tileR + 4);

    // Selection overlay (semi-transparent + checkmark badge)
    const overlay = new Container();
    const overlayCircle = new Graphics()
      .circle(0, 0, LAYOUT.tileR)
      .fill({ color: 0xffffff, alpha: 0.55 });
    const checkBg = new Graphics()
      .circle(20, -20, 11)
      .fill(COLORS.checkBadge)
      .stroke({ color: 0xffffff, width: 2 });
    const checkMark = new Text({
      text: "✓",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 13,
        fontWeight: "700",
        fill: 0xffffff,
      }),
    });
    checkMark.anchor.set(0.5);
    checkMark.position.set(20, -20);
    overlay.addChild(overlayCircle, checkBg, checkMark);
    overlay.visible = false;

    c.addChild(placeholder, sprite, overlay, labelText);
    this.itemsLayer.addChild(c);

    const tile = {
      id,
      label,
      category,
      container: c,
      sprite,
      placeholder,
      overlay,
      labelText,
      origin: { x: 0, y: 0 },
      state: "idle",
    };

    const url = URL_BY_ID[id];
    if (url) {
      Assets.load(url)
        .then((tex) => {
          sprite.texture = tex;
          sprite.visible = true;
          placeholder.visible = false;
        })
        .catch((e) =>
          console.warn(`IngredientScene: failed to load ${id}`, e)
        );
    } else {
      console.warn(`IngredientScene: no SVG url for ${id}`);
    }

    return tile;
  }

  // -------- drawing helpers --------

  _drawBackBtn(hovered) {
    const r = LAYOUT.backBtnR;
    this.backBtnBg
      .clear()
      .circle(0, 0, r)
      .fill(hovered ? COLORS.pillYellowHover : COLORS.pillYellow);
  }

  _drawRecipeBtn(hovered) {
    const { w, h, r } = LAYOUT.recipeBtn;
    this.recipeBtnBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(hovered ? COLORS.pillYellowHover : COLORS.pillYellow);
  }

  _drawContinueBtn() {
    const { w, h, r } = LAYOUT.continueBtn;
    const enabled = this._isValid();
    const fill = !enabled
      ? COLORS.pillDisabled
      : this._continueHovered
      ? COLORS.pillYellowHover
      : COLORS.pillYellow;
    this.continueBtnBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(fill);
    this.continueBtnLabel.style.fill = enabled
      ? COLORS.ink
      : COLORS.pillTextDisabled;
  }

  _drawPanelBg(g, x, y, w, h) {
    g.clear()
      .roundRect(x, y, w, h, LAYOUT.panelRadius)
      .fill(COLORS.panelBg)
      .stroke({ color: COLORS.panelStroke, width: 1 });
  }

  _drawSubPanelBg(g, x, y, w, h) {
    g.clear()
      .roundRect(x, y, w, h, LAYOUT.subPanelRadius)
      .fill(COLORS.subPanelBg);
  }

  _drawBasketRing(active) {
    this.basketRing.clear();
    if (active) {
      this.basketRing
        .circle(0, 0, LAYOUT.basket / 2 + 6)
        .stroke({ color: COLORS.basketActiveStroke, width: 5, alpha: 0.85 });
    }
  }

  // -------- layout --------

  resize(screenW, screenH) {
    this._lastResize = [screenW, screenH];
    const {
      pad,
      topBarH,
      leftPanelW,
      rightPanelW,
      panelPad,
      subPanelPad,
      tileW,
      tileH,
      tileGapX,
      tileGapY,
      tileR,
      basket,
    } = LAYOUT;

    // Top bar
    const topY = pad + topBarH / 2;
    this.backBtn.position.set(pad + LAYOUT.backBtnR, topY);
    this.titleText.position.set(
      pad + LAYOUT.backBtnR * 2 + 16,
      topY
    );
    this.recipeBtn.position.set(
      screenW - pad - LAYOUT.recipeBtn.w / 2,
      topY
    );

    // Panel area
    const panelTop = pad + topBarH + 12;
    const panelBottom = screenH - pad;
    const panelH = panelBottom - panelTop;

    const leftX = pad;
    const rightX = screenW - pad - rightPanelW;

    this._drawPanelBg(this.leftBg, leftX, panelTop, leftPanelW, panelH);
    this._drawPanelBg(this.rightBg, rightX, panelTop, rightPanelW, panelH);

    // ---- Left panel
    let cy = panelTop + panelPad;
    this.leftHeader.position.set(leftX + panelPad, cy);
    cy += this.leftHeader.height + 14;

    // Tofu sub-panel: 3 cols
    const tofuCols = 3;
    const tofuRows = Math.ceil(TOFU.length / tofuCols);
    const tofuGridH = tofuRows * tileH + (tofuRows - 1) * tileGapY;
    const subInnerW = leftPanelW - 2 * panelPad;
    const tofuLabelH = 16;
    const tofuSubH =
      subPanelPad + tofuLabelH + 10 + tofuGridH + subPanelPad;
    this._drawSubPanelBg(
      this.tofuSubBg,
      leftX + panelPad,
      cy,
      subInnerW,
      tofuSubH
    );
    this.tofuLabel.position.set(
      leftX + panelPad + subPanelPad,
      cy + subPanelPad - 2
    );

    const tofuGridX = leftX + panelPad + subPanelPad;
    const tofuGridY = cy + subPanelPad + tofuLabelH + 10;
    this._layoutTilesGrid(TOFU, "tofu", tofuGridX, tofuGridY, tofuCols);

    cy += tofuSubH + 16;

    // Oil sub-panel: 3 cols
    const oilCols = 3;
    const oilRows = Math.ceil(OILS.length / oilCols);
    const oilGridH = oilRows * tileH + (oilRows - 1) * tileGapY;
    const oilLabelH = 16;
    const oilSubH =
      subPanelPad + oilLabelH + 10 + oilGridH + subPanelPad;
    this._drawSubPanelBg(
      this.oilSubBg,
      leftX + panelPad,
      cy,
      subInnerW,
      oilSubH
    );
    this.oilLabel.position.set(
      leftX + panelPad + subPanelPad,
      cy + subPanelPad - 2
    );

    const oilGridX = leftX + panelPad + subPanelPad;
    const oilGridY = cy + subPanelPad + oilLabelH + 10;
    this._layoutTilesGrid(OILS, "oil", oilGridX, oilGridY, oilCols);

    // ---- Right panel
    let ry = panelTop + panelPad;
    this.rightHeader.position.set(rightX + panelPad, ry);
    ry += this.rightHeader.height + 14;

    const ingCols = 4;
    const ingGridX = rightX + panelPad;
    const ingGridY = ry;
    this._layoutTilesGrid(INGREDIENTS, "ingredient", ingGridX, ingGridY, ingCols);

    // ---- Center
    const centerX = (leftX + leftPanelW + rightX) / 2;
    const centerTop = panelTop + 16;
    this.instruction.position.set(centerX, centerTop);

    const basketY = centerTop + this.instruction.height + 28 + basket / 2;
    this.basketContainer.position.set(centerX, basketY);

    this.selectedListText.position.set(centerX, basketY + basket / 2 + 16);

    const continueY = screenH - pad - LAYOUT.continueBtn.h / 2;
    this.continueBtn.position.set(centerX, continueY);
    this._drawContinueBtn();
  }

  _layoutTilesGrid(items, category, originX, originY, cols) {
    const cellW = LAYOUT.tileW + LAYOUT.tileGapX;
    const cellH = LAYOUT.tileH + LAYOUT.tileGapY;
    items.forEach((it, i) => {
      const tile = this.tiles.get(it.id);
      if (!tile) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellLeft = originX + col * cellW;
      const cellTop = originY + row * cellH;
      tile.origin.x = cellLeft + LAYOUT.tileW / 2;
      tile.origin.y = cellTop + LAYOUT.tileR;
      if (tile.state === "idle" || tile.state === "selected") {
        tile.container.position.set(tile.origin.x, tile.origin.y);
      }
    });
  }

  // -------- pointer API (unified mouse + hand via PointerManager) --------

  onPointerMove({ x, y }) {
    if (this.grabbed) {
      if (x == null) return;
      this.grabbed.ghost.position.set(x, y);
      const over = this._overBasket(x, y);
      if (over !== this._basketActive) {
        this._basketActive = over;
        this.basketSprite.tint = over ? COLORS.basketTint : 0xffffff;
        this._drawBasketRing(over);
      }
      return;
    }

    if (x == null) {
      this._setBackHovered(false);
      this._setRecipeHovered(false);
      this._setContinueHovered(false);
      return;
    }

    this._setBackHovered(this._inCircle(x, y, this.backBtn, LAYOUT.backBtnR));
    this._setRecipeHovered(this._inRect(x, y, this.recipeBtn, LAYOUT.recipeBtn));
    this._setContinueHovered(
      this._inRect(x, y, this.continueBtn, LAYOUT.continueBtn)
    );
  }

  onPointerDown({ x, y }) {
    if (x == null) return;

    if (this._inCircle(x, y, this.backBtn, LAYOUT.backBtnR)) {
      this.onBack();
      return;
    }
    if (this._inRect(x, y, this.recipeBtn, LAYOUT.recipeBtn)) {
      this.onRecipe();
      return;
    }
    if (
      this._inRect(x, y, this.continueBtn, LAYOUT.continueBtn) &&
      this._isValid()
    ) {
      this.onContinue();
      return;
    }

    const tile = this._tileAt(x, y);
    if (!tile || tile.state === "selected") return;
    this._grab(tile, x, y);
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const { tile, ghost } = this.grabbed;
    this.grabbed = null;
    this._basketActive = false;
    this.basketSprite.tint = 0xffffff;
    this._drawBasketRing(false);

    if (cancelled || x == null || !this._overBasket(x, y)) {
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
      basketCount: this.selected.size,
    };
  }

  // -------- drag / drop internals --------

  _grab(tile, x, y) {
    const ghost = new Container();
    ghost.label = `Ghost:${tile.id}`;

    const shadow = new Graphics()
      .circle(3, 6, LAYOUT.tileR)
      .fill({ color: 0x000000, alpha: 0.28 });
    shadow.filters = [new BlurFilter({ strength: 6 })];

    const ghostSprite = new Sprite(tile.sprite.texture);
    ghostSprite.anchor.set(0.5);
    ghostSprite.width = LAYOUT.tileR * 2;
    ghostSprite.height = LAYOUT.tileR * 2;

    ghost.addChild(shadow, ghostSprite);
    ghost.scale.set(1.1);
    ghost.position.set(x, y);
    this.dragLayer.addChild(ghost);

    this.grabbed = { tile, ghost };
  }

  _snapGhostBack(tile, ghost) {
    const from = { x: ghost.x, y: ghost.y };
    const to = { x: tile.origin.x, y: tile.origin.y };
    const start = performance.now();
    const dur = 200;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      ghost.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      if (t < 1) requestAnimationFrame(step);
      else {
        this.dragLayer.removeChild(ghost);
        ghost.destroy({ children: true });
      }
    };
    requestAnimationFrame(step);
  }

  _addToBasket(tile, ghost) {
    // Mutex categories: replace any existing tofu/oil
    if (tile.category === "tofu" || tile.category === "oil") {
      for (const id of [...this.selected]) {
        const t = this.tiles.get(id);
        if (t && t.category === tile.category && t.id !== tile.id) {
          this._setSelected(t, false);
        }
      }
    }

    this._setSelected(tile, true);
    this._updateValidation();
    this._updateSelectedList();

    // Ghost: tween to basket center with scale pulse, then fade out.
    const from = { x: ghost.x, y: ghost.y };
    const to = { x: this.basketContainer.x, y: this.basketContainer.y };
    const start = performance.now();
    const dur = 280;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      ghost.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      // 1.1 → 1.4 → 0
      let s;
      if (t < 0.45) s = 1.1 + (1.4 - 1.1) * (t / 0.45);
      else s = 1.4 * (1 - (t - 0.45) / 0.55);
      ghost.scale.set(Math.max(0, s));
      ghost.alpha = 1 - Math.max(0, (t - 0.55) / 0.45);
      if (t < 1) requestAnimationFrame(step);
      else {
        this.dragLayer.removeChild(ghost);
        ghost.destroy({ children: true });
      }
    };
    requestAnimationFrame(step);
  }

  _setSelected(tile, selected) {
    if (selected) {
      if (this.selected.has(tile.id)) return;
      this.selected.add(tile.id);
      tile.state = "selected";
      tile.overlay.visible = true;
      tile.container.alpha = 0.7;
    } else {
      this.selected.delete(tile.id);
      tile.state = "idle";
      tile.overlay.visible = false;
      tile.container.alpha = 1;
    }
  }

  _updateValidation() {
    this._drawContinueBtn();
  }

  _updateSelectedList() {
    if (this.selected.size === 0) {
      this.selectedListText.text = "";
      return;
    }
    const labels = [];
    for (const id of this.selected) {
      const t = this.tiles.get(id);
      if (t) labels.push(t.label);
    }
    this.selectedListText.text = labels.join(" • ");
  }

  // -------- helpers --------

  _isValid() {
    let tofu = 0,
      oil = 0,
      ing = 0;
    for (const id of this.selected) {
      const t = this.tiles.get(id);
      if (!t) continue;
      if (t.category === "tofu") tofu++;
      else if (t.category === "oil") oil++;
      else ing++;
    }
    return tofu === 1 && oil === 1 && ing >= 1;
  }

  _tileAt(x, y) {
    for (const tile of this.tiles.values()) {
      const dx = x - tile.container.x;
      const dy = y - tile.container.y;
      if (Math.hypot(dx, dy) <= LAYOUT.tileR) return tile;
    }
    return null;
  }

  _overBasket(x, y) {
    const dx = x - this.basketContainer.x;
    const dy = y - this.basketContainer.y;
    return Math.hypot(dx, dy) <= LAYOUT.basket / 2;
  }

  _inCircle(x, y, container, radius) {
    const dx = x - container.x;
    const dy = y - container.y;
    return Math.hypot(dx, dy) <= radius;
  }

  _inRect(x, y, container, rect) {
    const r = {
      x: container.x - rect.w / 2,
      y: container.y - rect.h / 2,
      width: rect.w,
      height: rect.h,
    };
    return pointInRect(x, y, r);
  }

  _setBackHovered(v) {
    if (v === this._backHovered) return;
    this._backHovered = v;
    this._drawBackBtn(v);
  }
  _setRecipeHovered(v) {
    if (v === this._recipeHovered) return;
    this._recipeHovered = v;
    this._drawRecipeBtn(v);
  }
  _setContinueHovered(v) {
    if (v === this._continueHovered) return;
    this._continueHovered = v;
    this._drawContinueBtn();
  }
}

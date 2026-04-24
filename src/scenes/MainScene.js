import { Container, Graphics, Text, TextStyle, BlurFilter } from "pixi.js";

const FONT_STACK =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const COLORS = {
  ink: 0x2a2a2a,
  muted: 0x6f6a62,
  panelBg: 0xf2efe9,
  panelStroke: 0xe3ded4,
  subPanelBg: 0xe8e5e0,
  itemBg: 0xd8d3cc,
  itemStroke: 0xbcb6ab,
  button: 0xd8d3cc,
  buttonHover: 0xc7beb0,
  basketBg: 0xd8d3cc,
  basketBgActive: 0xcbb8a6,
  accent: 0xd96a3a,
};

const LAYOUT = {
  screenPad: 24,
  topBarH: 64,
  panelPad: 24,
  panelRadius: 18,
  subPanelRadius: 12,
  subPanelPad: 16,
  circleR: 40,
  gridGap: 20,
  panelW: 328, // 3*80 + 2*20 + 2*24
  headerToGrid: 14,
  panelGap: 32,
  basketR: 140,
  continueBtn: { w: 140, h: 48, r: 24 },
  recipeBtn: { w: 180, h: 40, r: 20 },
};

const REQUIRED = [
  "Tofu",
  "Ground Pork",
  "Doubanjiang",
  "Douchi",
  "Scallions",
  "Garlic",
];
const OPTIONAL = [
  "Ginger",
  "Soy Sauce",
  "Rice Wine",
  "Sugar",
  "Mushroom",
  "Carrot",
  "Bell Pepper",
  "Bamboo",
  "Peanuts",
  "Celery",
  "Chili Oil",
  "Pepper",
];
const CONDIMENTS = [
  "Black Vinegar",
  "Sesame Oil",
  "Sichuan Pepper",
  "Star Anise",
  "Bay Leaf",
  "Cumin",
  "Salt",
  "MSG",
  "Chicken Stock",
  "Palm Sugar",
  "Cornstarch",
  "Rice Vinegar",
  "Light Soy",
  "Dark Soy",
  "Oyster Sauce",
];

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function tween({ from, to, duration, easing, onUpdate, onComplete }) {
  const start = performance.now();
  let cancelled = false;
  const step = () => {
    if (cancelled) return;
    const t = Math.min(1, (performance.now() - start) / duration);
    const e = easing(t);
    onUpdate({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
    });
    if (t < 1) requestAnimationFrame(step);
    else if (onComplete) onComplete();
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class MainScene {
  constructor({ onContinuePressed } = {}) {
    this.onContinuePressed = onContinuePressed ?? (() => {});

    this.root = new Container();
    this.root.label = "MainScene";

    this.panelsLayer = new Container();
    this.itemsLayer = new Container();
    this.uiLayer = new Container();
    this.tooltipLayer = new Container();
    this.root.addChild(
      this.panelsLayer,
      this.itemsLayer,
      this.uiLayer,
      this.tooltipLayer
    );

    this._buildTopBar();
    this._buildPanels();
    this._buildCenter();
    this._buildItems();
    this._buildTooltip();

    this.grabbed = null;
    this.basketContents = []; // array of item ids in drop order
    this._basketActive = false;
    this._hoveredItemId = null;
    this._continueHovered = false;
  }

  // -------- construction --------

  _buildTopBar() {
    this.titleText = new Text({
      text: "Mapo Tofu, Maybe",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 22,
        fontWeight: "500",
        fill: COLORS.ink,
        letterSpacing: 0.3,
      }),
    });
    this.titleText.anchor.set(0, 0.5);

    this.recipeBtn = new Container();
    this.recipeBtnBg = new Graphics();
    this.recipeBtnLabel = new Text({
      text: "traditional recipe",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 13,
        fill: COLORS.ink,
      }),
    });
    this.recipeBtnLabel.anchor.set(0.5, 0.5);
    this.recipeBtn.addChild(this.recipeBtnBg, this.recipeBtnLabel);
    this._drawPillButton(
      this.recipeBtnBg,
      LAYOUT.recipeBtn.w,
      LAYOUT.recipeBtn.h,
      LAYOUT.recipeBtn.r,
      false
    );

    this.uiLayer.addChild(this.titleText, this.recipeBtn);
  }

  _buildPanels() {
    // Left panel
    this.leftBg = new Graphics();
    this.leftHeader = new Text({
      text: "Ingredients Section",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 14,
        fontWeight: "500",
        fill: COLORS.ink,
      }),
    });
    this.requiredSubBg = new Graphics();
    this.requiredLabel = new Text({
      text: "Required",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 12,
        fill: COLORS.muted,
      }),
    });

    this.panelsLayer.addChild(
      this.leftBg,
      this.leftHeader,
      this.requiredSubBg,
      this.requiredLabel
    );

    // Right panel
    this.rightBg = new Graphics();
    this.rightHeader = new Text({
      text: "Condiments Section",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 14,
        fontWeight: "500",
        fill: COLORS.ink,
      }),
    });
    this.panelsLayer.addChild(this.rightBg, this.rightHeader);
  }

  _buildCenter() {
    this.instruction = new Text({
      text:
        "Drag the ingredients and condiments you want into the basket.",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 15,
        fill: COLORS.ink,
        align: "center",
        wordWrap: true,
        wordWrapWidth: 360,
        lineHeight: 22,
      }),
    });
    this.instruction.anchor.set(0.5, 0);

    this.basket = new Graphics();
    this.basketLabel = new Text({
      text: "Food Basket",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 13,
        fill: COLORS.muted,
      }),
    });
    this.basketLabel.anchor.set(0.5, 0.5);

    this.continueBtn = new Container();
    this.continueBtnBg = new Graphics();
    this.continueBtnLabel = new Text({
      text: "Continue",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 15,
        fontWeight: "500",
        fill: COLORS.ink,
      }),
    });
    this.continueBtnLabel.anchor.set(0.5, 0.5);
    this.continueBtn.addChild(this.continueBtnBg, this.continueBtnLabel);
    this._drawPillButton(
      this.continueBtnBg,
      LAYOUT.continueBtn.w,
      LAYOUT.continueBtn.h,
      LAYOUT.continueBtn.r,
      false
    );

    this.panelsLayer.addChild(this.basket);
    this.uiLayer.addChild(this.instruction, this.basketLabel, this.continueBtn);

    this._drawBasket(false);
  }

  _buildItems() {
    this.items = [];
    REQUIRED.forEach((label, i) => this._addItem(`req_${i}`, label, "required"));
    OPTIONAL.forEach((label, i) => this._addItem(`opt_${i}`, label, "optional"));
    CONDIMENTS.forEach((label, i) =>
      this._addItem(`con_${i}`, label, "condiment")
    );
  }

  _addItem(id, label, section) {
    const container = new Container();
    container.label = `Item:${id}`;

    const shadow = new Graphics()
      .circle(3, 6, LAYOUT.circleR)
      .fill({ color: 0x000000, alpha: 0.28 });
    shadow.filters = [new BlurFilter({ strength: 6 })];
    shadow.visible = false;

    const circle = new Graphics()
      .circle(0, 0, LAYOUT.circleR)
      .fill(COLORS.itemBg)
      .stroke({ color: COLORS.itemStroke, width: 1 });

    container.addChild(shadow, circle);

    const item = {
      id,
      label,
      section,
      container,
      circle,
      shadow,
      origin: { x: 0, y: 0 },
      state: "idle", // idle | grabbed | returning | inBasket
      basketOffset: null,
      _tweenCancel: null,
    };
    this.items.push(item);
    this.itemsLayer.addChild(container);
  }

  _buildTooltip() {
    this.tooltip = new Container();
    this.tooltipBg = new Graphics();
    this.tooltipText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: FONT_STACK,
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    this.tooltipText.anchor.set(0.5, 0.5);
    this.tooltip.addChild(this.tooltipBg, this.tooltipText);
    this.tooltip.visible = false;
    this.tooltipLayer.addChild(this.tooltip);
  }

  // -------- drawing helpers --------

  _drawPillButton(g, w, h, r, hovered) {
    g.clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(hovered ? COLORS.buttonHover : COLORS.button);
  }

  _drawBasket(active) {
    this._basketActive = active;
    this.basket
      .clear()
      .circle(0, 0, LAYOUT.basketR)
      .fill(active ? COLORS.basketBgActive : COLORS.basketBg);
    if (active) {
      this.basket.stroke({ color: COLORS.accent, width: 4, alpha: 0.7 });
    } else {
      this.basket.stroke({ color: COLORS.itemStroke, width: 1 });
    }
  }

  _drawPanelBg(g, x, y, w, h) {
    g.clear()
      .roundRect(x, y, w, h, LAYOUT.panelRadius)
      .fill(COLORS.panelBg)
      .stroke({ color: COLORS.panelStroke, width: 1 });
  }

  // -------- layout --------

  resize(screenW, screenH) {
    const {
      screenPad,
      topBarH,
      panelPad,
      subPanelPad,
      circleR,
      gridGap,
      panelW,
      headerToGrid,
      panelGap,
      basketR,
    } = LAYOUT;

    // Top bar
    const topY = screenPad + topBarH / 2;
    this.titleText.position.set(screenPad + 4, topY);
    this.recipeBtn.position.set(
      screenW - screenPad - LAYOUT.recipeBtn.w / 2,
      topY
    );

    // Panel region
    const panelTop = screenPad + topBarH + 12;
    const panelBottom = screenH - screenPad;
    const panelH = panelBottom - panelTop;

    const leftX = screenPad;
    const rightX = screenW - screenPad - panelW;

    this._drawPanelBg(this.leftBg, leftX, panelTop, panelW, panelH);
    this._drawPanelBg(this.rightBg, rightX, panelTop, panelW, panelH);

    // LEFT: header, required sub-panel, then 3x4 optional grid
    const leftInnerX = leftX + panelPad;
    let cy = panelTop + panelPad;
    this.leftHeader.position.set(leftInnerX, cy);
    cy += this.leftHeader.height + headerToGrid;

    const gridStepX = 2 * circleR + gridGap;
    const gridStartX = leftInnerX + circleR; // first column center

    // Required sub-panel: 3x2
    const subInnerW = panelW - 2 * panelPad;
    const subHeaderH = 18;
    const reqRows = 2;
    const reqGridH = reqRows * (2 * circleR) + (reqRows - 1) * gridGap;
    const subH = subPanelPad + subHeaderH + 8 + reqGridH + subPanelPad;
    this.requiredSubBg
      .clear()
      .roundRect(leftInnerX, cy, subInnerW, subH, LAYOUT.subPanelRadius)
      .fill(COLORS.subPanelBg);
    this.requiredLabel.position.set(
      leftInnerX + subPanelPad,
      cy + subPanelPad - 2
    );

    const reqGridY = cy + subPanelPad + subHeaderH + 8 + circleR;
    this._layoutSectionItems("required", gridStartX, reqGridY, 3, gridStepX);

    cy += subH + 20;

    // Optional: 3x4 grid
    const optGridY = cy + circleR;
    this._layoutSectionItems("optional", gridStartX, optGridY, 3, gridStepX);

    // RIGHT: header, 3x5 condiments grid
    const rightInnerX = rightX + panelPad;
    let ry = panelTop + panelPad;
    this.rightHeader.position.set(rightInnerX, ry);
    ry += this.rightHeader.height + headerToGrid;
    const conGridStartX = rightInnerX + circleR;
    const conGridY = ry + circleR;
    this._layoutSectionItems("condiment", conGridStartX, conGridY, 3, gridStepX);

    // CENTER
    const centerX = (leftX + panelW + rightX) / 2;
    const centerTop = panelTop + 24;

    this.instruction.position.set(centerX, centerTop);
    const instructionH = this.instruction.height;

    const basketY = centerTop + instructionH + 28 + basketR;
    this.basket.position.set(centerX, basketY);
    this.basketLabel.position.set(centerX, basketY);

    const continueY = basketY + basketR + 40;
    this.continueBtn.position.set(centerX, continueY);

    // Push all items to their origin positions
    for (const item of this.items) {
      if (item.state === "idle") {
        item.container.position.set(item.origin.x, item.origin.y);
      } else if (item.state === "inBasket") {
        item.container.position.set(
          this.basket.x + item.basketOffset.x,
          this.basket.y + item.basketOffset.y
        );
      }
      // grabbed/returning: leave where they are; return tween targets old origin
    }
  }

  _layoutSectionItems(section, gridStartX, gridStartY, cols, stepX) {
    const items = this.items.filter((i) => i.section === section);
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      item.origin.x = gridStartX + col * stepX;
      item.origin.y = gridStartY + row * stepX;
    });
  }

  // -------- event API --------

  onPointerMove({ x, y, pinching }) {
    // Hover tooltip only when not pinching
    if (pinching || this.grabbed || x == null) {
      this._setHoveredItem(null);
    } else {
      const item = this._itemAt(x, y, { excludeInBasket: true });
      this._setHoveredItem(item?.id ?? null);
    }

    // Continue button hover (visible only when not grabbing)
    const overContinue =
      !this.grabbed && x != null && this._isOverContinue(x, y);
    if (overContinue !== this._continueHovered) {
      this._continueHovered = overContinue;
      this._drawPillButton(
        this.continueBtnBg,
        LAYOUT.continueBtn.w,
        LAYOUT.continueBtn.h,
        LAYOUT.continueBtn.r,
        overContinue
      );
    }
  }

  onPinchStart({ position }) {
    if (!position) return;
    const { x, y } = position;

    // Continue button pinch-click
    if (this._isOverContinue(x, y)) {
      this.onContinuePressed();
      return;
    }

    // Grab an item
    const item = this._itemAt(x, y, { excludeInBasket: true });
    if (!item) return;
    this._grab(item, x, y);
  }

  onPinchMove({ position }) {
    if (!position || !this.grabbed) return;
    const { x, y } = position;
    this.grabbed.container.position.set(x, y);
    // Live basket-hover feedback
    const over = this._isOverBasket(x, y);
    if (over !== this._basketActive) {
      this._drawBasket(over);
    }
  }

  onPinchEnd({ position, cancelled }) {
    if (!this.grabbed) return;
    const item = this.grabbed;
    this.grabbed = null;

    if (cancelled || !position) {
      this._returnToOrigin(item);
      this._drawBasket(false);
      return;
    }

    const { x, y } = position;
    if (this._isOverBasket(x, y)) {
      this._snapToBasket(item);
    } else {
      this._returnToOrigin(item);
    }
    this._drawBasket(false);
  }

  getState() {
    return {
      grabbedId: this.grabbed?.id ?? null,
      basketCount: this.basketContents.length,
    };
  }

  // -------- internals --------

  _grab(item, x, y) {
    // Cancel any return tween in progress
    item._tweenCancel?.();
    item._tweenCancel = null;

    item.state = "grabbed";
    item.shadow.visible = true;
    item.container.scale.set(1.1);
    // Lift to top of items layer
    this.itemsLayer.addChild(item.container);
    item.container.position.set(x, y);

    this.grabbed = item;
    this._setHoveredItem(null);
  }

  _returnToOrigin(item) {
    item.state = "returning";
    item.container.scale.set(1);
    item.shadow.visible = false;
    const from = { x: item.container.x, y: item.container.y };
    item._tweenCancel?.();
    item._tweenCancel = tween({
      from,
      to: { ...item.origin },
      duration: 200,
      easing: easeOutCubic,
      onUpdate: (p) => item.container.position.set(p.x, p.y),
      onComplete: () => {
        if (item.state === "returning") item.state = "idle";
        item._tweenCancel = null;
      },
    });
  }

  _snapToBasket(item) {
    item.state = "inBasket";
    item.shadow.visible = false;
    item.container.scale.set(1);
    const offset = this._findBasketSpot(LAYOUT.circleR);
    item.basketOffset = offset;
    const target = {
      x: this.basket.x + offset.x,
      y: this.basket.y + offset.y,
    };
    const from = { x: item.container.x, y: item.container.y };
    item._tweenCancel?.();
    item._tweenCancel = tween({
      from,
      to: target,
      duration: 180,
      easing: easeOutCubic,
      onUpdate: (p) => item.container.position.set(p.x, p.y),
      onComplete: () => {
        item._tweenCancel = null;
      },
    });
    this.basketContents.push(item.id);
  }

  _findBasketSpot(itemR) {
    const maxR = LAYOUT.basketR - itemR - 10;
    const minDist = 2 * itemR * 0.85;
    for (let t = 0; t < 40; t++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * maxR;
      const cx = Math.cos(angle) * r;
      const cy = Math.sin(angle) * r;
      let ok = true;
      for (const id of this.basketContents) {
        const other = this.items.find((i) => i.id === id);
        if (!other || !other.basketOffset) continue;
        const dx = cx - other.basketOffset.x;
        const dy = cy - other.basketOffset.y;
        if (Math.hypot(dx, dy) < minDist) {
          ok = false;
          break;
        }
      }
      if (ok) return { x: cx, y: cy };
    }
    return { x: 0, y: 0 };
  }

  _itemAt(x, y, { excludeInBasket = false } = {}) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (excludeInBasket && it.state === "inBasket") continue;
      if (it.state === "grabbed") continue;
      const dx = x - it.container.x;
      const dy = y - it.container.y;
      if (Math.hypot(dx, dy) <= LAYOUT.circleR) return it;
    }
    return null;
  }

  _isOverBasket(x, y) {
    const dx = x - this.basket.x;
    const dy = y - this.basket.y;
    return Math.hypot(dx, dy) <= LAYOUT.basketR;
  }

  _isOverContinue(x, y) {
    const { w, h } = LAYOUT.continueBtn;
    const rect = {
      x: this.continueBtn.x - w / 2,
      y: this.continueBtn.y - h / 2,
      width: w,
      height: h,
    };
    return pointInRect(x, y, rect);
  }

  _setHoveredItem(id) {
    if (id === this._hoveredItemId) return;
    this._hoveredItemId = id;
    if (!id) {
      this.tooltip.visible = false;
      return;
    }
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    this.tooltipText.text = item.label;
    const pad = 8;
    const tw = this.tooltipText.width + pad * 2;
    const th = this.tooltipText.height + pad;
    this.tooltipBg
      .clear()
      .roundRect(-tw / 2, -th / 2, tw, th, 6)
      .fill({ color: 0x2a2a2a, alpha: 0.9 });
    this.tooltipText.position.set(0, 0);
    this.tooltip.position.set(
      item.container.x,
      item.container.y - LAYOUT.circleR - 18
    );
    this.tooltip.visible = true;
  }
}

import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
} from "pixi.js";
import { cookingStore } from "../cooking/cookingStore.js";
import { buildRecipeText } from "../cooking/recipeText.js";
import { galleryStore } from "../gallery/galleryStore.js";

// Scene 7 — Name Your Dish.
// Pixi handles the dish image at the top + the "Add to Gallery" pill.
// The form (title input, recipe textarea, note textarea) is a DOM overlay
// because Pixi has no native text editing — its position is in viewport
// pixels (centered), so it sits cleanly above the canvas regardless of scale.

const CANVAS = { w: 1920, h: 1080 };

const FONT = {
  mono:
    '"Intel One Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lato: '"Lato", system-ui, -apple-system, sans-serif',
};

const COLORS = {
  ink: 0x2a2a2a,
  titleRed: 0x980007,
  yellow: 0xffdb00,
  yellowHover: 0xffe633,
  yellowDisabled: 0xe2e2e2,
  yellowDisabledText: 0xffffff,
  outline: 0x333333,
};

const ADD_BTN = { w: 280, h: 78, r: 39, cx: CANVAS.w / 2, cy: 1000 };

export class NameDishScene {
  static bgClass = "bg-blue";
  bgClass = "bg-blue";

  constructor({ onAdded, onMakeAnother } = {}) {
    this.onAdded = onAdded ?? (() => {});
    this.onMakeAnother = onMakeAnother ?? (() => {});

    this.root = new Container();
    this.root.label = "NameDishScene";

    this.bgLayer = new Container();
    this.uiLayer = new Container();
    this.root.addChild(this.bgLayer, this.uiLayer);

    this._scale = 1;
    this._addHovered = false;
    this._formEl = null;
    this._confirmEl = null;

    this._buildTopBar();
    this._buildDishHolder();
    this._buildAddButton();
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._loadDishImage();
    this._mountForm();
    this._refreshAddButton();
  }

  onExit() {
    this._unmountForm();
    this._unmountConfirmation();
  }

  // ---------- build ----------

  _buildTopBar() {
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
    this.titleText.anchor.set(0.5, 0);
    this.titleText.position.set(CANVAS.w / 2, 48);
    this.uiLayer.addChild(this.titleText);
  }

  _buildDishHolder() {
    this.dishHolder = new Container();
    this.dishHolder.position.set(CANVAS.w / 2, 200);
    this.dishSprite = new Sprite();
    this.dishSprite.anchor.set(0.5, 0);
    this.dishHolder.addChild(this.dishSprite);
    this.bgLayer.addChild(this.dishHolder);
  }

  _buildAddButton() {
    this.addBtn = new Container();
    this.addBtn.position.set(ADD_BTN.cx, ADD_BTN.cy);
    this.addBg = new Graphics();
    this.addLabel = new Text({
      text: "Add to Gallery",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontSize: 26,
        fontWeight: "700",
        fill: COLORS.titleRed,
      }),
    });
    this.addLabel.anchor.set(0.5, 0.5);
    this.addBtn.addChild(this.addBg, this.addLabel);
    this._drawAddBtn();
    this.uiLayer.addChild(this.addBtn);
  }

  _drawAddBtn() {
    const enabled = this._isValid();
    const fill = !enabled
      ? COLORS.yellowDisabled
      : this._addHovered
      ? COLORS.yellowHover
      : COLORS.yellow;
    this.addBg
      .clear()
      .roundRect(-ADD_BTN.w / 2, -ADD_BTN.h / 2, ADD_BTN.w, ADD_BTN.h, ADD_BTN.r)
      .fill(fill);
    this.addLabel.style.fill = enabled
      ? COLORS.titleRed
      : COLORS.yellowDisabledText;
  }

  // ---------- dish image ----------

  async _loadDishImage() {
    const url = cookingStore.getState().dishImageUrl;
    if (!url) return;
    try {
      const tex = await Assets.load(url);
      this.dishSprite.texture = tex;
      const targetW = 320;
      const tw = tex.width || 1;
      const th = tex.height || 1;
      this.dishSprite.width = targetW;
      this.dishSprite.height = (targetW * th) / tw;
    } catch (e) {
      console.warn("NameDishScene: failed to load dish image", e);
    }
  }

  // ---------- DOM form ----------

  _mountForm() {
    if (this._formEl) return;
    const state = cookingStore.getState();
    const recipePrefill = buildRecipeText(state);

    const wrap = document.createElement("div");
    wrap.className = "name-dish-form";
    wrap.innerHTML = `
      <input class="nd-title" type="text" maxlength="80"
             placeholder="Name your mapo tofu" />
      <label class="nd-label">Recipe</label>
      <textarea class="nd-recipe" rows="6"
                placeholder="Edit the recipe…"></textarea>
      <label class="nd-label">Personal note</label>
      <textarea class="nd-note" rows="3"
                placeholder="Why is this your mapo tofu?"></textarea>
    `;
    document.body.appendChild(wrap);
    this._formEl = wrap;

    const titleInput = wrap.querySelector(".nd-title");
    const recipeInput = wrap.querySelector(".nd-recipe");
    const noteInput = wrap.querySelector(".nd-note");

    titleInput.value = state.dishTitle || "";
    recipeInput.value = state.dishRecipe || recipePrefill;
    noteInput.value = state.dishNote || "";
    cookingStore.setDishRecipe(recipeInput.value);

    titleInput.addEventListener("input", () => {
      cookingStore.setDishTitle(titleInput.value);
      this._drawAddBtn();
    });
    recipeInput.addEventListener("input", () => {
      cookingStore.setDishRecipe(recipeInput.value);
    });
    noteInput.addEventListener("input", () => {
      cookingStore.setDishNote(noteInput.value);
    });

    this._titleInput = titleInput;
  }

  _unmountForm() {
    if (this._formEl) {
      this._formEl.remove();
      this._formEl = null;
      this._titleInput = null;
    }
  }

  // ---------- pointer / scene API ----------

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
    if (p.x == null) {
      this._setAddHovered(false);
      return;
    }
    this._setAddHovered(this._inAddBtn(p.x, p.y) && this._isValid());
  }

  onPointerDown({ x, y }) {
    const p = this._toDesign(x, y);
    if (p.x == null) return;
    if (!this._inAddBtn(p.x, p.y)) return;
    if (this._isValid()) {
      this._handleAdd();
    } else {
      // Hint that the title is required: focus the input so the cursor
      // appears there and the user knows what to do next.
      this._titleInput?.focus();
    }
  }

  onPointerUp() {}
  update() {}
  getPointerDwell() {
    return 0;
  }
  getState() {
    return { grabbedId: null, basketCount: 0 };
  }

  // ---------- add to gallery ----------

  _handleAdd() {
    const state = cookingStore.getState();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: state.dishTitle.trim(),
      recipe: state.dishRecipe,
      note: state.dishNote,
      dishImageUrl: state.dishImageUrl,
      ingredients: state.potOrder.map((p) => p.name),
      timestamp: new Date().toISOString(),
    };
    galleryStore.addEntry(entry);
    this.onAdded(entry);

    // Replace the form with a confirmation overlay so the user has clear
    // feedback that the entry landed (no popup-blocker games).
    this._unmountForm();
    this.addBtn.visible = false;
    this._mountConfirmation(entry);
  }

  _mountConfirmation(entry) {
    if (this._confirmEl) this._unmountConfirmation();

    const wrap = document.createElement("div");
    wrap.className = "post-add-overlay";
    const title = entry.title || "Untitled";
    const imgHtml = entry.dishImageUrl
      ? `<img class="pa-image" src="${entry.dishImageUrl}" alt="${title}" />`
      : `<div class="pa-image pa-image-placeholder">No image</div>`;
    wrap.innerHTML = `
      <h2 class="pa-title">Added to the gallery</h2>
      ${imgHtml}
      <p class="pa-name">“${title}” is now in the museum.</p>
      <div class="pa-actions">
        <a class="pa-btn pa-primary" href="/gallery" target="_blank" rel="noopener">View Gallery</a>
        <button class="pa-btn pa-secondary" id="pa-make-another" type="button">Make Another</button>
      </div>
    `;
    document.body.appendChild(wrap);
    this._confirmEl = wrap;

    wrap.querySelector("#pa-make-another")?.addEventListener("click", () => {
      this._unmountConfirmation();
      this.onMakeAnother();
    });
  }

  _unmountConfirmation() {
    if (this._confirmEl) {
      this._confirmEl.remove();
      this._confirmEl = null;
    }
  }

  // ---------- helpers ----------

  _isValid() {
    return (cookingStore.getState().dishTitle || "").trim().length > 0;
  }

  _refreshAddButton() {
    this._drawAddBtn();
  }

  _toDesign(x, y) {
    if (x == null || y == null) return { x: null, y: null };
    return {
      x: (x - this.root.x) / this._scale,
      y: (y - this.root.y) / this._scale,
    };
  }

  _inAddBtn(x, y) {
    return (
      Math.abs(x - this.addBtn.x) <= ADD_BTN.w / 2 &&
      Math.abs(y - this.addBtn.y) <= ADD_BTN.h / 2
    );
  }

  _setAddHovered(v) {
    if (v === this._addHovered) return;
    this._addHovered = v;
    this._drawAddBtn();
  }
}

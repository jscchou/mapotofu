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
import { heatLevelName } from "../cooking/recipeText.js";
import { findCookware, STOVE_REF } from "../data/cookware.js";
import { ingredients as INGREDIENT_DATA } from "../data/ingredients.js";
import { HandButtonDwell } from "../input/HandButtonDwell.js";
import { HandHoverPicker } from "../input/HandHoverPicker.js";
import { mountMissingTofuModal } from "../ui/MissingTofuModal.js";
import { showFireOffToast } from "../ui/FireOffToast.js";
import {
  buttonClick,
  hoverTick,
  itemPickup,
  itemDropPot,
  itemRejected,
  fireAdjust,
  cookingComplete,
} from "../audio/soundEngine.js";

// Scene 5 — Cookstation.
//
//   ┌──────────────┐  ┌────── instruction text ──────┐  ┌──────────────┐
//   │ Your         │  │                               │  │ Your Recipe  │
//   │ Selection    │  │   (stove + selected pan)      │  │              │
//   │ (scrollable  │  │                               │  │ (live action │
//   │  ingredient  │  │   ▼ heat slider ▼             │  │  log)        │
//   │  grid)       │  │                               │  │              │
//   │              │  │                               │  └──────────────┘
//   │              │  │                               │   [ Done! ]
//   └──────────────┘  └───────────────────────────────┘
//
// Reads from cookingStore: selectedIngredients (Scene 3) and
// selectedCookware (Scene 4). Writes potOrder + recipeLog as the user
// drags ingredients onto the pan and slides the heat knob.

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
  labelBrown: 0x4e2700,
  bookCream: 0xfffbe4,
  yellowBtn: 0xffdb00,
  yellowBtnHover: 0xffe633,
  cardBg: 0xfffef6, // panel translucent fill (Pixi can't backdrop-blur)
  cardBorder: 0xffd900,
  panActiveStroke: 0xd96a3a,
  // Heat slider
  trackFill: 0xff6234, // approx rgba(255, 98, 54, 0.52)
  trackStroke: 0xc02a00,
  knobFill: 0x555555,
  knobIndicator: 0x000000,
  flameOrange: 0xff6034,
  // Scrollbar
  scrollTrack: 0xefefef,
  scrollThumb: 0xffdb00,
  // Done button
  doneText: 0x980007,
};

// Top bar (matches Scene 3 / Scene 4)
const BACK_BTN = { cx: 80, cy: 83, r: 23 };
const TITLE = { x: 140, cy: 82 };
const RECIPE_BTN = {
  w: 349,
  h: 75,
  r: 40,
  x: CANVAS.w - 35 - 349,
  y: 35,
};

const INSTRUCTION = { cx: CANVAS.w / 2, y: 130, wrapWidth: 720 };

const LEFT_PANEL = {
  x: 57,
  y: 172,
  w: 469,
  h: 840,
  pad: 24,
  headerY: 28,
};

const RIGHT_PANEL = {
  x: 1370,
  y: 172,
  w: 497,
  h: 690,
  pad: 24,
  headerY: 28,
};

const STOVE = { x: 700, y: 320, w: 496, h: 517 };

// Three-position discrete heat selector. Positions are fractions of
// the track (so resizing the track doesn't break the layout). The
// fillFraction array tells the orange progress bar how far to grow at
// each heat level — heat 0 is "off, before any selection" and only
// reachable as initial state, since snap targets are 1/2/3 only.
//
// Positions: small flame's left edge sits at the track's left end,
// large group's right edge sits at the track's right end. The math:
// small icon 40 px → half=20 → 20/550 ≈ 0.036; large group 162 px →
// half=81 → (550-81)/550 ≈ 0.853. Medium stays centered. With these
// extremes the three levels visually span the full slider, exactly
// what the player needs to read level differences at a glance.
//
// `cy` and `flameY` shifted down again so the slider sits well below
// the stove area + cookware handle (handle bottom ≈ y=867 for the wok
// — see src/data/cookware.js for the exact offsets).
const HEAT_SLIDER = {
  cx: STOVE.x + STOVE.w / 2, // 948
  cy: 1020,
  trackW: 550,
  trackH: 14,
  knobR: 34.5,
  flameY: 960, // above the track — flames are visual labels, not on it
  steps: 3, // 1 = small, 2 = medium, 3 = large
  // Medium sits at 0.45 — the geometric midpoint between small (0.04)
  // and large (0.85) — so the small→medium and medium→large gaps look
  // visually balanced rather than skewed toward the right.
  positions: [0.04, 0.45, 0.85], // small left-aligned, large right-aligned
  fillFraction: [0, 0.04, 0.45, 0.85], // fill ends at the knob position
  iconSize: [0, 40, 44, 50], // px per flame, indexed by level
  iconCount: [0, 1, 2, 3], // number of flames per level
  iconGap: 6, // gap between flames in level-2 + level-3 groups
};

const FIRE_ICON_URL = "/Fire-small.png";

const DONE_BTN = {
  cx: RIGHT_PANEL.x + RIGHT_PANEL.w - 419 / 2, // right-aligned with right panel
  cy: 902 + 90 / 2,
  w: 419,
  h: 90,
  r: 40,
};

// Left-panel ingredient tile + scrollbar
const TILE = { size: 124, radius: 12, gap: 20, spriteMax: 76 };
const TILE_COLS = 3;
const TILE_LABEL_GAP = 6;
const TILE_ROW_PITCH = TILE.size + TILE_LABEL_GAP + 38; // tile + label + vgap
const SCROLLBAR = { width: 16, radius: 20, trackInset: 8 };

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

function tileLabelStyle(name) {
  // Tile labels: 16px for short names, 12px for long ones (allow 2 lines).
  if ((name ?? "").length <= 12) {
    return { fontSize: 16, lineHeight: 20 };
  }
  return { fontSize: 12, lineHeight: 15 };
}

function recipeEntryText(entry) {
  if (entry.type === "ingredient") {
    return `→ Added ${entry.value?.name ?? "ingredient"}`;
  }
  if (entry.type === "heat") {
    return `→ Set heat to ${heatLevelName(entry.value)}`;
  }
  return "→ ?";
}

export class CookingScene {
  static bgClass = "bg-blue";
  bgClass = "bg-blue";

  constructor({ onBack, onDone, onRecipe } = {}) {
    this.onBack = onBack ?? (() => {});
    this.onDone = onDone ?? (() => {});
    this.onRecipe = onRecipe ?? (() => {});

    this.root = new Container();
    this.root.label = "CookingScene";

    // Layers (bottom → top)
    this.panelsLayer = new Container();
    this.stoveLayer = new Container();
    this.tilesScrollContainer = new Container(); // scrollable left-panel grid
    this.recipeScrollContainer = new Container(); // scrollable right-panel log
    this.uiLayer = new Container(); // top bar, instruction, slider, done button
    this.dragLayer = new Container();
    this.root.addChild(
      this.panelsLayer,
      this.stoveLayer,
      this.tilesScrollContainer,
      this.recipeScrollContainer,
      this.uiLayer,
      this.dragLayer
    );

    this.tiles = new Map(); // ingredient id → tile object
    this.recipeEntryTexts = []; // Pixi Text objects for each log entry
    this.grabbed = null;
    this._scale = 1;

    this._tileScrollOffset = 0;
    this._tileScrollMax = 0;
    this._tileViewportH = 0;
    this._recipeScrollOffset = 0;
    this._recipeScrollMax = 0;
    this._recipeViewportH = 0;

    this._panActive = false;
    this._doneHovered = false;
    this._recipeHovered = false;
    this._lastHoveredTileId = null;
    this._lastVisualHeatLevel = null;
    // Pan hover/off-pan accumulators for the hand-grab preview window
    // (replaces the old instant auto-drop-on-entry behaviour).
    this._panOverSince = null;
    this._panOffSince = null;
    // Heat slider state. _sliderDragging gates the settled-paint path
    // so it doesn't fight the drag handler over the knob's position.
    // _heatTweenId is bumped each time we kick off a snap animation so
    // a newer tween cancels older ones cleanly.
    this._sliderDragging = false;
    this._heatTweenId = 0;
    this._currentFillFraction = 0;

    this._wheelHandler = null;
    this._unsub = null;

    this._buildPanels();
    this._buildTopBar();
    this._buildInstruction();
    this._buildStoveAndPan();
    this._buildHeatSlider();
    this._buildRecipeLogContainer();
    this._buildDoneButton();

    // Hand-hover-to-press for every clickable button. Tile drag uses
    // the fist gesture; the heat slider uses pinch — both are gated in
    // onPointerDown via gestureType, not here.
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
      "done",
      (x, y) => this._inDoneBtn(x, y),
      () => {
        // Validation gate: tofu must be in the pot before the dish is
        // sent to the Gemini API. If it's missing, show the blocking
        // modal — Go Back resets cooking progress so the player can
        // try again with a clean pot. Gemini is never called.
        if (!this._potHasTofu()) {
          this._showMissingTofuModal();
          return;
        }
        cookingComplete();
        this.onDone();
      }
    );

    // Hover-to-pick for ingredient tiles.
    this.tilePicker = new HandHoverPicker({
      getHoveredTarget: (x, y) => {
        const tile = this._tileAt(x, y);
        if (!tile || !tile.hasAsset || !tile.sprite.texture) return null;
        return tile;
      },
      onPick: (tile, x, y) => this._grabIngredient(tile, x, y, "hand"),
    });

    // Hover-and-wait over a heat-level step for 1 s sets that level —
    // same dwell mechanic as buttons and tile-pick. Pinch and mouse
    // drag still work (handled in onPointerDown).
    this.heatPicker = new HandHoverPicker({
      getHoveredTarget: (x, y) => {
        if (!this._inHeatRegion(x, y)) return null;
        return this._heatLevelFromX(x); // 0..5
      },
      onPick: (level) => this._applyHeatLevel(level),
    });
  }

  // ---------- lifecycle ----------

  onEnter() {
    this._clearTiles();
    this._buildIngredientGrid();
    this._loadStoveAndCookware();
    this._renderRecipeLog();
    this._updateHeatSliderVisual();
    this._updateScrollbar();
    this._unsub = cookingStore.subscribe(() => this._onStoreUpdate());
    this._attachWheelHandler();

    // Keyboard shortcuts for the heat slider — 1/2/3 jumps to that
    // level, ArrowLeft/ArrowRight steps. Skipped while typing in any
    // text field so the AddToCollection modal's name input still works.
    this._heatKeyHandler = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable)
        return;
      const current = cookingStore.getState().currentHeatLevel || 1;
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        e.preventDefault();
        this._applyHeatLevel(Number(e.key));
      } else if (e.key === "ArrowLeft" && current > 1) {
        e.preventDefault();
        this._applyHeatLevel(current - 1);
      } else if (e.key === "ArrowRight" && current < 3) {
        e.preventDefault();
        this._applyHeatLevel(current + 1);
      }
    };
    window.addEventListener("keydown", this._heatKeyHandler);
  }

  onExit() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    this._detachWheelHandler();
    if (this._heatLogTimer) {
      clearTimeout(this._heatLogTimer);
      this._heatLogTimer = null;
    }
    if (this._heatKeyHandler) {
      window.removeEventListener("keydown", this._heatKeyHandler);
      this._heatKeyHandler = null;
    }
  }

  setRecipeOpen(open) {
    if (!this.recipeLabel) return;
    this.recipeLabel.text = open ? "Hide Recipe" : "Traditional Recipe";
  }

  // ---------- panels ----------

  _buildPanels() {
    // Left panel
    this.leftPanelBg = new Graphics()
      .roundRect(LEFT_PANEL.x, LEFT_PANEL.y, LEFT_PANEL.w, LEFT_PANEL.h, 12)
      .fill({ color: COLORS.cardBg, alpha: 0.92 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    this.panelsLayer.addChild(this.leftPanelBg);

    const leftHeader = new Text({
      text: "Your Selection",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 24,
        fontWeight: "500",
        fill: COLORS.titleRed,
      }),
    });
    leftHeader.anchor.set(0.5, 0);
    leftHeader.position.set(
      LEFT_PANEL.x + LEFT_PANEL.w / 2,
      LEFT_PANEL.y + LEFT_PANEL.headerY
    );
    this.panelsLayer.addChild(leftHeader);

    // Right panel
    this.rightPanelBg = new Graphics()
      .roundRect(
        RIGHT_PANEL.x,
        RIGHT_PANEL.y,
        RIGHT_PANEL.w,
        RIGHT_PANEL.h,
        12
      )
      .fill({ color: COLORS.cardBg, alpha: 0.92 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    this.panelsLayer.addChild(this.rightPanelBg);

    const rightHeader = new Text({
      text: "Your Recipe",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontSize: 24,
        fontWeight: "500",
        fill: COLORS.titleRed,
      }),
    });
    rightHeader.anchor.set(0.5, 0);
    rightHeader.position.set(
      RIGHT_PANEL.x + RIGHT_PANEL.w / 2,
      RIGHT_PANEL.y + RIGHT_PANEL.headerY
    );
    this.panelsLayer.addChild(rightHeader);

    // Scrollbar (drawn on top of left panel; updated dynamically)
    this.scrollTrackGfx = new Graphics();
    this.scrollThumbGfx = new Graphics();
    this.panelsLayer.addChild(this.scrollTrackGfx, this.scrollThumbGfx);
  }

  // ---------- top bar ----------

  _buildTopBar() {
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
    const c = new Container();
    const g = new Graphics();
    g.roundRect(-18, -22, 17, 44, 3)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    g.roundRect(1, -22, 17, 44, 3)
      .fill(COLORS.bookCream)
      .stroke({ color: COLORS.brown, width: 2 });
    g.moveTo(0, -20).lineTo(0, 20).stroke({ color: COLORS.brown, width: 2 });
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

  // ---------- instruction ----------

  _buildInstruction() {
    this.instructionText = new Text({
      text: "Drag your selected ingredients\ninto the pot in order",
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "600",
        fontSize: 32,
        lineHeight: 44,
        fill: COLORS.ink,
        align: "center",
        wordWrap: true,
        wordWrapWidth: INSTRUCTION.wrapWidth,
      }),
    });
    this.instructionText.anchor.set(0.5, 0);
    this.instructionText.position.set(INSTRUCTION.cx, INSTRUCTION.y);
    this.uiLayer.addChild(this.instructionText);
  }

  // ---------- stove + pan ----------

  _buildStoveAndPan() {
    this.stoveSprite = new Sprite();
    this.stoveSprite.anchor.set(0, 0);
    this.stoveSprite.position.set(STOVE.x, STOVE.y);
    this.stoveSprite.width = STOVE.w;
    this.stoveSprite.height = STOVE.h;
    this.stoveSprite.visible = false;
    this.stoveLayer.addChild(this.stoveSprite);

    // Soft glow when an ingredient is being dragged over the pan. The
    // breathing pulse is driven via container alpha + scale in update().
    this.panGlow = new Graphics()
      .ellipse(0, 0, STOVE.w / 2 + 30, 130)
      .fill({ color: COLORS.yellowBtn, alpha: 0.6 });
    this.panGlow.filters = [new BlurFilter({ strength: 32 })];
    this.panGlow.position.set(
      STOVE.x + STOVE.w / 2,
      STOVE.y + STOVE.h * 0.45
    );
    this.panGlow.visible = false;
    this.stoveLayer.addChild(this.panGlow);

    this.cookwareSprite = new Sprite();
    this.cookwareSprite.anchor.set(0.5);
    this.cookwareSprite.visible = false;
    this.stoveLayer.addChild(this.cookwareSprite);

    // Items dropped into the pan accumulate inside this container,
    // scattered around the burner.
    this.panItemsLayer = new Container();
    this.panItemsLayer.position.set(
      STOVE.x + STOVE.w / 2,
      STOVE.y + STOVE.h * 0.45
    );
    this.stoveLayer.addChild(this.panItemsLayer);
  }

  async _loadStoveAndCookware() {
    try {
      const stoveTex = await Assets.load(stoveUrl);
      this.stoveSprite.texture = stoveTex;
      this.stoveSprite.visible = true;
    } catch (e) {
      console.warn("CookingScene: stove load failed", e);
    }

    let id = cookingStore.getState().selectedCookware;
    if (!id) {
      console.warn(
        "CookingScene: no cookware selected, falling back to wok"
      );
      id = "wok";
    }
    const cw = findCookware(id);
    if (!cw) return;

    try {
      const tex = await Assets.load(cw.imagePath);
      this.cookwareSprite.texture = tex;

      const os = cw.onStove;
      const wFactor = STOVE.w / STOVE_REF.width;
      const hFactor = STOVE.h / STOVE_REF.height;

      this.cookwareSprite.width = os.width * wFactor;
      this.cookwareSprite.height = os.height * wFactor;
      this.cookwareSprite.rotation = ((os.rotation || 0) * Math.PI) / 180;

      // Burner sits ~45% from stove top; per-cookware (cx, cy) shifts the
      // bbox so the body lands on the burner with the handle hanging below.
      const burnerInsetY = (STOVE_REF.burnerY - STOVE_REF.top) * hFactor;
      const burnerCx = STOVE.x + STOVE.w / 2;
      const burnerCy = STOVE.y + burnerInsetY;
      this.cookwareSprite.position.set(
        burnerCx + (os.cx ?? 0) * wFactor,
        burnerCy + (os.cy ?? 0) * hFactor
      );
      this.cookwareSprite.visible = true;
    } catch (e) {
      console.warn(`CookingScene: cookware ${id} load failed`, e);
    }
  }

  // ---------- heat slider ----------

  _buildHeatSlider() {
    this.heatSlider = new Container();

    // Track + fill — shared Graphics, repainted via _drawHeatTrack(fraction).
    this.heatTrackBg = new Graphics();
    this._drawHeatTrack(0); // empty fill initially
    this.heatSlider.addChild(this.heatTrackBg);

    // Three flame-icon groups above the track (1 / 2 / 3 flames).
    // Sprites are populated once /Fire-small.png loads — until then
    // the groups are present but empty so the layout doesn't shift.
    const xs = this._heatStepXs();
    this.flameGroups = [];
    for (let level = 1; level <= 3; level++) {
      const group = new Container();
      group.label = `FlameGroup-${level}`;
      group.position.set(xs[level - 1], HEAT_SLIDER.flameY);
      this.heatSlider.addChild(group);
      this.flameGroups.push(group);
    }
    this._loadFlameSprites();

    // Knob — same dark grey circle + indicator as before.
    this.heatKnob = new Container();
    this.heatKnobCircle = new Graphics()
      .circle(0, 0, HEAT_SLIDER.knobR)
      .fill(COLORS.knobFill);
    const knobIndicator = new Graphics()
      .rect(-3, -14, 6, 28)
      .fill(COLORS.knobIndicator);
    this.heatKnob.addChild(this.heatKnobCircle, knobIndicator);
    this.heatKnob.position.set(xs[0], HEAT_SLIDER.cy);
    this.heatSlider.addChild(this.heatKnob);

    this.uiLayer.addChild(this.heatSlider);
  }

  // Async — sprites materialize once the texture lands. Gates each
  // group's flame count + size by HEAT_SLIDER.iconCount/iconSize.
  async _loadFlameSprites() {
    let tex;
    try {
      tex = await Assets.load(FIRE_ICON_URL);
    } catch (e) {
      console.warn("CookingScene: failed to load Fire-small.png", e);
      return;
    }
    if (!this.flameGroups) return; // scene torn down before load completed
    for (let level = 1; level <= 3; level++) {
      const group = this.flameGroups[level - 1];
      const count = HEAT_SLIDER.iconCount[level];
      const size = HEAT_SLIDER.iconSize[level];
      const totalW = count * size + (count - 1) * HEAT_SLIDER.iconGap;
      const startX = -totalW / 2 + size / 2;
      for (let i = 0; i < count; i++) {
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.width = size;
        sp.height = size;
        sp.position.set(startX + i * (size + HEAT_SLIDER.iconGap), 0);
        group.addChild(sp);
      }
    }
  }

  // X-coords for the three snap targets (levels 1, 2, 3). Indexed
  // 0..2; callers map level → level - 1.
  _heatStepXs() {
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    return HEAT_SLIDER.positions.map((f) => x0 + f * HEAT_SLIDER.trackW);
  }

  // Track painter — accepts a 0..1 fraction so drag handlers and
  // animation tweens can paint intermediate fills without going
  // through the level → fraction lookup.
  _drawHeatTrack(fraction) {
    const f = Math.max(0, Math.min(1, fraction ?? 0));
    const g = this.heatTrackBg;
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    const y = HEAT_SLIDER.cy - HEAT_SLIDER.trackH / 2;
    g.clear()
      .roundRect(x0, y, HEAT_SLIDER.trackW, HEAT_SLIDER.trackH, 20)
      .fill({ color: COLORS.trackFill, alpha: 0.52 })
      .stroke({ color: COLORS.trackStroke, width: 1, alpha: 0.52 });
    if (f > 0) {
      g.roundRect(x0, y, HEAT_SLIDER.trackW * f, HEAT_SLIDER.trackH, 20).fill(
        COLORS.flameOrange
      );
    }
    this._currentFillFraction = f;
  }

  // Settled-state painter (knob at snap, fill at level fraction). Used
  // by store-subscribers + initial scene mount. Skipped while a slider
  // drag is in flight — the drag handler owns visuals during that time.
  _updateHeatSliderVisual() {
    if (this._sliderDragging) return;
    const level = cookingStore.getState().currentHeatLevel ?? 0;
    if (
      this._lastVisualHeatLevel != null &&
      level !== this._lastVisualHeatLevel
    ) {
      fireAdjust(level / 3);
    }
    this._lastVisualHeatLevel = level;
    this._animateHeatVisualsToLevel(level);
  }

  // Tween knob position + fill width to the level's snap state. Cancels
  // any prior in-flight tween so the latest target wins. ease-out cubic
  // matches the spec's "150ms ease-out" feel without an extra dep.
  _animateHeatVisualsToLevel(level) {
    const xs = this._heatStepXs();
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    const targetX = level >= 1 ? xs[level - 1] : x0;
    const targetFraction = HEAT_SLIDER.fillFraction[level] ?? 0;
    const startX = this.heatKnob.position.x;
    const startFraction = this._currentFillFraction ?? 0;
    const duration = 180;
    const tweenId = ++this._heatTweenId;
    const start = performance.now();
    const step = () => {
      if (this._heatTweenId !== tweenId) return; // newer tween took over
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      this.heatKnob.position.x = startX + (targetX - startX) * e;
      this._drawHeatTrack(startFraction + (targetFraction - startFraction) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Live-paint the knob + track at an arbitrary cursor x. Skips the
  // settled visual so the knob can move smoothly between snap targets
  // during the drag. Crackles once per snap-boundary crossing — the
  // drag reads "Set heat to N" sounds without committing N to the store.
  _renderSliderDragAt(x) {
    if (x == null) return;
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    const x1 = HEAT_SLIDER.cx + HEAT_SLIDER.trackW / 2;
    const clampedX = Math.max(x0, Math.min(x1, x));
    this.heatKnob.position.x = clampedX;
    const fraction = (clampedX - x0) / HEAT_SLIDER.trackW;
    this._drawHeatTrack(fraction);
    const level = this._heatLevelFromX(clampedX);
    if (level !== this._sliderDragLevel) {
      this._sliderDragLevel = level;
      fireAdjust(level / 3);
    }
  }

  // Returns the closest of the three discrete snap levels (1, 2, 3)
  // to the given x. Used both during drag (to fire crackle on
  // boundary crossings) and on release (to commit the snap).
  _heatLevelFromX(x) {
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    const x1 = HEAT_SLIDER.cx + HEAT_SLIDER.trackW / 2;
    const clamped = Math.max(x0, Math.min(x1, x));
    const t = (clamped - x0) / (x1 - x0);
    let bestLevel = 1;
    let bestDist = Infinity;
    for (let i = 0; i < HEAT_SLIDER.positions.length; i++) {
      const d = Math.abs(t - HEAT_SLIDER.positions[i]);
      if (d < bestDist) {
        bestDist = d;
        bestLevel = i + 1;
      }
    }
    return bestLevel;
  }

  // ---------- recipe-log right panel ----------

  _buildRecipeLogContainer() {
    // Mask + scroll container for entries
    this._recipeMask = new Graphics()
      .rect(
        RIGHT_PANEL.x + RIGHT_PANEL.pad,
        RIGHT_PANEL.y + RIGHT_PANEL.headerY + 40,
        RIGHT_PANEL.w - RIGHT_PANEL.pad * 2,
        RIGHT_PANEL.h - RIGHT_PANEL.headerY - 60
      )
      .fill(0xffffff);
    this.recipeScrollContainer.addChild(this._recipeMask);
    this.recipeScrollContainer.mask = this._recipeMask;

    this._recipeViewportH = RIGHT_PANEL.h - RIGHT_PANEL.headerY - 60;

    // Inner content container that we translate to scroll
    this.recipeContent = new Container();
    this.recipeContent.position.set(
      RIGHT_PANEL.x + RIGHT_PANEL.pad,
      RIGHT_PANEL.y + RIGHT_PANEL.headerY + 40
    );
    this.recipeScrollContainer.addChild(this.recipeContent);
  }

  _renderRecipeLog() {
    // Clear existing entries
    for (const t of this.recipeEntryTexts) {
      t.parent?.removeChild(t);
      t.destroy();
    }
    this.recipeEntryTexts = [];

    const log = cookingStore.getState().recipeLog ?? [];
    let y = 0;
    const lineGap = 8;
    const wrapWidth = RIGHT_PANEL.w - RIGHT_PANEL.pad * 2;
    for (const entry of log) {
      const t = new Text({
        text: recipeEntryText(entry),
        style: new TextStyle({
          fontFamily: FONT.mono,
          fontSize: 16,
          fontWeight: "400",
          fill: COLORS.labelBrown,
          wordWrap: true,
          wordWrapWidth: wrapWidth,
        }),
      });
      t.position.set(0, y);
      this.recipeContent.addChild(t);
      this.recipeEntryTexts.push(t);
      y += t.height + lineGap;
    }

    // Auto-scroll: pin to bottom if content overflows
    const totalH = y;
    if (totalH > this._recipeViewportH) {
      this.recipeContent.y =
        RIGHT_PANEL.y +
        RIGHT_PANEL.headerY +
        40 -
        (totalH - this._recipeViewportH);
    } else {
      this.recipeContent.y = RIGHT_PANEL.y + RIGHT_PANEL.headerY + 40;
    }
  }

  // ---------- left-panel ingredient grid ----------

  _clearTiles() {
    for (const tile of this.tiles.values()) {
      tile.container.parent?.removeChild(tile.container);
      tile.container.destroy({ children: true });
    }
    this.tiles.clear();
  }

  _buildIngredientGrid() {
    // Mask the panel content area so tiles can scroll without spilling out.
    if (this._tilesMask) {
      this._tilesMask.parent?.removeChild(this._tilesMask);
      this._tilesMask.destroy();
    }
    const innerX = LEFT_PANEL.x + LEFT_PANEL.pad;
    const innerY = LEFT_PANEL.y + LEFT_PANEL.headerY + 36; // below header
    const innerW = LEFT_PANEL.w - LEFT_PANEL.pad * 2 - SCROLLBAR.width - 12;
    const innerH = LEFT_PANEL.h - LEFT_PANEL.headerY - 56;
    this._tilesMask = new Graphics()
      .rect(innerX, innerY, innerW, innerH)
      .fill(0xffffff);
    this.tilesScrollContainer.addChild(this._tilesMask);
    this.tilesScrollContainer.mask = this._tilesMask;

    this._tileViewportH = innerH;
    this._tileScrollOffset = 0;

    // Tile content lives in an inner Container that we translate to scroll.
    if (this.tilesContent) {
      this.tilesContent.parent?.removeChild(this.tilesContent);
      this.tilesContent.destroy({ children: true });
    }
    this.tilesContent = new Container();
    this.tilesScrollContainer.addChild(this.tilesContent);

    // Lay out the 3-col grid
    const items = cookingStore.getState().selectedIngredients ?? [];
    const cellW = TILE.size + TILE.gap;
    items.forEach((ing, i) => {
      const col = i % TILE_COLS;
      const row = Math.floor(i / TILE_COLS);
      const x = innerX + col * cellW;
      const y = innerY + row * TILE_ROW_PITCH;
      const tile = this._buildTile(ing, x, y);
      this.tiles.set(ing.id + "@" + i, tile); // unique key per slot (in case ids repeat)
    });

    // Compute scroll bounds
    const rows = Math.ceil(items.length / TILE_COLS);
    const totalH = rows > 0 ? rows * TILE_ROW_PITCH : 0;
    this._tileScrollMax = Math.max(0, totalH - innerH);
  }

  _buildTile(ingredient, x, y) {
    const c = new Container();
    c.label = `Tile:${ingredient.id}`;
    c.position.set(x, y);

    const bg = new Graphics()
      .roundRect(0, 0, TILE.size, TILE.size, TILE.radius)
      .fill({ color: COLORS.cardBg, alpha: 0.9 })
      .stroke({ color: COLORS.cardBorder, width: 1 });
    c.addChild(bg);

    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.position.set(TILE.size / 2, TILE.size / 2);
    sprite.visible = false;
    c.addChild(sprite);

    const labelStyle = tileLabelStyle(ingredient.name);
    const label = new Text({
      text: ingredient.name,
      style: new TextStyle({
        fontFamily: FONT.mono,
        fontWeight: "500",
        fontSize: labelStyle.fontSize,
        lineHeight: labelStyle.lineHeight,
        fill: COLORS.labelBrown,
        align: "center",
        wordWrap: true,
        wordWrapWidth: TILE.size,
      }),
    });
    label.anchor.set(0.5, 0);
    label.position.set(TILE.size / 2, TILE.size + TILE_LABEL_GAP);
    c.addChild(label);

    this.tilesContent.addChild(c);

    const tile = {
      id: ingredient.id,
      name: ingredient.name,
      ingredient,
      container: c,
      sprite,
      origin: { x, y },
      size: TILE.size,
      hasAsset: !!ingredient.imagePath,
    };

    if (ingredient.imagePath) {
      Assets.load(ingredient.imagePath)
        .then((tex) => {
          sprite.texture = tex;
          // Fit sprite within spriteMax box, aspect-preserved.
          const tw = tex.width || 1;
          const th = tex.height || 1;
          const ratio = tw / th;
          const max = TILE.spriteMax;
          if (ratio >= 1) {
            sprite.width = max;
            sprite.height = max / ratio;
          } else {
            sprite.height = max;
            sprite.width = max * ratio;
          }
          sprite.visible = true;
        })
        .catch((e) =>
          console.warn(`CookingScene: failed to load ${ingredient.id}`, e)
        );
    }

    return tile;
  }

  // ---------- scrollbar ----------

  _updateScrollbar() {
    // Track sits inside the panel right edge. Always visible, even when
    // there's nothing to scroll (per the Figma design — it's an indicator).
    const trackX =
      LEFT_PANEL.x + LEFT_PANEL.w - SCROLLBAR.width - SCROLLBAR.trackInset;
    const trackY = LEFT_PANEL.y + LEFT_PANEL.headerY + 36;
    const trackH = LEFT_PANEL.h - LEFT_PANEL.headerY - 56;

    this.scrollTrackGfx
      .clear()
      .roundRect(trackX, trackY, SCROLLBAR.width, trackH, SCROLLBAR.radius)
      .fill(COLORS.scrollTrack);

    let thumbH = trackH;
    let thumbY = trackY;
    if (this._tileScrollMax > 0) {
      const contentH = trackH + this._tileScrollMax;
      thumbH = Math.max(40, (trackH * trackH) / contentH);
      thumbY =
        trackY +
        (this._tileScrollOffset / this._tileScrollMax) * (trackH - thumbH);
    } else {
      // No scroll needed → small static thumb at top (matches Figma look)
      thumbH = 99;
    }
    this.scrollThumbGfx
      .clear()
      .roundRect(trackX, thumbY, SCROLLBAR.width, thumbH, SCROLLBAR.radius)
      .fill(COLORS.scrollThumb);
  }

  // ---------- done button ----------

  _buildDoneButton() {
    this.doneBtn = new Container();
    this.doneBtn.label = "DoneBtn";
    this.doneBtn.position.set(DONE_BTN.cx, DONE_BTN.cy);
    this.doneBtnBg = new Graphics();
    this.doneBtnLabel = new Text({
      text: "Done!",
      style: new TextStyle({
        fontFamily: FONT.lato,
        fontWeight: "700",
        fontSize: 32,
        fill: COLORS.doneText,
      }),
    });
    this.doneBtnLabel.anchor.set(0.5, 0.5);
    this.doneBtn.addChild(this.doneBtnBg, this.doneBtnLabel);
    this._drawDoneBtn();
    this.uiLayer.addChild(this.doneBtn);
  }

  _drawDoneBtn() {
    const { w, h, r } = DONE_BTN;
    this.doneBtnBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill(this._doneHovered ? COLORS.yellowBtnHover : COLORS.yellowBtn);
  }

  // ---------- store / wheel handlers ----------

  _onStoreUpdate() {
    this._renderRecipeLog();
    this._updateHeatSliderVisual();
  }

  _attachWheelHandler() {
    if (this._wheelHandler) return;
    this._wheelHandler = (e) => {
      const p = this._toDesign(e.clientX, e.clientY);
      if (p.x == null) return;
      if (!this._inLeftPanel(p.x, p.y)) return;
      if (this._tileScrollMax <= 0) return;
      e.preventDefault();
      const next = Math.max(
        0,
        Math.min(this._tileScrollMax, this._tileScrollOffset + e.deltaY)
      );
      if (next !== this._tileScrollOffset) {
        this._tileScrollOffset = next;
        this.tilesContent.y = -next;
        this._updateScrollbar();
      }
    };
    window.addEventListener("wheel", this._wheelHandler, { passive: false });
  }

  _detachWheelHandler() {
    if (this._wheelHandler) {
      window.removeEventListener("wheel", this._wheelHandler);
      this._wheelHandler = null;
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
      // Hand-grab + brief hand loss. Same flicker concern as the other
      // scenes — give a grace window before snap-back so MediaPipe's
      // dropped frames don't kill the grab.
      if (
        this.grabbed.type === "ingredient" &&
        this.grabbed.source === "hand" &&
        source !== "hand"
      ) {
        const now = performance.now();
        this._handGoneSince = this._handGoneSince ?? now;
        if (now - this._handGoneSince > 600) {
          this._snapGhostBack(this.grabbed.tile, this.grabbed.ghost);
          this.grabbed = null;
          this._handGoneSince = null;
          this._panActive = false;
          this.panGlow.visible = false;
        }
        return;
      }
      this._handGoneSince = null;
      if (p.x == null) return;
      if (this.grabbed.type === "ingredient") {
        this.grabbed.ghost.position.set(p.x, p.y);
        const over = this._overPan(p.x, p.y);
        if (over !== this._panActive) {
          this._panActive = over;
          this.panGlow.visible = over;
        }
        // Hand-grab gets a "preview window" so the player can hover
        // over the pan without committing. Continuous-hover-on-pan for
        // PAN_COMMIT_MS = drop into pot (logged as recipe). Continuous-
        // hover-outside-pan for PAN_CANCEL_MS = snap back to source
        // (no log entry). Either timer resets when the cursor crosses
        // the boundary, so passing-through doesn't trigger anything.
        if (this.grabbed.source === "hand") {
          const now = performance.now();
          const PAN_COMMIT_MS = 500;
          const PAN_CANCEL_MS = 800;
          if (over) {
            this._panOffSince = null;
            if (this._panOverSince == null) this._panOverSince = now;
            if (now - this._panOverSince >= PAN_COMMIT_MS) {
              const { tile, ghost } = this.grabbed;
              this.grabbed = null;
              this._panOverSince = null;
              this._panOffSince = null;
              this._panActive = false;
              this.panGlow.visible = false;
              this._attemptDropIntoPan(tile, ghost);
            }
          } else {
            this._panOverSince = null;
            if (this._panOffSince == null) this._panOffSince = now;
            if (now - this._panOffSince >= PAN_CANCEL_MS) {
              const { tile, ghost } = this.grabbed;
              this.grabbed = null;
              this._panOverSince = null;
              this._panOffSince = null;
              this._snapGhostBack(tile, ghost);
            }
          }
        }
      } else if (this.grabbed.type === "slider") {
        // Knob follows the cursor freely during the drag — no snapping
        // until the player releases. Store updates only on release so
        // subscribers don't see intermediate raw values.
        this._renderSliderDragAt(p.x);
      }
      return;
    }

    this.buttons.pointerMove({ x: p.x, y: p.y, source });
    this.tilePicker.pointerMove({ x: p.x, y: p.y, source });
    this.heatPicker.pointerMove({ x: p.x, y: p.y, source });

    if (p.x == null) {
      this._setDoneHovered(false);
      this._setRecipeHovered(false);
      return;
    }
    this._setDoneHovered(this._inDoneBtn(p.x, p.y));
    this._setRecipeHovered(this._inRecipeBtn(p.x, p.y));

    // Tile hover blip on the edge.
    const tile = this._tileAt(p.x, p.y);
    const hoveredId =
      tile && tile.hasAsset && tile.sprite.texture ? tile.id : null;
    if (hoveredId !== this._lastHoveredTileId) {
      this._lastHoveredTileId = hoveredId;
      if (hoveredId) hoverTick();
    }
  }

  onPointerDown(state) {
    const { x, y, source, gestureType } = state;
    const p = this._toDesign(x, y);
    if (p.x == null) return;

    if (this.buttons.pointerDown({ x: p.x, y: p.y, source })) return;

    // Heat slider intent: pinch (or mouse). _inHeatRegion is a
    // generous box covering both the track and the flame-icon row
    // above it, so clicking directly on a flame label starts the
    // slider too — release will snap to that flame's level.
    const sliderGesture = gestureType === "mouse" || gestureType === "pinch";
    if (
      sliderGesture &&
      (this._inHeatKnob(p.x, p.y) || this._inHeatRegion(p.x, p.y))
    ) {
      this.grabbed = { type: "slider" };
      this._sliderDragging = true;
      this._sliderDragLevel = null;
      this._renderSliderDragAt(p.x);
      return;
    }

    // Mouse picks ingredients via click-and-drag. Hand picks via the
    // 3s hover dwell on a tile (HandHoverPicker), so hand presses here
    // don't initiate ingredient grabs.
    if (source !== "mouse") return;
    const tile = this._tileAt(p.x, p.y);
    if (tile && tile.hasAsset && tile.sprite.texture) {
      this._grabIngredient(tile, p.x, p.y, "mouse");
    }
  }

  onPointerUp({ x, y, cancelled }) {
    if (!this.grabbed) return;
    const g = this.grabbed;
    this.grabbed = null;

    const p = this._toDesign(x, y);

    if (g.type === "ingredient") {
      const { tile, ghost } = g;
      this._panActive = false;
      this.panGlow.visible = false;
      if (cancelled || p.x == null || !this._overPan(p.x, p.y)) {
        this._snapGhostBack(tile, ghost);
      } else {
        this._attemptDropIntoPan(tile, ghost);
      }
      return;
    }

    if (g.type === "slider") {
      // End of the freeform drag: snap to the closest of 1/2/3 and
      // tween there. Log only on commit (debounced) so a swift pass-
      // through doesn't generate a wall of recipe entries.
      this._sliderDragging = false;
      const fallbackLevel = cookingStore.getState().currentHeatLevel || 1;
      const level = p.x != null ? this._heatLevelFromX(p.x) : fallbackLevel;
      cookingStore.setHeatLevel(level);
      this._animateHeatVisualsToLevel(level);
      const log = cookingStore.getState().recipeLog;
      const lastHeat = [...log].reverse().find((e) => e.type === "heat");
      if (!lastHeat || lastHeat.value !== level) {
        cookingStore.logHeatChange(level);
      }
      return;
    }
  }

  getPointerDwell() {
    return Math.max(
      this.buttons?.getDwellProgress() ?? 0,
      this.tilePicker?.getDwellProgress() ?? 0,
      this.heatPicker?.getDwellProgress() ?? 0
    );
  }
  getState() {
    return {
      grabbedId: this.grabbed?.tile?.id ?? null,
      basketCount: cookingStore.getState().potOrder.length,
    };
  }
  update(now) {
    if (this.panGlow.visible) {
      const t = (now ?? performance.now()) / 1000;
      const wave = (Math.sin(t * 4) + 1) / 2;
      this.panGlow.alpha = 0.7 + wave * 0.3;
      const s = 1.0 + 0.05 * wave;
      this.panGlow.scale.set(s);
    }
  }

  // ---------- drag helpers ----------

  _grabIngredient(tile, designX, designY, source = "mouse") {
    itemPickup();
    // Reset the preview-window accumulators so each new grab gets a
    // clean dwell timer regardless of where the cursor was before.
    this._panOverSince = null;
    this._panOffSince = null;
    const ghost = new Container();
    const tex = tile.sprite.texture;
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = tile.sprite.width;
    sp.height = tile.sprite.height;
    const shadow = new Graphics()
      .ellipse(0, 16, 38, 8)
      .fill({ color: 0x000000, alpha: 0.25 });
    shadow.filters = [new BlurFilter({ strength: 6 })];
    ghost.addChild(shadow, sp);
    ghost.scale.set(1.1);
    ghost.position.set(designX, designY);
    this.dragLayer.addChild(ghost);
    this.grabbed = { type: "ingredient", tile, ghost, source };
  }

  // ---------- validation: tofu present + fire on ----------

  // Gate the drop on the fire being on. If the heat slider is at 0,
  // snap the ingredient back to its panel slot and pop the
  // "Remember to turn on the fire!" toast. The recipe is NOT logged
  // (we never call _dropIntoPan, which is what calls addToPot), so
  // the smart recipe card stays clean.
  _attemptDropIntoPan(tile, ghost) {
    const heat = cookingStore.getState().currentHeatLevel ?? 0;
    if (heat <= 0) {
      showFireOffToast();
      this._snapGhostBack(tile, ghost);
      return;
    }
    this._dropIntoPan(tile, ghost);
  }

  _potHasTofu() {
    const potOrder = cookingStore.getState().potOrder ?? [];
    for (const item of potOrder) {
      const data = INGREDIENT_DATA.find((d) => d.id === item.id);
      if (data?.category === "tofu") return true;
    }
    return false;
  }

  _showMissingTofuModal() {
    if (this._missingTofuModal) return;
    this._missingTofuModal = mountMissingTofuModal({
      onGoBack: () => {
        this._missingTofuModal = null;
        this._resetCookingProgress();
      },
    });
  }

  // Wipes everything the player did in this cooking session — pot
  // contents, recipe log, heat level, dish-image fields — without
  // touching their ingredient/cookware selection upstream. Called
  // when the player presses "Go Back" on the missing-tofu modal.
  _resetCookingProgress() {
    // Drop any visible items in the pan (mirrors the per-frame loop
    // we use elsewhere — destroy children so they free their texture
    // refs cleanly).
    while (this.panItemsLayer.children.length) {
      const child = this.panItemsLayer.children[0];
      this.panItemsLayer.removeChild(child);
      child.destroy({ children: true });
    }
    // If the player was mid-grab when they pressed Cooked!, drop the
    // ghost so we don't strand it.
    if (this.grabbed?.ghost) {
      this.grabbed.ghost.parent?.removeChild(this.grabbed.ghost);
      this.grabbed.ghost.destroy({ children: true });
    }
    this.grabbed = null;
    this._panActive = false;
    this.panGlow.visible = false;
    this._panOverSince = null;
    this._panOffSince = null;

    // Clear the relevant store fields. The recipe-card panel + heat
    // slider are subscription-driven, so calling notify via the store
    // method automatically refreshes their visuals.
    cookingStore.clearCookingProgress();
    this._updateHeatSliderVisual();
  }

  _snapGhostBack(tile, ghost) {
    itemRejected();
    // Tile origin is in tilesContent coords; visual position factors scroll.
    const from = { x: ghost.x, y: ghost.y };
    const to = {
      x: tile.origin.x + tile.size / 2,
      y: tile.origin.y + tile.size / 2 - this._tileScrollOffset,
    };
    const start = performance.now();
    const dur = 200;
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
      }
    };
    requestAnimationFrame(step);
  }

  _dropIntoPan(tile, ghost) {
    itemDropPot();
    cookingStore.addToPot({ id: tile.id, name: tile.name });

    // Phyllotaxis ("sunflower") placement: each new drop lands at a
    // golden-angle step from the previous so items fan out evenly
    // around the burner instead of stacking. SPACING ≥ item edge so
    // adjacent slots don't visibly overlap; jitter is small (±2 px)
    // so the layout stays readable without looking computer-perfect.
    const i = this.panItemsLayer.children.length;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°
    const SPACING = 50;
    const radius = i === 0 ? 0 : Math.sqrt(i) * SPACING;
    const angle = i * GOLDEN_ANGLE;
    const jitterX = (Math.random() - 0.5) * 4;
    const jitterY = (Math.random() - 0.5) * 3;
    const offX = Math.cos(angle) * radius + jitterX;
    // Vertical squash gives the burner a hint of perspective (the
    // pan reads as an oval, not a flat disc).
    const offY = Math.sin(angle) * radius * 0.7 + jitterY;

    // Aspect-preserved sprite up to ~80px on its long edge — large
    // enough to read clearly against the cookware art instead of
    // disappearing as a tiny dot.
    const MAX_EDGE = 80;
    const tex = tile.sprite.texture;
    const inPan = new Sprite(tex);
    inPan.anchor.set(0.5);
    const tw = tex?.width || 1;
    const th = tex?.height || 1;
    const ratio = tw / th;
    if (ratio >= 1) {
      inPan.width = MAX_EDGE;
      inPan.height = MAX_EDGE / ratio;
    } else {
      inPan.height = MAX_EDGE;
      inPan.width = MAX_EDGE * ratio;
    }
    inPan.position.set(offX, offY);
    inPan.alpha = 0;
    this.panItemsLayer.addChild(inPan);

    const target = {
      x: this.panItemsLayer.x + offX,
      y: this.panItemsLayer.y + offY,
    };
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
      inPan.alpha = Math.min(1, t * 1.4);
      if (t < 1) requestAnimationFrame(step);
      else {
        ghost.parent?.removeChild(ghost);
        ghost.destroy({ children: true });
        inPan.alpha = 1;
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

  _tileAt(x, y) {
    for (const tile of this.tiles.values()) {
      // Tile visual y = origin.y - scrollOffset (tilesContent has y=-offset)
      const visualY = tile.origin.y - this._tileScrollOffset;
      if (
        x >= tile.origin.x &&
        x <= tile.origin.x + tile.size &&
        y >= visualY &&
        y <= visualY + tile.size
      ) {
        return tile;
      }
    }
    return null;
  }

  _overPan(x, y) {
    return pointInRect(x, y, {
      x: STOVE.x,
      y: STOVE.y,
      width: STOVE.w,
      height: STOVE.h + 100, // include handle area below stove
    });
  }

  _inLeftPanel(x, y) {
    return pointInRect(x, y, {
      x: LEFT_PANEL.x,
      y: LEFT_PANEL.y,
      width: LEFT_PANEL.w,
      height: LEFT_PANEL.h,
    });
  }

  _inHeatKnob(x, y) {
    const dx = x - this.heatKnob.position.x;
    const dy = y - this.heatKnob.position.y;
    return Math.hypot(dx, dy) <= HEAT_SLIDER.knobR + 6;
  }

  _inHeatTrack(x, y) {
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    const x1 = HEAT_SLIDER.cx + HEAT_SLIDER.trackW / 2;
    return (
      x >= x0 - 10 &&
      x <= x1 + 10 &&
      Math.abs(y - HEAT_SLIDER.cy) <= HEAT_SLIDER.knobR + 4
    );
  }

  // Generous "near the slider" zone for the dwell picker — covers the
  // flame icons above the track and a margin below, so users can
  // hover the flame for a level without having to land on the thin
  // track itself.
  _inHeatRegion(x, y) {
    const x0 = HEAT_SLIDER.cx - HEAT_SLIDER.trackW / 2;
    const x1 = HEAT_SLIDER.cx + HEAT_SLIDER.trackW / 2;
    return (
      x >= x0 - 20 &&
      x <= x1 + 20 &&
      y >= HEAT_SLIDER.flameY - 30 &&
      y <= HEAT_SLIDER.cy + HEAT_SLIDER.knobR + 12
    );
  }

  // Single source of truth for "set heat to N + log it if it changed."
  // Used by the dwell picker; pinch/mouse drag still go through the
  // existing onPointerMove + onPointerUp flow.
  _applyHeatLevel(level) {
    cookingStore.setHeatLevel(level);
    this._updateHeatSliderVisual();
    const log = cookingStore.getState().recipeLog;
    const lastHeat = [...log].reverse().find((e) => e.type === "heat");
    if (!lastHeat || lastHeat.value !== level) {
      cookingStore.logHeatChange(level);
    }
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

  _inDoneBtn(x, y) {
    return pointInRect(x, y, {
      x: this.doneBtn.x - DONE_BTN.w / 2,
      y: this.doneBtn.y - DONE_BTN.h / 2,
      width: DONE_BTN.w,
      height: DONE_BTN.h,
    });
  }

  _setDoneHovered(v) {
    if (v === this._doneHovered) return;
    this._doneHovered = v;
    this._drawDoneBtn();
  }
  _setRecipeHovered(v) {
    if (v === this._recipeHovered) return;
    this._recipeHovered = v;
    this._drawRecipeBtn();
  }
}

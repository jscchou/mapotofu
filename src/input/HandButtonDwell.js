// Hover-to-press button manager for hand input.
//
// Mirrors StartScene's dwell behavior: when the hand cursor sits over a
// registered button for `dwellMs`, the button's onPress fires. Mouse
// users get instant clicks via `pointerDown`. Buttons re-arm only after
// the cursor leaves (so a held hover doesn't fire repeatedly).
//
// Usage:
//   this.buttons = new HandButtonDwell();
//   this.buttons.register("back", (x, y) => this._inBackBtn(x, y), () => this.onBack());
//   ...
//   onPointerMove(s) { this.buttons.pointerMove(s); /* set hover visuals */ }
//   onPointerDown(s) { if (this.buttons.pointerDown(s)) return; /* drag etc. */ }
//   getPointerDwell() { return this.buttons.getDwellProgress(); }

const DEFAULT_DWELL_MS = 1000;

export class HandButtonDwell {
  constructor(dwellMs = DEFAULT_DWELL_MS) {
    this.dwellMs = dwellMs;
    this._buttons = new Map();
  }

  // opts.handOnly: when true, mouse-down on this button is ignored (the
  // scene's own onPointerDown logic handles mouse cases). Useful for
  // surfaces that double as draggables (e.g. carousel cards).
  register(id, hitTest, onPress, opts = {}) {
    this._buttons.set(id, {
      hitTest,
      onPress,
      dwellStart: null,
      handOnly: !!opts.handOnly,
    });
  }

  unregister(id) {
    this._buttons.delete(id);
  }

  setEnabled(id, enabled) {
    const btn = this._buttons.get(id);
    if (!btn) return;
    btn.disabled = !enabled;
    if (!enabled) btn.dwellStart = null;
  }

  // Per-frame: scenes call this from onPointerMove. Triggers onPress
  // when the dwell timer completes for hand input. Mouse drives clicks
  // via pointerDown, not here.
  pointerMove({ x, y, source } = {}) {
    if (x == null || source !== "hand") {
      this._resetAll();
      return;
    }
    const now = performance.now();
    for (const btn of this._buttons.values()) {
      if (btn.disabled) {
        btn.dwellStart = null;
        continue;
      }
      if (btn.hitTest(x, y)) {
        if (btn.dwellStart == null) btn.dwellStart = now;
        else if (now - btn.dwellStart >= this.dwellMs) {
          btn.dwellStart = null;
          btn.onPress();
        }
      } else {
        btn.dwellStart = null;
      }
    }
  }

  // Mouse-only click. Returns true if a button consumed the press, so
  // scenes can early-return before checking drag/slider intents.
  pointerDown({ x, y, source } = {}) {
    if (source !== "mouse" || x == null) return false;
    for (const btn of this._buttons.values()) {
      if (btn.disabled || btn.handOnly) continue;
      if (btn.hitTest(x, y)) {
        btn.onPress();
        return true;
      }
    }
    return false;
  }

  // 0..1 progress of the most-advanced active dwell. Used to drive the
  // cursor's dwell ring animation.
  getDwellProgress() {
    let max = 0;
    const now = performance.now();
    for (const btn of this._buttons.values()) {
      if (btn.dwellStart == null) continue;
      const p = Math.min(1, (now - btn.dwellStart) / this.dwellMs);
      if (p > max) max = p;
    }
    return max;
  }

  // Reset all dwell timers — call when the hand leaves the canvas or the
  // scene transitions, so a partial dwell doesn't carry over.
  cancel() {
    this._resetAll();
  }

  _resetAll() {
    for (const btn of this._buttons.values()) btn.dwellStart = null;
  }
}

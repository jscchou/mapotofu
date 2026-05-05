// Hover-to-pick for hand input.
//
// Mirror of HandButtonDwell, but tailored for "grab a draggable target"
// flows. Pass in a hit-tester that maps a (design x, y) to whatever
// the scene wants to grab (a tile, a cookware card, etc.) — when the
// cursor sits on the same target for `dwellMs`, onPick fires with that
// target plus the cursor position.
//
// Picking re-arms only after the hovered target changes (or goes
// away). A grabbed state is the scene's responsibility — the picker
// just signals the pick edge.

const DEFAULT_DWELL_MS = 1000;

export class HandHoverPicker {
  constructor({
    dwellMs = DEFAULT_DWELL_MS,
    getHoveredTarget,
    onPick,
  } = {}) {
    this.dwellMs = dwellMs;
    this.getHoveredTarget = getHoveredTarget ?? (() => null);
    this.onPick = onPick ?? (() => {});

    this._currentTarget = null;
    this._dwellStart = null;
    // Most-recently-fired target, so we don't re-fire every dwellMs while
    // the user keeps hovering the same thing. Cleared as soon as the
    // cursor leaves all targets, so re-entering re-arms.
    this._lastFiredTarget = null;
  }

  // Per-frame hand input hook. Mouse input is ignored — the scene
  // handles mouse-down → grab itself.
  pointerMove({ x, y, source } = {}) {
    if (x == null || source !== "hand") {
      this.cancel();
      return;
    }
    const target = this.getHoveredTarget(x, y);

    // Cursor left all targets → re-arm so re-entering the same target
    // can fire again. This is what lets the heat slider re-trigger
    // after the user steps off it and back on.
    if (target == null && this._lastFiredTarget != null) {
      this._lastFiredTarget = null;
    }

    // Cursor still parked on the just-fired target — wait for the user
    // to move off (or to a different target) before re-arming.
    if (target != null && target === this._lastFiredTarget) {
      this._currentTarget = null;
      this._dwellStart = null;
      return;
    }

    // Re-arm whenever the hovered target changes (including target → null
    // when the cursor leaves all tiles).
    if (target !== this._currentTarget) {
      this._currentTarget = target;
      this._dwellStart = target ? performance.now() : null;
      return;
    }

    if (target && this._dwellStart != null) {
      if (performance.now() - this._dwellStart >= this.dwellMs) {
        const picked = this._currentTarget;
        this._dwellStart = null;
        this._currentTarget = null;
        this._lastFiredTarget = picked;
        this.onPick(picked, x, y);
      }
    }
  }

  cancel() {
    this._currentTarget = null;
    this._dwellStart = null;
    this._lastFiredTarget = null;
  }

  // 0..1 progress of the active dwell. Drives the cursor's dwell ring
  // so the user sees "you're picking this up" feedback.
  getDwellProgress() {
    if (this._dwellStart == null) return 0;
    return Math.min(1, (performance.now() - this._dwellStart) / this.dwellMs);
  }
}

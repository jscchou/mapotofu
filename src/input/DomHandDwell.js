// Hand-hover-to-click for DOM elements. Pixi-rendered scenes already
// have HandButtonDwell; this is the equivalent for HTML overlays
// (modals, the Traditional Recipe panel) so a webcam-only player can
// dismiss them without ever switching to the mouse.
//
// Usage:
//   const dwell = new DomHandDwell({ dwellMs: 1000 });
//   // Inside the app's per-frame ticker:
//   dwell.tick(pointerManager.getState());
//   // Drive the cursor's dwell ring:
//   pointer.setDwell(dwell.getDwellProgress());
//
// Mark the elements you want hand-dwell to fire on with
// `data-hand-dwellable` (e.g. the modal close button). The helper
// resolves the dwellable ancestor of whatever element is under the
// cursor, so a click on a child icon still counts toward its parent
// button.

const DEFAULT_DWELL_MS = 1000;

export class DomHandDwell {
  constructor({ dwellMs = DEFAULT_DWELL_MS } = {}) {
    this.dwellMs = dwellMs;
    this._currentEl = null;
    this._dwellStart = null;
  }

  tick(state) {
    const { x, y, source } = state ?? {};
    // Mouse + missing position: clear any in-progress dwell and bail.
    if (x == null || source !== "hand") {
      this.cancel();
      return;
    }
    const el = document.elementFromPoint(x, y);
    const dwellable = el?.closest?.("[data-hand-dwellable]") ?? null;

    if (dwellable !== this._currentEl) {
      // Drop hover class from the previous target so the player sees
      // the highlight follow their cursor.
      if (this._currentEl) {
        this._currentEl.classList.remove("hand-hover");
      }
      this._currentEl = dwellable;
      this._dwellStart = dwellable ? performance.now() : null;
      if (dwellable) dwellable.classList.add("hand-hover");
      return;
    }

    if (dwellable && this._dwellStart != null) {
      if (performance.now() - this._dwellStart >= this.dwellMs) {
        const target = this._currentEl;
        this._dwellStart = null;
        this._currentEl = null;
        target.classList.remove("hand-hover");
        // Fire as a real click so any wired listener (including
        // analytics-style frameworks) sees a normal MouseEvent.
        if (target.isConnected) target.click();
      }
    }
  }

  cancel() {
    if (this._currentEl) {
      this._currentEl.classList.remove("hand-hover");
    }
    this._currentEl = null;
    this._dwellStart = null;
  }

  getDwellProgress() {
    if (this._dwellStart == null) return 0;
    return Math.min(1, (performance.now() - this._dwellStart) / this.dwellMs);
  }
}

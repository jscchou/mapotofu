// Unified pointer state for mouse + hand inputs.
//
//   { x, y, isDown, source: 'hand' | 'mouse', gestureType: 'mouse' | 'fist' | 'pinch' | null }
//
// Three discrete hand gestures map to three interaction roles (kept on
// separate flags here so scenes can route accordingly):
//   - fist  → "grab" for dragging tiles / cookware
//   - pinch → "precision" for the heat slider
//   - hover → buttons (driven via dwell in scenes; PointerManager itself
//             only signals position when no gesture is active)
//
// Last-active wins for choosing source:
//   - any mouse event (move / button) → source flips to 'mouse'
//   - hand position changes by > 1px or any gesture flips → source flips to 'hand'
//   - holding still doesn't flip
//
// gestureType is locked when isDown transitions true and stays stable
// for the duration of the press, even if the user mid-gesture transitions
// from e.g. fist to pinch. That keeps a single press a single semantic
// action: a slider drag stays a slider drag, a tile drag stays a tile drag.

export class PointerManager {
  constructor({ onDown, onUp } = {}) {
    this.onDown = onDown ?? (() => {});
    this.onUp = onUp ?? (() => {});

    this._mouse = { x: 0, y: 0, isDown: false };
    this._hand = { x: 0, y: 0, fist: false, pinch: false, has: false };
    this._activeSource = "mouse";
    this._wasDown = false;
    this._activeGesture = null; // locked at down-edge

    window.addEventListener("mousemove", this._onMouseMove, { passive: true });
    window.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
  }

  _onMouseMove = (e) => {
    this._mouse.x = e.clientX;
    this._mouse.y = e.clientY;
    this._activeSource = "mouse";
    this._maybeFireTransition();
  };

  _onMouseDown = (e) => {
    if (e.button !== 0) return;
    this._mouse.x = e.clientX;
    this._mouse.y = e.clientY;
    this._mouse.isDown = true;
    this._activeSource = "mouse";
    this._maybeFireTransition();
  };

  _onMouseUp = (e) => {
    if (e.button !== 0) return;
    this._mouse.isDown = false;
    this._activeSource = "mouse";
    this._maybeFireTransition();
  };

  // Push the latest hand reading. Called every tracker frame.
  // hasHand=false when the hand is out of frame.
  updateHand({ x, y, fist, pinch, hasHand }) {
    if (!hasHand) {
      const wasDownAsHand =
        this._activeSource === "hand" &&
        (this._hand.fist || this._hand.pinch) &&
        this._wasDown;
      this._hand.has = false;
      this._hand.fist = false;
      this._hand.pinch = false;
      // If we were dragging via hand, fall back to mouse and emit a cancelled up.
      if (wasDownAsHand) {
        this._activeSource = "mouse";
        this._wasDown = false;
        const s = this.getState();
        this.onUp({ ...s, cancelled: true });
        this._activeGesture = null;
      }
      return;
    }

    const moved =
      !this._hand.has || Math.hypot(x - this._hand.x, y - this._hand.y) > 1;
    const fistChanged = fist !== this._hand.fist;
    const pinchChanged = pinch !== this._hand.pinch;

    this._hand.x = x;
    this._hand.y = y;
    this._hand.fist = !!fist;
    this._hand.pinch = !!pinch;
    this._hand.has = true;

    if (moved || fistChanged || pinchChanged) this._activeSource = "hand";
    this._maybeFireTransition();
  }

  _maybeFireTransition() {
    const isDown = this._isDown();
    if (isDown && !this._wasDown) {
      this._wasDown = true;
      this._activeGesture = this._lockGestureType();
      this.onDown(this.getState());
    } else if (!isDown && this._wasDown) {
      this._wasDown = false;
      const s = this.getState();
      this.onUp(s);
      this._activeGesture = null;
    }
  }

  _isDown() {
    if (this._activeSource === "hand" && this._hand.has) {
      return this._hand.fist || this._hand.pinch;
    }
    return this._mouse.isDown;
  }

  // Pick which gestureType this press should be tagged with. Pinch wins
  // over fist if both somehow happen at the same instant — pinch is the
  // more precise pose, so it's the more deliberate signal.
  _lockGestureType() {
    if (this._activeSource === "hand" && this._hand.has) {
      if (this._hand.pinch) return "pinch";
      if (this._hand.fist) return "fist";
      return null;
    }
    return this._mouse.isDown ? "mouse" : null;
  }

  getState() {
    if (this._activeSource === "hand" && this._hand.has) {
      return {
        x: this._hand.x,
        y: this._hand.y,
        isDown: this._hand.fist || this._hand.pinch,
        source: "hand",
        gestureType:
          this._activeGesture ??
          (this._hand.pinch ? "pinch" : this._hand.fist ? "fist" : null),
      };
    }
    return {
      x: this._mouse.x,
      y: this._mouse.y,
      isDown: this._mouse.isDown,
      source: "mouse",
      gestureType: this._activeGesture ?? (this._mouse.isDown ? "mouse" : null),
    };
  }
}

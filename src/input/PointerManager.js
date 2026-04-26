// Unified pointer state for mouse + hand inputs.
//
//   { x, y, isDown, source: 'hand' | 'mouse' }
//
// Last-active wins:
//   - any mouse event (move / button) → source flips to 'mouse'
//   - hand position changes by > 1px or pinch state changes → source flips to 'hand'
//   - holding still doesn't flip; the user has to actually do something
//
// Emits unified `onDown` / `onUp` callbacks so scenes don't have to care
// which input fired them. Per-frame state is read via `getState()` in the
// app's ticker loop.

export class PointerManager {
  constructor({ onDown, onUp } = {}) {
    this.onDown = onDown ?? (() => {});
    this.onUp = onUp ?? (() => {});

    this._mouse = { x: 0, y: 0, isDown: false };
    this._hand = { x: 0, y: 0, isDown: false, has: false };
    this._activeSource = "mouse";
    this._wasDown = false;

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
  updateHand({ x, y, isDown, hasHand }) {
    if (!hasHand) {
      const wasDownAsHand =
        this._activeSource === "hand" && this._hand.isDown && this._wasDown;
      this._hand.has = false;
      this._hand.isDown = false;
      // If we were dragging via hand, fall back to mouse and emit a cancelled up.
      if (wasDownAsHand) {
        this._activeSource = "mouse";
        this._wasDown = false;
        const s = this.getState();
        this.onUp({ ...s, cancelled: true });
      }
      return;
    }

    const moved =
      !this._hand.has || Math.hypot(x - this._hand.x, y - this._hand.y) > 1;
    const downChanged = isDown !== this._hand.isDown;

    this._hand.x = x;
    this._hand.y = y;
    this._hand.isDown = isDown;
    this._hand.has = true;

    if (moved || downChanged) this._activeSource = "hand";
    this._maybeFireTransition();
  }

  _maybeFireTransition() {
    const s = this.getState();
    if (s.isDown && !this._wasDown) {
      this._wasDown = true;
      this.onDown(s);
    } else if (!s.isDown && this._wasDown) {
      this._wasDown = false;
      this.onUp(s);
    }
  }

  getState() {
    if (this._activeSource === "hand" && this._hand.has) {
      return {
        x: this._hand.x,
        y: this._hand.y,
        isDown: this._hand.isDown,
        source: "hand",
      };
    }
    return {
      x: this._mouse.x,
      y: this._mouse.y,
      isDown: this._mouse.isDown,
      source: "mouse",
    };
  }
}

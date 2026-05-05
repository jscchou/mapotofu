// Gesture detection:
//   - Pinch: thumb-tip (4) to index-tip (8) distance, normalized by hand size
//     (wrist 0 to middle-MCP 9). Hysteresis: enter < enterThreshold,
//     exit > exitThreshold.
//   - Fist: all four non-thumb fingers curled. Used for the "grab" gesture
//     when dragging ingredients/cookware.
//   - Three-finger pose: index + middle + ring extended, pinky curled.
//
// Accuracy tweaks applied to all:
//   - EMA-smoothed pinch ratio (kills single-frame spikes).
//   - Dwell: N consecutive frames of the target state before flipping.
//   - Confidence gate: ignore frames where MediaPipe score < minConfidence.

export class GestureDetector {
  constructor({
    enterThreshold = 0.3,
    exitThreshold = 0.5,
    smoothingAlpha = 0.5,
    minConfidence = 0.6,
    pinchDwellFrames = 3,
    threeFingerDwellFrames = 8,
    fistDwellFrames = 4,
    fingerExtendedCos = 0.6,
    fingerCurledCos = 0.2,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
    onThreeFingerStart,
    onThreeFingerEnd,
  } = {}) {
    this.enterThreshold = enterThreshold;
    this.exitThreshold = exitThreshold;
    this.smoothingAlpha = smoothingAlpha;
    this.minConfidence = minConfidence;
    this.pinchDwellFrames = pinchDwellFrames;
    this.threeFingerDwellFrames = threeFingerDwellFrames;
    this.fistDwellFrames = fistDwellFrames;
    this.fingerExtendedCos = fingerExtendedCos;
    this.fingerCurledCos = fingerCurledCos;

    this.onPinchStart = onPinchStart ?? (() => {});
    this.onPinchMove = onPinchMove ?? (() => {});
    this.onPinchEnd = onPinchEnd ?? (() => {});
    this.onThreeFingerStart = onThreeFingerStart ?? (() => {});
    this.onThreeFingerEnd = onThreeFingerEnd ?? (() => {});

    this.pinching = false;
    this.smoothedRatio = null;
    this.rawRatio = null;
    this.pinchEnterCount = 0;
    this.pinchExitCount = 0;

    this.threeFinger = false;
    this.lastThreePose = false;
    this.threeEnterCount = 0;
    this.threeExitCount = 0;

    this.fist = false;
    this.fistEnterCount = 0;
    this.fistExitCount = 0;
  }

  // landmarks: 21 MediaPipe hand landmarks (normalized 0..1)
  // position:  { x, y } canvas px (already smoothed)
  // confidence: 0..1
  update(landmarks, position, confidence = 1) {
    if (confidence < this.minConfidence) return;
    if (!landmarks || landmarks.length < 21) return;

    this._updatePinch(landmarks, position);
    this._updateThreeFinger(landmarks, position);
    this._updateFist(landmarks);
  }

  cancel() {
    if (this.pinching) {
      this.pinching = false;
      this.onPinchEnd({ position: null, ratio: null, cancelled: true });
    }
    if (this.threeFinger) {
      this.threeFinger = false;
      this.onThreeFingerEnd({ position: null, cancelled: true });
    }
    this.pinchEnterCount = 0;
    this.pinchExitCount = 0;
    this.threeEnterCount = 0;
    this.threeExitCount = 0;
    this.fist = false;
    this.fistEnterCount = 0;
    this.fistExitCount = 0;
    this.smoothedRatio = null;
    this.rawRatio = null;
    this.lastThreePose = false;
  }

  isPinching() {
    return this.pinching;
  }
  isThreeFinger() {
    return this.threeFinger;
  }
  isFist() {
    return this.fist;
  }
  getRatio() {
    return this.smoothedRatio;
  }
  getRawRatio() {
    return this.rawRatio;
  }

  // ---------- pinch ----------

  _updatePinch(landmarks, position) {
    const raw = this._computeRatio(landmarks);
    this.rawRatio = raw;
    this.smoothedRatio =
      this.smoothedRatio == null
        ? raw
        : this.smoothingAlpha * raw +
          (1 - this.smoothingAlpha) * this.smoothedRatio;

    const r = this.smoothedRatio;

    if (!this.pinching) {
      if (r < this.enterThreshold) this.pinchEnterCount++;
      else this.pinchEnterCount = 0;

      if (this.pinchEnterCount >= this.pinchDwellFrames) {
        this.pinching = true;
        this.pinchEnterCount = 0;
        this.pinchExitCount = 0;
        this.onPinchStart({ position, ratio: r });
      }
    } else {
      if (r > this.exitThreshold) {
        this.pinchExitCount++;
        if (this.pinchExitCount >= this.pinchDwellFrames) {
          this.pinching = false;
          this.pinchExitCount = 0;
          this.pinchEnterCount = 0;
          this.onPinchEnd({ position, ratio: r, cancelled: false });
          return;
        }
        // Above exit but still inside dwell: freeze (don't emit move).
      } else {
        this.pinchExitCount = 0;
        this.onPinchMove({ position, ratio: r });
      }
    }
  }

  _computeRatio(lms) {
    const t = lms[4];
    const i = lms[8];
    const w = lms[0];
    const m = lms[9];
    const pinchDist = Math.hypot(t.x - i.x, t.y - i.y);
    const handSize = Math.hypot(w.x - m.x, w.y - m.y);
    if (handSize < 1e-6) return Infinity;
    return pinchDist / handSize;
  }

  // ---------- three-finger ----------

  _updateThreeFinger(landmarks, position) {
    const isThree = this._isThreeFingerPose(landmarks);
    this.lastThreePose = isThree;

    if (!this.threeFinger) {
      if (isThree) this.threeEnterCount++;
      else this.threeEnterCount = 0;
      if (this.threeEnterCount >= this.threeFingerDwellFrames) {
        this.threeFinger = true;
        this.threeEnterCount = 0;
        this.threeExitCount = 0;
        this.onThreeFingerStart({ position });
      }
    } else {
      if (!isThree) this.threeExitCount++;
      else this.threeExitCount = 0;
      if (this.threeExitCount >= this.threeFingerDwellFrames) {
        this.threeFinger = false;
        this.threeEnterCount = 0;
        this.threeExitCount = 0;
        this.onThreeFingerEnd({ position, cancelled: false });
      }
    }
  }

  // Alignment of the finger's two main segments: ~1 when the finger is
  // straight, near 0 when bent ~90°, negative when curled past 90°.
  _fingerCos(lms, mcp, pip, tip) {
    const a = lms[mcp];
    const b = lms[pip];
    const c = lms[tip];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const d1 = Math.hypot(v1x, v1y);
    const d2 = Math.hypot(v2x, v2y);
    if (d1 < 1e-6 || d2 < 1e-6) return 0;
    return (v1x * v2x + v1y * v2y) / (d1 * d2);
  }

  _isExtended(lms, mcp, pip, tip) {
    return this._fingerCos(lms, mcp, pip, tip) > this.fingerExtendedCos;
  }

  _isThreeFingerPose(lms) {
    const indexExt = this._isExtended(lms, 5, 6, 8);
    const middleExt = this._isExtended(lms, 9, 10, 12);
    const ringExt = this._isExtended(lms, 13, 14, 16);
    const pinkyExt = this._isExtended(lms, 17, 18, 20);
    // Strictly: index + middle + ring up, pinky down. Thumb unconstrained.
    return indexExt && middleExt && ringExt && !pinkyExt;
  }

  // ---------- fist (closed hand for "grab") ----------

  _updateFist(landmarks) {
    const isFist = this._isFistPose(landmarks);

    if (!this.fist) {
      if (isFist) this.fistEnterCount++;
      else this.fistEnterCount = 0;
      if (this.fistEnterCount >= this.fistDwellFrames) {
        this.fist = true;
        this.fistEnterCount = 0;
        this.fistExitCount = 0;
      }
    } else {
      if (!isFist) this.fistExitCount++;
      else this.fistExitCount = 0;
      if (this.fistExitCount >= this.fistDwellFrames) {
        this.fist = false;
        this.fistEnterCount = 0;
        this.fistExitCount = 0;
      }
    }
  }

  // All four non-thumb fingers curled. We use a slightly higher cos
  // threshold (more strictly curled) than the inverse of fingerExtendedCos
  // to avoid bouncing between "extended" and "fist" when fingers are
  // partially relaxed.
  _isFistPose(lms) {
    const indexCurled = this._fingerCos(lms, 5, 6, 8) < this.fingerCurledCos;
    const middleCurled = this._fingerCos(lms, 9, 10, 12) < this.fingerCurledCos;
    const ringCurled = this._fingerCos(lms, 13, 14, 16) < this.fingerCurledCos;
    const pinkyCurled = this._fingerCos(lms, 17, 18, 20) < this.fingerCurledCos;
    return indexCurled && middleCurled && ringCurled && pinkyCurled;
  }
}

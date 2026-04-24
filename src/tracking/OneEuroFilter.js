// One Euro filter — https://gery.casiez.net/1euro/
// Smooths a noisy signal while keeping low lag. Cutoff adapts to speed:
// slow motion → low cutoff (more smoothing), fast motion → high cutoff (less lag).

function smoothingAlpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPassFilter {
  constructor() {
    this.initialized = false;
    this.s = 0;
  }

  filter(value, alpha) {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    return this.s;
  }

  get lastFiltered() {
    return this.s;
  }

  reset() {
    this.initialized = false;
    this.s = 0;
  }
}

export class OneEuroFilter {
  constructor({ mincutoff = 1.0, beta = 0.0, dcutoff = 1.0 } = {}) {
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  // timestamp: seconds
  filter(value, timestamp) {
    const ts = timestamp ?? performance.now() / 1000;
    let dt = 1 / 30;
    if (this.lastTime != null) {
      const delta = ts - this.lastTime;
      if (delta > 0) dt = delta;
    }
    this.lastTime = ts;

    const prev = this.xFilter.initialized ? this.xFilter.lastFiltered : value;
    const dvalue = (value - prev) / dt;
    const edvalue = this.dxFilter.filter(dvalue, smoothingAlpha(this.dcutoff, dt));
    const cutoff = this.mincutoff + this.beta * Math.abs(edvalue);
    return this.xFilter.filter(value, smoothingAlpha(cutoff, dt));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}
export class DebugOverlay {
  constructor({ startVisible = true } = {}) {
    this.visible = startVisible;
    this.video = null;

    this.root = document.createElement("div");
    this.root.className = "debug-overlay" + (startVisible ? "" : " hidden");
    this.root.innerHTML = `
      <div class="debug-panel">
        <div class="row"><span>FPS</span><span data-k="fps">--</span></div>
        <div class="row"><span>Raw</span><span data-k="raw">--</span></div>
        <div class="row"><span>Smoothed</span><span data-k="smooth">--</span></div>
        <div class="row"><span>Hand</span><span data-k="hand">no</span></div>
        <div class="row"><span>Confidence</span><span data-k="conf">--</span></div>
        <div class="row"><span>Pinch ratio</span><span data-k="ratio">--</span></div>
        <div class="row"><span>Pinch state</span><span data-k="pinch">open</span></div>
        <div class="row"><span>3-finger</span><span data-k="three">no</span></div>
        <div class="row"><span>Grabbed</span><span data-k="grab">--</span></div>
        <div class="row"><span>Basket</span><span data-k="basket">0</span></div>
      </div>
      <canvas class="debug-preview" width="240" height="180"></canvas>
    `;
    document.body.appendChild(this.root);

    this.canvas = this.root.querySelector(".debug-preview");
    this.ctx = this.canvas.getContext("2d");

    this.refs = {};
    this.root.querySelectorAll("[data-k]").forEach((el) => {
      this.refs[el.dataset.k] = el;
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "d" || e.key === "D") this.toggle();
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.root.classList.toggle("hidden", !this.visible);
  }

  setVideo(video) {
    this.video = video;
  }

  update({
    fps,
    raw,
    smooth,
    detected,
    confidence,
    landmarks,
    pinchRatio,
    pinching,
    threeFinger,
    grabbedId,
    basketCount,
  }) {
    if (!this.visible) return;

    this.refs.fps.textContent = fps != null ? fps.toFixed(0) : "--";
    this.refs.raw.textContent = raw
      ? `${raw.x.toFixed(3)}, ${raw.y.toFixed(3)}`
      : "--";
    this.refs.smooth.textContent = smooth
      ? `${smooth.x.toFixed(0)}, ${smooth.y.toFixed(0)}`
      : "--";
    this.refs.hand.textContent = detected ? "yes" : "no";
    this.refs.conf.textContent =
      confidence != null ? confidence.toFixed(2) : "--";
    this.refs.ratio.textContent =
      pinchRatio != null && isFinite(pinchRatio)
        ? pinchRatio.toFixed(3)
        : "--";
    this.refs.pinch.textContent = pinching ? "closed" : "open";
    this.refs.three.textContent = threeFinger ? "yes" : "no";
    this.refs.grab.textContent = grabbedId ?? "--";
    this.refs.basket.textContent = basketCount != null ? `${basketCount}` : "--";

    this._drawPreview(landmarks);
  }

  _drawPreview(landmarks) {
    const { canvas, ctx, video } = this;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (video && video.readyState >= 2) {
      // Mirror horizontally so the preview matches the player's perspective.
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);
    }

    if (!landmarks) return;

    // Plot raw 21 landmarks. We drew the video mirrored, so mirror x here too.
    ctx.fillStyle = "#ff8a5c";
    for (const lm of landmarks) {
      const x = (1 - lm.x) * width;
      const y = lm.y * height;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const tip = landmarks[8];
    if (tip) {
      ctx.fillStyle = "#00e5ff";
      ctx.beginPath();
      ctx.arc((1 - tip.x) * width, tip.y * height, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

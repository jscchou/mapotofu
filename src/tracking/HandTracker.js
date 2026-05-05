import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  constructor({ onHandDetected, onHandLost, onError } = {}) {
    this.onHandDetected = onHandDetected ?? (() => {});
    this.onHandLost = onHandLost ?? (() => {});
    this.onError = onError ?? (() => {});

    this.video = null;
    this.landmarker = null;
    this.running = false;
    this.hadHandLastFrame = false;

    // Sticky-hand tracking: when the user has both hands in frame we
    // want to keep following the same one each frame instead of letting
    // MediaPipe swap. We remember the index-tip position of the chosen
    // hand and pick the closest match next frame.
    this._lastTip = null;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      // Detect up to two hands so we can choose between them deliberately;
      // the consumer-facing API still emits a single sticky hand.
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    await this._setupCamera();
  }

  async _setupCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Webcam API is not available in this browser. Try Chrome or Edge on desktop."
      );
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve();
      video.onloadedmetadata = () => resolve();
    });
    await video.play();
    this.video = video;
  }

  start() {
    if (!this.video || !this.landmarker) {
      throw new Error("HandTracker.init() must succeed before start().");
    }
    this.running = true;

    const onFrame = (now) => {
      if (!this.running) return;
      try {
        this._detect(now);
      } catch (err) {
        this.onError(err);
      }
      if ("requestVideoFrameCallback" in this.video) {
        this.video.requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame(onFrame);
      }
    };

    if ("requestVideoFrameCallback" in this.video) {
      this.video.requestVideoFrameCallback(onFrame);
    } else {
      requestAnimationFrame(onFrame);
    }
  }

  stop() {
    this.running = false;
  }

  _detect(now) {
    // MediaPipe wants a monotonic millisecond timestamp.
    const result = this.landmarker.detectForVideo(this.video, now);
    const hands = result.landmarks ?? [];
    const hasHand = hands.length > 0;

    if (hasHand) {
      const idx = this._chooseHandIndex(hands, result.handednesses ?? []);
      const lms = hands[idx];
      const tip = lms[8];
      this._lastTip = { x: tip.x, y: tip.y };

      const confidence = result.handednesses?.[idx]?.[0]?.score ?? 0;
      const handedness =
        result.handednesses?.[idx]?.[0]?.categoryName ?? "Unknown";
      this.onHandDetected({
        landmarks: lms,
        worldLandmarks: result.worldLandmarks?.[idx] ?? null,
        handedness,
        confidence,
        timestamp: now / 1000,
      });
      this.hadHandLastFrame = true;
    } else if (this.hadHandLastFrame) {
      // Lost the tracked hand — drop the proximity anchor so the next
      // detection picks deliberately by confidence rather than chasing
      // a stale position.
      this._lastTip = null;
      this.onHandLost();
      this.hadHandLastFrame = false;
    }
  }

  // Pick the same hand we were tracking last frame: closest index-tip
  // wins. With no prior anchor (first detection / after a loss), pick
  // the highest-confidence hand.
  _chooseHandIndex(hands, handednesses) {
    if (hands.length === 1) return 0;

    if (this._lastTip) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < hands.length; i++) {
        const tip = hands[i][8];
        const dx = tip.x - this._lastTip.x;
        const dy = tip.y - this._lastTip.y;
        const d = dx * dx + dy * dy; // sqrt unnecessary for argmin
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    let bestIdx = 0;
    let bestConf = -1;
    for (let i = 0; i < hands.length; i++) {
      const c = handednesses[i]?.[0]?.score ?? 0;
      if (c > bestConf) {
        bestConf = c;
        bestIdx = i;
      }
    }
    return bestIdx;
  }
}

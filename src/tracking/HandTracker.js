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
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
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
    const hasHand = result.landmarks && result.landmarks.length > 0;

    if (hasHand) {
      const confidence =
        result.handednesses?.[0]?.[0]?.score ?? 0;
      const handedness =
        result.handednesses?.[0]?.[0]?.categoryName ?? "Unknown";
      this.onHandDetected({
        landmarks: result.landmarks[0],
        worldLandmarks: result.worldLandmarks?.[0] ?? null,
        handedness,
        confidence,
        timestamp: now / 1000,
      });
      this.hadHandLastFrame = true;
    } else if (this.hadHandLastFrame) {
      this.onHandLost();
      this.hadHandLastFrame = false;
    }
  }
}

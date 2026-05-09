// One-shot banner shown when the page boots with the AudioContext
// suspended (i.e. always — browsers require a real user gesture to
// unlock). Auto-dismisses on the first click/key/touch.
//
// Why this exists: hand-tracking gestures (pinch, fist, dwell) don't
// generate DOM gestures, so a player who uses only the webcam never
// gives the browser the user activation it needs to start audio. The
// banner asks for one physical interaction (mouse, trackpad, or any
// key) up front, after which all audio works for the rest of the
// session.

import {
  isAudioUnlocked,
  onAudioUnlock,
} from "../audio/soundEngine.js";

const DISMISS_TRANSITION_MS = 240;

export function mountAudioUnlockBanner() {
  // Already unlocked (e.g. dev hot-reload after first interaction) —
  // don't even mount the DOM.
  if (isAudioUnlocked()) return { unmount() {} };

  const banner = document.createElement("div");
  banner.className = "audio-unlock-banner";
  banner.innerHTML = `
    <span class="audio-unlock-icon" aria-hidden="true">🔊</span>
    <span class="audio-unlock-text">Click anywhere or press a key to enable sound</span>
  `;
  document.body.appendChild(banner);

  let unmounted = false;
  function dismiss() {
    if (unmounted) return;
    unmounted = true;
    banner.classList.add("audio-unlock-banner-fade");
    setTimeout(() => {
      if (banner.isConnected) banner.remove();
    }, DISMISS_TRANSITION_MS + 60);
  }

  // The engine's installUserGestureUnlock owns the actual unlock; we
  // just wait for the unlocked-event to drop our banner.
  const unsub = onAudioUnlock(dismiss);

  return {
    unmount() {
      unsub();
      dismiss();
    },
  };
}

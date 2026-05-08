// Floating top-right speaker button. Toggles the soundEngine's mute
// state and reflects it in the icon. Persistence is handled inside
// soundEngine.js, this is purely the UI surface.
//
// Mounted on the main app routes only — /gallery skips it (per spec
// for Scene 7).

import { isMuted, toggleMuted, onMuteChange } from "../audio/soundEngine.js";

const SPEAKER_HTML = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M4 9h3l5-4v14l-5-4H4z" fill="#2a2a2a"/>
    <path d="M16 9.5a3.5 3.5 0 0 1 0 5" stroke="#2a2a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M18.4 7a6.5 6.5 0 0 1 0 10" stroke="#2a2a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </svg>`;

const SPEAKER_MUTED_HTML = `
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M4 9h3l5-4v14l-5-4H4z" fill="#2a2a2a"/>
    <path d="M16 9 L22 15 M22 9 L16 15" stroke="#2a2a2a" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  </svg>`;

export function mountMuteButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mute-btn";
  btn.setAttribute("aria-label", "Toggle sound");
  btn.innerHTML = isMuted() ? SPEAKER_MUTED_HTML : SPEAKER_HTML;
  if (isMuted()) btn.classList.add("mute-btn-muted");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMuted();
  });

  const unsub = onMuteChange((muted) => {
    btn.innerHTML = muted ? SPEAKER_MUTED_HTML : SPEAKER_HTML;
    btn.classList.toggle("mute-btn-muted", muted);
  });

  document.body.appendChild(btn);

  return {
    unmount() {
      unsub();
      btn.remove();
    },
  };
}

// DOM-side mirror of the hand cursor.
//
// The Pixi-rendered cursor lives inside the canvas, which has no
// z-index, so DOM modals (z-index 800) cover it. Players can't see
// where their hand is once the cursor crosses into a modal — and
// can't see if the dwell timer is running. This overlay sits at
// z-index 9999 and replicates the cursor's position + dwell
// progress in pure DOM, so feedback is visible no matter what's
// underneath.
//
// Usage:
//   const overlay = mountHandCursorOverlay();
//   // each frame:
//   overlay.update({ source, x, y, dwell });

const SIZE = 40;     // outer ring diameter (CSS px)
const DOT = 12;      // inner dot diameter

export function mountHandCursorOverlay() {
  const root = document.createElement("div");
  root.className = "hand-cursor";
  root.innerHTML = `
    <svg class="hand-cursor-ring" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" aria-hidden="true">
      <circle class="hand-cursor-track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 3}" />
      <circle class="hand-cursor-fill" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 3}" />
    </svg>
    <div class="hand-cursor-dot"></div>
  `;
  document.body.appendChild(root);

  const fill = root.querySelector(".hand-cursor-fill");
  // Pre-compute the circumference so animating stroke-dashoffset gives
  // a clean 0%→100% fill of the ring.
  const radius = SIZE / 2 - 3;
  const circumference = 2 * Math.PI * radius;
  fill.style.strokeDasharray = `${circumference}`;
  fill.style.strokeDashoffset = `${circumference}`;
  // Start at 12 o'clock and sweep clockwise.
  fill.setAttribute("transform", `rotate(-90 ${SIZE / 2} ${SIZE / 2})`);

  let visible = false;

  function update({ source, x, y, dwell = 0 }) {
    const shouldShow = source === "hand" && x != null && y != null;
    if (shouldShow !== visible) {
      visible = shouldShow;
      root.classList.toggle("hand-cursor-visible", shouldShow);
    }
    if (!shouldShow) return;
    // translate3d to get GPU compositing + avoid subpixel jitter
    root.style.transform = `translate3d(${x - SIZE / 2}px, ${y - SIZE / 2}px, 0)`;
    const p = Math.max(0, Math.min(1, dwell));
    fill.style.strokeDashoffset = `${circumference * (1 - p)}`;
  }

  return {
    update,
    unmount() {
      root.remove();
    },
  };
}

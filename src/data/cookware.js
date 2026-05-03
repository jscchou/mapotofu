// Cookware data — same shape as ingredients.js so scenes can iterate over a
// stable list and look up PNGs through Vite-bundled paths.
//
// Each entry now carries the on-stove transform Scene 4 lays out in State B
// (Figma values, in 1920×1080 design canvas coords). Scene 5 reads the same
// transforms and scales them to its smaller stove. Single source of truth.

import fryingPan from "../assets/cookware/FryingPan.png";
import grillPan from "../assets/cookware/GrillPan.png";
import stockPot from "../assets/cookware/StockPot.png";
import wok from "../assets/cookware/Wok.png";

// Scene 4 stove anchor: image at (1169, 240), size 648 × 675.
// Stove center: (1493, 577.5). Used by Scene 5 to scale on-stove transforms.
export const STOVE_REF = {
  left: 1169,
  top: 240,
  width: 648,
  height: 675,
  centerX: 1493,
  centerY: 577.5,
};

// Wok exact Figma export: card 337.5×224 → onStove 704.37×467.49 at (1257,269)
// rotated 89.69°. Scale factor card→stove ≈ 2.087.
const WOK_SCALE = 704.37 / 337.5;

// Wok unrotated bounding-box center (used as a "shared anchor" for the other
// pans — keeps the handles all sticking out toward the same corner).
const ANCHOR_CX = 1257 + 704.37 / 2; // 1609.18
const ANCHOR_CY = 269 + 467.49 / 2; // 502.74

function deriveOnStove(cardW, cardH) {
  const w = cardW * WOK_SCALE;
  const h = cardH * WOK_SCALE;
  return {
    width: w,
    height: h,
    left: ANCHOR_CX - w / 2,
    top: ANCHOR_CY - h / 2,
    rotation: 89.69,
  };
}

export const cookware = [
  {
    id: "wok",
    name: "Wok",
    imagePath: wok,
    cardImage: { width: 337.5, height: 224 },
    onStove: {
      width: 704.37,
      height: 467.49,
      left: 1257,
      top: 269,
      rotation: 89.69,
    },
  },
  {
    id: "frying-pan",
    name: "Frying Pan",
    imagePath: fryingPan,
    cardImage: { width: 354.5, height: 220 },
    onStove: deriveOnStove(354.5, 220),
  },
  {
    id: "stock-pot",
    name: "Stockpot",
    imagePath: stockPot,
    cardImage: { width: 300, height: 247 },
    onStove: deriveOnStove(300, 247),
  },
  {
    id: "grill-pan",
    name: "Grill Pan",
    imagePath: grillPan,
    cardImage: { width: 343, height: 212 },
    onStove: deriveOnStove(343, 212),
  },
];

export function findCookware(id) {
  return cookware.find((c) => c.id === id) ?? null;
}

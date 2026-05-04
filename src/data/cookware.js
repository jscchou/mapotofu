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

// Scene 4 stove placement reference. Burner is roughly horizontally
// centered, ~45% from the stove top (eyeballed from the asset).
// Scene 5 uses the same ratios, scaled to its smaller stove.
export const STOVE_REF = {
  left: 1169,
  top: 240,
  width: 648,
  height: 675,
  centerX: 1493,
  centerY: 577.5,
  burnerX: 1493,
  burnerY: 544, // 240 + 675 * 0.45 ≈ 544
};

// onStove schema:
//   width, height = unrotated source dimensions, in 1920×1080 design units
//   rotation     = degrees clockwise (≈90 puts the handle pointing down)
//   cx, cy       = sprite-bbox-center offset from the burner center
//                  (sprite uses anchor 0.5/0.5 at the unrotated bbox center).
//                  Positive `cy` pushes the bbox down so the body lands on
//                  the burner with the handle hanging below.
//
// Card→stove scale = wok's 704.37/337.5 ≈ 2.087, applied uniformly.
// Per-cookware `cy` values are first-pass guesses — bump in the data file
// to fine-tune where each pan sits.
const WOK_SCALE = 704.37 / 337.5;

function deriveOnStove(cardW, cardH, cy = 150) {
  return {
    width: cardW * WOK_SCALE,
    height: cardH * WOK_SCALE,
    rotation: 90,
    cx: 0,
    cy,
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
      rotation: 90,
      cx: 0,
      cy: 176, // body sits on burner, handle hangs ~30px past stove bottom
    },
  },
  {
    id: "frying-pan",
    name: "Frying Pan",
    imagePath: fryingPan,
    cardImage: { width: 354.5, height: 220 },
    onStove: deriveOnStove(354.5, 220, 160),
  },
  {
    id: "stock-pot",
    name: "Stockpot",
    imagePath: stockPot,
    cardImage: { width: 300, height: 247 },
    onStove: deriveOnStove(300, 247, 80),
  },
  {
    id: "grill-pan",
    name: "Grill Pan",
    imagePath: grillPan,
    cardImage: { width: 343, height: 212 },
    onStove: deriveOnStove(343, 212, 160),
  },
];

export function findCookware(id) {
  return cookware.find((c) => c.id === id) ?? null;
}

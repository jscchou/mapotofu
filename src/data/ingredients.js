// Ingredient data — imports go through Vite so paths get bundled correctly.
//
// Schema:
//   { id, name, category, imagePath, bakedBackground }
//   bakedBackground: 'blue' | 'yellow' | 'none'
//     Kept on every entry for future visual variants. The current Scene 3
//     renders all tiles as transparent rounded-rects with yellow borders,
//     so this field has no immediate visual effect — but other consumers
//     (CookingScene, future scenes) still read it.
//
// `ingredient` category is ordered to match Scene 3's 4×4 grid (row by
// row, left-to-right). The right-panel grid is data-driven, so editing
// this order rearranges the grid.

import softTofuCubes from "../assets/ingredients/SoftTofuCubes.png";
import crumbledTofu from "../assets/ingredients/CrumbledTofu.png";
import hardTofuCubes from "../assets/ingredients/HardTofuCubes.png";
import frozenTofu from "../assets/ingredients/FrozenTofu.png";
import peanutOil from "../assets/ingredients/PeanutOil.png";
import oliveOil from "../assets/ingredients/OliveOil.png";
import cornOil from "../assets/ingredients/CornOil.png";
import scallion from "../assets/ingredients/Scallion.png";
import ginger from "../assets/ingredients/Ginger.png";
import greenGarlic from "../assets/ingredients/GreenGarlic.png";
import redPepper from "../assets/ingredients/RedPepper.png";
import chili from "../assets/ingredients/Chili.png";
import groundBeef from "../assets/ingredients/GroundBeef.png";
import mincedPork from "../assets/ingredients/mincedpork.png";
import sugar from "../assets/ingredients/Sugar.png";
import salt from "../assets/ingredients/Salt.png";
import soySauce from "../assets/ingredients/SoySauce.png";
import vinegar from "../assets/ingredients/Vinegar.png";
import starchWater from "../assets/ingredients/StarchWater.png";
import pixianChiliSauce from "../assets/ingredients/PixianChiliSauce.png";
import szechuanPepperPowder from "../assets/ingredients/SzechuanPepperPowder.png";
import cookingWine from "../assets/ingredients/CookingWine.png";
import fermentedBlackBeans from "../assets/ingredients/FermentedBlackBeans.png";

export const ingredients = [
  // ----- Tofu (4) -----
  {
    id: "soft-tofu-cubes",
    name: "Soft Tofu cubes",
    category: "tofu",
    imagePath: softTofuCubes,
    bakedBackground: "blue",
  },
  {
    id: "crumbled-tofu",
    name: "Crumbled Tofu",
    category: "tofu",
    imagePath: crumbledTofu,
    bakedBackground: "blue",
  },
  {
    id: "hard-tofu-cubes",
    name: "Hard Tofu Cubes",
    category: "tofu",
    imagePath: hardTofuCubes,
    bakedBackground: "blue",
  },
  {
    id: "frozen-tofu",
    name: "Frozen Tofu",
    category: "tofu",
    imagePath: frozenTofu,
    bakedBackground: "blue",
  },

  // ----- Oil (3) -----
  {
    id: "peanut-oil",
    name: "Peanut Oil",
    category: "oil",
    imagePath: peanutOil,
    bakedBackground: "none",
  },
  {
    id: "olive-oil",
    name: "Olive Oil",
    category: "oil",
    imagePath: oliveOil,
    bakedBackground: "none",
  },
  {
    id: "corn-oil",
    name: "Corn Oil",
    category: "oil",
    imagePath: cornOil,
    bakedBackground: "none",
  },

  // ----- Right-panel ingredients, in 4×4 grid order -----
  // Row 1
  {
    id: "scallion",
    name: "Scallion",
    category: "ingredient",
    imagePath: scallion,
    bakedBackground: "none",
  },
  {
    id: "ginger",
    name: "Ginger",
    category: "ingredient",
    imagePath: ginger,
    bakedBackground: "none",
  },
  {
    id: "green-garlic",
    name: "Green Garlic",
    category: "ingredient",
    imagePath: greenGarlic,
    bakedBackground: "none",
  },
  {
    id: "red-pepper",
    name: "Red Pepper",
    category: "ingredient",
    imagePath: redPepper,
    bakedBackground: "none",
  },
  // Row 2
  {
    id: "chili",
    name: "Chili",
    category: "ingredient",
    imagePath: chili,
    bakedBackground: "none",
  },
  {
    id: "ground-beef",
    name: "Ground Beef",
    category: "ingredient",
    imagePath: groundBeef,
    bakedBackground: "yellow",
  },
  {
    id: "minced-pork",
    name: "minced Pork",
    category: "ingredient",
    imagePath: mincedPork,
    bakedBackground: "yellow",
  },
  {
    id: "sugar",
    name: "Sugar",
    category: "ingredient",
    imagePath: sugar,
    bakedBackground: "none",
  },
  // Row 3
  {
    id: "salt",
    name: "Salt",
    category: "ingredient",
    imagePath: salt,
    bakedBackground: "none",
  },
  {
    id: "soy-sauce",
    name: "Soy Sauce",
    category: "ingredient",
    imagePath: soySauce,
    bakedBackground: "none",
  },
  {
    id: "vinegar",
    name: "Black Vinegar",
    category: "ingredient",
    imagePath: vinegar,
    bakedBackground: "none",
  },
  {
    id: "starch-water",
    name: "Starch Water",
    category: "ingredient",
    imagePath: starchWater,
    bakedBackground: "blue",
  },
  // Row 4
  {
    id: "pixian-chili-sauce",
    name: "Pixian Chili Sauce",
    category: "ingredient",
    imagePath: pixianChiliSauce,
    bakedBackground: "none",
  },
  {
    id: "szechuan-pepper-powder",
    name: "Szechuan Pepper Powder",
    category: "ingredient",
    imagePath: szechuanPepperPowder,
    bakedBackground: "blue",
  },
  {
    id: "cooking-wine",
    name: "Shaoxing Cooking Wine",
    category: "ingredient",
    imagePath: cookingWine,
    bakedBackground: "none",
  },
  {
    id: "fermented-black-beans",
    name: "Fermented Black Bean",
    category: "ingredient",
    imagePath: fermentedBlackBeans,
    bakedBackground: "yellow",
  },
];

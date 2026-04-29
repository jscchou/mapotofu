// Ingredient data — imports go through Vite so paths get bundled correctly.
import softTofuCubes from "../assets/ingredients/SoftTofuCubes.png";
import crumbledTofu from "../assets/ingredients/CrumbledTofu.png";
import hardTofuCubes from "../assets/ingredients/HardTofuCubes.png";
import frozenTofu from "../assets/ingredients/FrozenTofu.png";
import peanutOil from "../assets/ingredients/PeanutOil.png";
import oliveOil from "../assets/ingredients/OliveOil.png";
import cornOil from "../assets/ingredients/CornOil.png";
import scallion from "../assets/ingredients/Scallion.png";
import ginger from "../assets/ingredients/Ginger.png";
import tomato from "../assets/ingredients/Tomato.png";
import redPepper from "../assets/ingredients/RedPepper.png";
import chili from "../assets/ingredients/Chili.png";
import groundBeef from "../assets/ingredients/GroundBeef.png";
import salt from "../assets/ingredients/Salt.png";
import sugar from "../assets/ingredients/Sugar.png";

export const ingredients = [
  // Tofu
  {
    id: "soft-tofu-cubes",
    name: "Soft Tofu Cubes",
    category: "tofu",
    imagePath: softTofuCubes,
    hasBakedBackground: true,
  },
  {
    id: "crumbled-tofu",
    name: "Crumbled Tofu",
    category: "tofu",
    imagePath: crumbledTofu,
    hasBakedBackground: true,
  },
  {
    id: "hard-tofu-cubes",
    name: "Hard Tofu Cubes",
    category: "tofu",
    imagePath: hardTofuCubes,
    hasBakedBackground: true,
  },
  {
    id: "frozen-tofu",
    name: "Frozen Tofu",
    category: "tofu",
    imagePath: frozenTofu,
    hasBakedBackground: true,
  },

  // Oil
  {
    id: "peanut-oil",
    name: "Peanut Oil",
    category: "oil",
    imagePath: peanutOil,
    hasBakedBackground: false,
  },
  {
    id: "olive-oil",
    name: "Olive Oil",
    category: "oil",
    imagePath: oliveOil,
    hasBakedBackground: false,
  },
  {
    id: "corn-oil",
    name: "Corn Oil",
    category: "oil",
    imagePath: cornOil,
    hasBakedBackground: false,
  },

  // Ingredients
  {
    id: "scallion",
    name: "Scallion",
    category: "ingredient",
    imagePath: scallion,
    hasBakedBackground: false,
  },
  {
    id: "ginger",
    name: "Ginger",
    category: "ingredient",
    imagePath: ginger,
    hasBakedBackground: false,
  },
  {
    id: "tomato",
    name: "Tomato",
    category: "ingredient",
    imagePath: tomato,
    hasBakedBackground: false,
  },
  {
    id: "red-pepper",
    name: "Red Pepper",
    category: "ingredient",
    imagePath: redPepper,
    hasBakedBackground: false,
  },
  {
    id: "chili",
    name: "Chili",
    category: "ingredient",
    imagePath: chili,
    hasBakedBackground: false,
  },
  {
    id: "ground-beef",
    name: "Ground Beef",
    category: "ingredient",
    imagePath: groundBeef,
    hasBakedBackground: true,
  },
  {
    id: "salt",
    name: "Salt",
    category: "ingredient",
    imagePath: salt,
    hasBakedBackground: false,
  },
  {
    id: "sugar",
    name: "Sugar",
    category: "ingredient",
    imagePath: sugar,
    hasBakedBackground: false,
  },
];

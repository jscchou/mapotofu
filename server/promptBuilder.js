// Four-layer prompt builder for the Gemini dish-image call.
// Lookup tables, NOT raw value interpolation — that way the model sees
// rich descriptive language instead of e.g. raw IDs.
//
// IMPORTANT: keep this file in sync with /src/cooking/dishPromptBuilder.js.
// Same lookup tables, same template, same ID convention (kebab-case, the
// same IDs the game uses for ingredients + cookware).

const STYLE_ANCHOR =
  "Hand-painted gouache illustration, slightly textured paper grain, soft natural daylight, retro 1970s Japanese cookbook aesthetic, saturated but not garish.";

const COMPOSITION =
  "Top-down 90° overhead shot, single dish centered in frame, isolated on a fully transparent background with no surface, no shadow, no other objects, PNG with alpha channel.";

// All keys below match the game's actual IDs (see /src/data/ingredients.js
// and /src/data/cookware.js).
export const cookware_phrases = {
  wok: "blackened cast-iron wok",
  "frying-pan": "well-seasoned cast-iron frying pan",
  "stock-pot": "tall stainless-steel stockpot",
  "grill-pan": "ridged cast-iron grill pan",
};

export const tofu_phrases = {
  "soft-tofu-cubes": "delicate silken tofu cubes, fragile and glossy",
  "crumbled-tofu": "softly crumbled tofu, scattered through the sauce",
  "hard-tofu-cubes": "firm tofu cubes with crisp edges, neatly arranged",
  "frozen-tofu": "frozen tofu pieces with a porous, sponge-like texture",
};

export const oil_phrases = {
  "peanut-oil": "fragrant peanut oil",
  "olive-oil": "extra-virgin olive oil",
  "corn-oil": "neutral corn oil",
};

// Garnish descriptions for everything the player can add. `null` = base
// ingredient that doesn't need a visible callout (e.g. salt, sugar). Items
// not in this map are silently dropped from the garnish line — that's how
// tofu and oil entries get filtered out when `ingredients` includes them.
export const garnish_phrases = {
  scallion: "finely sliced scallion greens",
  ginger: "thin slivers of fresh ginger",
  tomato: "diced ripe tomato",
  "red-pepper": "slivered red bell pepper",
  chili: "scattered whole red chilies",
  "ground-beef": "browned ground beef",
  salt: null,
  sugar: null,
};

function pick(table, key, fallback) {
  return table[key] ?? fallback;
}

export function buildPrompt({
  tofu_choice,
  oil_choice,
  ingredients,
  cookware,
}) {
  const cookware_phrase = pick(cookware_phrases, cookware, cookware_phrases.wok);
  const tofu_phrase = pick(
    tofu_phrases,
    tofu_choice,
    tofu_phrases["soft-tofu-cubes"]
  );
  const oil_phrase = pick(
    oil_phrases,
    oil_choice,
    oil_phrases["peanut-oil"]
  );

  const garnishList = (ingredients ?? [])
    .map((id) => garnish_phrases[id])
    .filter((phrase) => !!phrase);
  const garnish_phrase = garnishList.length
    ? garnishList.join(", ")
    : "a sprinkle of finely chopped scallion";

  const subject =
    `Mapo tofu in a ${cookware_phrase}, ` +
    `featuring ${tofu_phrase}, ` +
    `simmered in ${oil_phrase} with a richly red Sichuan sauce, ` +
    `garnished with ${garnish_phrase}.`;

  return `${STYLE_ANCHOR}\n\n${COMPOSITION}\n\n${subject}`;
}

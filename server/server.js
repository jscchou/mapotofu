// Local backend for Mapo Tofu, Maybe.
// One endpoint: POST /api/generate-dish
//   body: { tofu_choice?, oil_choice?, ingredients?, cookware? }
//   200:  { image: "data:image/png;base64,..." }
//   500:  { error: "..." }
// Missing body fields are filled with random picks so the client can hit
// this with `{}` for ad-hoc curls; once Scene 4 has collected real player
// choices the client passes them through verbatim.

import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { removeBackground } from "@imgly/background-removal-node";
import { buildPrompt } from "./promptBuilder.js";

const PORT = 3001;
const VITE_ORIGIN = "http://localhost:5173";

// Per spec — exact model string. Update here if the model name changes.
// If you see ~100s+ Gemini latency, the most likely cause is that this exact
// model name doesn't exist on the API and you're hitting a slow fallback.
// The current public image-preview model is "gemini-2.5-flash-image-preview".
// Available image models for this API key (from ListModels):
//   gemini-2.5-flash-image          ← Nano Banana, stable, fast (recommended)
//   gemini-3-pro-image-preview      ← Nano Banana Pro
//   gemini-3.1-flash-image-preview  ← Nano Banana 2 (newer, slower / less reliable)
const MODEL_ID = "gemini-2.5-flash-image";

// Hard timeout on the Gemini call so a stuck request doesn't pin the server.
// The client gives up at 30s, so this fires earlier and lets us return 500
// promptly instead of leaving the request hanging.
const GEMINI_TIMEOUT_MS = 25000;

function withTimeout(promise, ms, label) {
  let cancel;
  const timer = new Promise((_resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    cancel = () => clearTimeout(t);
  });
  return Promise.race([promise, timer]).finally(() => cancel?.());
}

// Sample values for empty-body curls. IDs match the actual game IDs
// (kebab-case, same as /src/data/ingredients.js + /src/data/cookware.js).
const SAMPLE_PARAMS = {
  tofu_choice: [
    "soft-tofu-cubes",
    "crumbled-tofu",
    "hard-tofu-cubes",
    "frozen-tofu",
  ],
  oil_choice: ["peanut-oil", "olive-oil", "corn-oil"],
  ingredients: [
    ["scallion"],
    ["scallion", "ground-beef"],
    ["scallion", "ginger", "chili"],
    ["scallion", "tomato", "red-pepper", "chili"],
    ["scallion", "ground-beef", "ginger", "chili"],
  ],
  cookware: ["wok", "frying-pan", "stock-pot", "grill-pan"],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillRandoms(input) {
  return {
    tofu_choice: input.tofu_choice ?? pickRandom(SAMPLE_PARAMS.tofu_choice),
    oil_choice: input.oil_choice ?? pickRandom(SAMPLE_PARAMS.oil_choice),
    ingredients: input.ingredients ?? pickRandom(SAMPLE_PARAMS.ingredients),
    cookware: input.cookware ?? pickRandom(SAMPLE_PARAMS.cookware),
  };
}

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[server] GEMINI_API_KEY not set. Create a .env file with " +
      "GEMINI_API_KEY=... before starting the server."
  );
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(cors({ origin: VITE_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/generate-dish", async (req, res) => {
  console.log("\n— /api/generate-dish —");
  console.log("incoming body:", req.body ?? null);

  const params = fillRandoms(req.body || {});
  const prompt = buildPrompt(params);

  console.log("params (after random fill-in):", params);
  console.log("prompt:", prompt);

  const tGenStart = Date.now();
  let imagePart;
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: MODEL_ID,
        contents: prompt,
        // Per spec. If the SDK rejects any of these, see the @google/genai docs
        // — config field names occasionally change between SDK versions.
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          aspectRatio: "1:1",
          imageSize: "1K",
        },
      }),
      GEMINI_TIMEOUT_MS,
      "gemini call"
    );
    const tGenMs = Date.now() - tGenStart;
    console.log(`gemini call: ${tGenMs}ms`);

    const candidates = response.candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];
    console.log(
      `gemini response: ${candidates.length} candidate(s), ` +
        `finishReason=${candidates[0]?.finishReason ?? "n/a"}, ` +
        `parts=${parts.length}`
    );

    imagePart = parts.find((p) =>
      p?.inlineData?.mimeType?.startsWith("image/")
    );
    if (!imagePart) {
      console.error(
        "image part: NOT FOUND — got parts:",
        parts.map((p) => Object.keys(p ?? {}))
      );
      return res
        .status(500)
        .json({ error: "Gemini returned no image part" });
    }
    console.log(
      `image part: FOUND (mime=${imagePart.inlineData.mimeType}, ` +
        `base64 length=${imagePart.inlineData.data.length})`
    );
  } catch (e) {
    console.error("gemini error:", e?.message ?? e);
    return res.status(500).json({ error: e?.message ?? "Gemini call failed" });
  }

  const originalBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  const originalBytes = originalBuffer.length;
  const sourceMime = imagePart.inlineData.mimeType || "image/png";
  const magic = originalBuffer.slice(0, 4).toString("hex");
  console.log(
    `gemini returned ${sourceMime} (first4=${magic})`
  );
  console.log(`image size BEFORE bg removal: ${originalBytes} bytes`);

  // Background removal pass. Wrap in a Blob with explicit mime so the
  // library doesn't fall over on format detection (Buffers were tripping
  // it up with "Unsupported format:"). Output is always PNG with alpha.
  let outputBuffer = originalBuffer;
  let outputMime = sourceMime;
  const tBgStart = Date.now();
  try {
    const blob = new Blob([originalBuffer], { type: sourceMime });
    const result = await removeBackground(blob);
    outputBuffer = Buffer.from(await result.arrayBuffer());
    outputMime = "image/png";
    const tBgMs = Date.now() - tBgStart;
    const delta = Math.abs(outputBuffer.length - originalBytes);
    const pct = ((delta / Math.max(1, originalBytes)) * 100).toFixed(1);
    const meaningful = delta > originalBytes * 0.02; // >2% size change
    console.log(`image size AFTER bg removal:  ${outputBuffer.length} bytes`);
    console.log(
      `bg removal: ${tBgMs}ms, ${originalBytes} -> ${outputBuffer.length} bytes ` +
        `(${pct}% change, ${meaningful ? "MODIFIED" : "near-identical"})`
    );
  } catch (e) {
    console.warn(
      "bg removal failed, sending original image:",
      e?.message ?? e
    );
  }

  const dataUrl = `data:${outputMime};base64,${outputBuffer.toString("base64")}`;
  res.json({ image: dataUrl });
});

app.listen(PORT, () => {
  console.log(`Mapo Tofu server listening on http://localhost:${PORT}`);
  console.log(`CORS allowed from ${VITE_ORIGIN}`);
});

// Downscale an image URL to a JPEG thumbnail data URL.
//
// Why this exists: Gemini-generated dish images come back as base64
// data URLs, often 500KB–2MB each. Persisting those raw into
// localStorage hits the ~5MB origin quota after 1–2 dishes and the
// gallery silently stops updating. Storing a 512px JPEG (~30–80KB)
// keeps the persistent gallery well under quota for typical demo use.

const DEFAULT_MAX_EDGE = 512;
const DEFAULT_QUALITY = 0.78;

export function imageUrlToThumbnailDataUrl(
  srcUrl,
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_QUALITY
) {
  return new Promise((resolve, reject) => {
    if (!srcUrl) return reject(new Error("imageUrlToThumbnailDataUrl: empty src"));

    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return reject(new Error("Image has zero dimensions"));

        const ratio = w / h;
        const tw = ratio >= 1 ? maxEdge : Math.round(maxEdge * ratio);
        const th = ratio >= 1 ? Math.round(maxEdge / ratio) : maxEdge;

        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, tw, th);

        // toDataURL throws on a tainted canvas (cross-origin image with
        // no CORS headers). Caller handles by falling back to the
        // original URL.
        const out = canvas.toDataURL("image/jpeg", quality);
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = srcUrl;
  });
}

// Barcode scanning (from a photo) and product lookup in Open Food Facts,
// a free, open food database. No key needed.

let zxingLoading = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingLoading ||= new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
    sc.onload = () => resolve(window.ZXing);
    sc.onerror = () => { zxingLoading = null; reject(new Error("Couldn't load the barcode reader.")); };
    document.head.appendChild(sc);
  });
  return zxingLoading;
}

// Reads the barcode number from a photo. Uses the phone's built-in reader when it has one.
export async function readBarcode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if ("BarcodeDetector" in window) {
      try {
        const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const found = await det.detect(img);
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch { /* fall back below */ }
    }
    const ZXing = await loadZXing();
    const reader = new ZXing.BrowserMultiFormatReader();
    // Try the full photo, then a few rotations/sizes, since phone photos are often big or sideways.
    for (const angle of [0, 90]) {
      for (const max of [1600, 900]) {
        const c = document.createElement("canvas");
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        c.width = angle ? h : w; c.height = angle ? w : h;
        const ctx = c.getContext("2d");
        if (angle) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const res = reader.decodeFromCanvas ? reader.decodeFromCanvas(c) : await reader.decodeFromImageUrl(c.toDataURL());
          if (res?.getText()) return res.getText();
        } catch { /* try next */ }
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

export async function lookupProduct(code) {
  const fields = "product_name,product_name_bg,product_name_en,brands,nutriments,quantity,product_quantity,serving_size,serving_quantity,image_front_small_url";
  let res;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  } catch {
    throw new Error("Couldn't reach the food database. Check your internet.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("The food database had a hiccup. Try again in a minute.");
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product, n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null && num(n["energy_100g"]) != null) kcal = Math.round(num(n["energy_100g"]) / 4.184);
  const per100 = { calories: kcal, protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g) };
  if (per100.calories == null) return { code, name: p.product_name || "", missing: true };
  return {
    code,
    name: p.product_name_bg || p.product_name || p.product_name_en || "Product",
    brand: (p.brands || "").split(",")[0].trim(),
    image: p.image_front_small_url || "",
    packGrams: num(p.product_quantity),
    packText: p.quantity || "",
    servingGrams: num(p.serving_quantity),
    servingText: p.serving_size || "",
    per100,
  };
}

export function forGrams(product, grams) {
  const f = grams / 100, r = (v) => Math.round((v || 0) * f);
  return { calories: r(product.per100.calories), protein: r(product.per100.protein), carbs: r(product.per100.carbs), fat: r(product.per100.fat) };
}

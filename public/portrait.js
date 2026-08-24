// Operator portrait: loads the character art, keys out its flat light-grey background
// in-canvas (no server-side tooling needed), crops to the figure, and mounts a canvas.
// Pure DOM/canvas glue — no game logic.
//
// The background is bright and neutral (R≈G≈B); the character is warm (skin/hair) or dark
// (suit/gear). So we fade out pixels by how "bright AND neutral" they are — robust to the
// vignetting that made a fixed-colour key leave a rim.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function mountOperatorPortrait(container, url) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let data;
    try { data = ctx.getImageData(0, 0, w, h); }
    catch { c.className = "op-portrait-img"; container.replaceChildren(c); return; } // tainted → show as-is

    const p = data.data, n = w * h;
    // Pass 1 — key: fade pixels by how "bright AND neutral" (i.e. background-like) they are.
    const alpha = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const spread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      const lum = r + g + b;
      const neutralF = clamp01((30 - spread) / 18); // 1 when very neutral, 0 by spread≈30
      const brightF = clamp01((lum - 500) / 120);   // 1 when very bright, 0 by lum≈500
      alpha[j] = Math.round(p[i + 3] * (1 - neutralF * brightF));
    }
    // Pass 2 — defringe: erode the matte by 1px (3×3 min) to cut the anti-alias halo where
    // the outline blended with the grey background, otherwise it reads as a dark rim.
    const ER = 1;
    const colHits = new Uint16Array(w), rowHits = new Uint16Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = alpha[y * w + x];
        if (m > 0) {
          for (let dy = -ER; dy <= ER && m > 0; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= h) continue;
            for (let dx = -ER; dx <= ER; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= w) continue;
              const a = alpha[yy * w + xx]; if (a < m) m = a;
            }
          }
        }
        const idx = y * w + x;
        p[(idx << 2) + 3] = m;
        if (m > 40) { colHits[x]++; rowHits[y]++; }
      }
    }
    ctx.putImageData(data, 0, 0);

    // Robust bbox: a column/row counts as "figure" only if it has a real run of opaque pixels,
    // so sparse keying speckle can't blow the crop out to the full frame.
    const colMin = Math.max(3, (h * 0.02) | 0), rowMin = Math.max(3, (w * 0.02) | 0);
    let minX = 0, maxX = w - 1, minY = 0, maxY = h - 1;
    while (minX < maxX && colHits[minX] < colMin) minX++;
    while (maxX > minX && colHits[maxX] < colMin) maxX--;
    while (minY < maxY && rowHits[minY] < rowMin) minY++;
    while (maxY > minY && rowHits[maxY] < rowMin) maxY--;
    const pad = 4;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);

    const cw = Math.max(1, maxX - minX + 1), ch = Math.max(1, maxY - minY + 1);
    const out = document.createElement("canvas"); out.width = cw; out.height = ch;
    out.getContext("2d").drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
    out.className = "op-portrait-img";
    container.replaceChildren(out);
  };
  img.onerror = () => {};
  img.src = url;
}

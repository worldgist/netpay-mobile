#!/usr/bin/env node
/**
 * Generate a bold monochrome Android status-bar / push notification icon
 * from logo.png (white silhouette on transparent background).
 *
 * Run: npm run generate:notification-icon
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const src = path.join(projectRoot, 'assets', 'images', 'logo.png');
const out = path.join(projectRoot, 'assets', 'images', 'notification-icon.png');

/** Expand opaque pixels so thin logo strokes read bold at status-bar size. */
function dilateMask(alpha, width, height, radius) {
  const next = Buffer.alloc(alpha.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxA = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          maxA = Math.max(maxA, alpha[ny * width + nx]);
        }
      }
      next[y * width + x] = maxA;
    }
  }
  return next;
}

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Install sharp: npm install sharp --save-dev');
    process.exit(1);
  }

  if (!fs.existsSync(src)) {
    console.error('Missing source:', src);
    process.exit(1);
  }

  // Fill most of a fixed 96×96 canvas so the mark reads larger in the tray.
  const size = 96;
  const { data, info } = await sharp(src)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixelCount = info.width * info.height;
  const mask = Buffer.alloc(pixelCount);

  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Keep colored logo ink; drop near-white / empty background.
    const isBackground = a < 20 || (r > 245 && g > 245 && b > 245);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    // Orange logo is mid-luminance; solidify ink pixels aggressively.
    mask[p] = isBackground ? 0 : a > 40 && luminance < 250 ? 255 : 0;
  }

  // Two dilate passes → thicker "N" waves and NETPAY wordmark at small sizes.
  const boldMask = dilateMask(dilateMask(mask, info.width, info.height, 1), info.width, info.height, 1);

  const outData = Buffer.alloc(data.length);
  for (let p = 0, i = 0; p < pixelCount; p++, i += channels) {
    outData[i] = 255;
    outData[i + 1] = 255;
    outData[i + 2] = 255;
    outData[i + 3] = boldMask[p];
  }

  await sharp(outData, {
    raw: {
      width: info.width,
      height: info.height,
      channels,
    },
  })
    .png()
    .toFile(out);

  const meta = await sharp(out).metadata();
  console.log('Wrote bold notification icon', path.relative(projectRoot, out), `(${meta.width}x${meta.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

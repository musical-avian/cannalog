// SPDX-License-Identifier: AGPL-3.0-only
// Makes the PNG app icons from icon.svg (Android needs PNGs to install the PWA).
// Run: make icons   (needs Playwright installed globally; Chromium renders the SVG)

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // found via NODE_PATH, see Makefile

const ROOT = new URL("../", import.meta.url);
const source = readFileSync(new URL("icon.svg", ROOT), "utf8");
const inner = source.replace(/^[\s\S]*?<rect[^>]*rx="112"[^>]*\/>/, "").replace(/<\/svg>\s*$/, "");

// Full-bleed square with the artwork scaled to `scale` around the center.
// Maskable icons get cropped by Android to any shape; the safe zone is the inner 80%.
function squareIcon(scale) {
  const offset = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#2f9e44"/><g transform="translate(${offset} ${offset}) scale(${scale})">${inner}</g></svg>`;
}

const MASKABLE_SAFE_ZONE = 0.8;
const outputs = [
  { file: "icons/icon-192.png", size: 192, svg: source },
  { file: "icons/icon-512.png", size: 512, svg: source },
  { file: "icons/maskable-512.png", size: 512, svg: squareIcon(MASKABLE_SAFE_ZONE) },
  { file: "icons/apple-touch-icon.png", size: 180, svg: squareIcon(1) }, // iOS rounds the corners itself
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setContent(
    `<body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body>`,
  );
  await page.screenshot({ path: new URL(file, ROOT).pathname, omitBackground: true });
  console.log("wrote", file);
}
await browser.close();

/**
 * Arbitrary Text Palette Parser & Exporter
 * Handles HEX codes (#RRGGBB, #RGB, RRGGBB), rgb(r, g, b), comma/space separated lists
 */

import { hexToRgb, rgbToHex } from '../core/color.js';

export function parseTextPal(text) {
  const colors = [];
  const seenHex = new Set();

  function addColor(r, g, b) {
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    const hex = rgbToHex(r, g, b);
    if (!seenHex.has(hex)) {
      seenHex.add(hex);
      colors.push({ r, g, b, hex, enabled: true });
    }
  }

  // 1. Try matching rgb(r, g, b)
  const rgbRegex = /rgb\s*\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)/gi;
  let remainingText = text.replace(rgbRegex, (m, r, g, b) => {
    addColor(parseInt(r, 10), parseInt(g, 10), parseInt(b, 10));
    return ' ';
  });

  // 2. Match Hex colors with prefix (#RRGGBB, #RGB, 0xRRGGBB)
  const prefixedHexRegex = /(?:#|0x)([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  remainingText = remainingText.replace(prefixedHexRegex, (m, hexCode) => {
    const rgb = hexToRgb(hexCode);
    if (rgb) {
      addColor(rgb.r, rgb.g, rgb.b);
    }
    return ' ';
  });

  // 3. Match plain numeric triplets like "255, 128, 64" or "255 128 64"
  const tripletRegex = /\b(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\b/g;
  remainingText = remainingText.replace(tripletRegex, (m, r, g, b) => {
    const rNum = parseInt(r, 10);
    const gNum = parseInt(g, 10);
    const bNum = parseInt(b, 10);
    if (rNum <= 255 && gNum <= 255 && bNum <= 255) {
      addColor(rNum, gNum, bNum);
      return ' ';
    }
    return m;
  });

  // 4. Match bare 6-character hex (e.g. ffffff or e4e4e4) without '#'
  const bareHexRegex = /\b([0-9a-fA-F]{6})\b/g;
  remainingText.replace(bareHexRegex, (m, hexCode) => {
    const rgb = hexToRgb(hexCode);
    if (rgb) {
      addColor(rgb.r, rgb.g, rgb.b);
    }
    return ' ';
  });

  return {
    name: 'Custom Palette',
    colors
  };
}

export function exportText(palette) {
  const activeColors = palette.filter(c => c.enabled !== false);
  return activeColors.map(c => c.hex).join('\n');
}

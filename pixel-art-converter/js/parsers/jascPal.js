/**
 * JASC-PAL (.pal) Parser and Exporter
 */

import { rgbToHex } from '../core/color.js';

export function parseJascPal(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 3) return { name: 'JASC Palette', colors: [] };

  // Line 0: JASC-PAL
  // Line 1: 0100
  // Line 2: color count
  if (lines[0].toUpperCase() !== 'JASC-PAL') {
    return { name: 'JASC Palette', colors: [] };
  }

  const count = parseInt(lines[2], 10);
  const colors = [];

  for (let i = 3; i < lines.length && colors.length < count; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10);
      const g = parseInt(parts[1], 10);
      const b = parseInt(parts[2], 10);

      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        colors.push({
          r: Math.max(0, Math.min(255, r)),
          g: Math.max(0, Math.min(255, g)),
          b: Math.max(0, Math.min(255, b)),
          hex: rgbToHex(r, g, b),
          enabled: true
        });
      }
    }
  }

  return { name: 'JASC Palette', colors };
}

export function exportJascPal(palette) {
  const activeColors = palette.filter(c => c.enabled !== false);
  let output = `JASC-PAL\n0100\n${activeColors.length}\n`;

  for (const c of activeColors) {
    output += `${c.r} ${c.g} ${c.b}\n`;
  }

  return output;
}

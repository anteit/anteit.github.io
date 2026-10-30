/**
 * GIMP Palette (.gpl) Parser and Exporter
 */

import { rgbToHex } from '../core/color.js';

export function parseGpl(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { name: 'Palette', colors: [] };

  let name = 'GIMP Palette';
  const colors = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Check header / metadata
    if (rawLine.startsWith('#Palette Name:')) {
      name = rawLine.replace('#Palette Name:', '').trim();
      continue;
    }
    if (rawLine.startsWith('#') || rawLine.startsWith('GIMP Palette') || rawLine.startsWith('Channels:')) {
      continue;
    }

    // Match RGB color line: R G B [Name/comment]
    // Example: "255 255 255  #ffffff" or "255 255 255 White"
    const match = rawLine.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);

      if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
        colors.push({
          r,
          g,
          b,
          hex: rgbToHex(r, g, b),
          enabled: true
        });
      }
    }
  }

  return { name, colors };
}

export function exportGpl(palette, name = 'Custom Palette') {
  const activeColors = palette.filter(c => c.enabled !== false);
  let output = `GIMP Palette\n#Palette Name: ${name}\n#Description: Exported from Pixel Art Converter\n#Colors: ${activeColors.length}\n`;

  for (const c of activeColors) {
    const r = String(c.r).padStart(3, ' ');
    const g = String(c.g).padStart(3, ' ');
    const b = String(c.b).padStart(3, ' ');
    output += `${r} ${g} ${b}\t${c.hex}\n`;
  }

  return output;
}

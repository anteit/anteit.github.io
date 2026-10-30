/**
 * Color Space Transformations & Utilities
 * Supports sRGB, Linear RGB, CIE XYZ (D65), CIELAB, and Oklab
 */

// Lookup tables for sRGB <-> Linear RGB conversion for high performance
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255.0;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convert sRGB [0..255] byte to Linear float [0..1]
 */
export function srgbToLinear(c) {
  return SRGB_TO_LINEAR[c & 0xff];
}

/**
 * Convert Linear float [0..1] to sRGB [0..255] byte
 */
export function linearToSrgb(c) {
  const clamped = c < 0 ? 0 : c > 1 ? 1 : c;
  const s = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055;
  const val = Math.round(s * 255.0);
  return val < 0 ? 0 : val > 255 ? 255 : val;
}

/**
 * Convert sRGB (0-255) to CIELAB { L, a, b }
 * Using D65 reference white (Xn=0.95047, Yn=1.00000, Zn=1.08883)
 */
export function srgbToLab(r, g, b) {
  const lr = SRGB_TO_LINEAR[r];
  const lg = SRGB_TO_LINEAR[g];
  const lb = SRGB_TO_LINEAR[b];

  // Observer: 2°, Illuminant: D65
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / 1.00000;
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883;

  const fx = x > 0.008856451679 ? Math.cbrt(x) : (7.787037037 * x + 16.0 / 116.0);
  const fy = y > 0.008856451679 ? Math.cbrt(y) : (7.787037037 * y + 16.0 / 116.0);
  const fz = z > 0.008856451679 ? Math.cbrt(z) : (7.787037037 * z + 16.0 / 116.0);

  const L = (116.0 * fy) - 16.0;
  const a = 500.0 * (fx - fy);
  const bVal = 200.0 * (fy - fz);

  return { L, a, b: bVal };
}

/**
 * Convert sRGB (0-255) to Oklab { L, a, b }
 * Developed by Björn Ottosson (2020)
 */
export function srgbToOklab(r, g, b) {
  const lr = SRGB_TO_LINEAR[r];
  const lg = SRGB_TO_LINEAR[g];
  const lb = SRGB_TO_LINEAR[b];

  // Linear RGB to LMS
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  return { L, a, b: bVal };
}

/**
 * Parse Hex color string to { r, g, b }
 */
export function hexToRgb(hex) {
  let clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }
  return null;
}

/**
 * Convert RGB (0-255) to Hex string #RRGGBB
 */
export function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

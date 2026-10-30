/**
 * Color Quantization & Color Distance Metrics
 * CIEDE2000, CIE76 (Delta E), Oklab, and Euclidean RGB
 */

import { srgbToLab, srgbToOklab } from './color.js';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

/**
 * CIEDE2000 color difference formula (Sharma et al. 2005)
 */
export function deltaE2000(lab1, lab2) {
  const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

  const avgL = (L1 + L2) * 0.5;

  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (c1 + c2) * 0.5;

  const avgC7 = Math.pow(avgC, 7);
  const g = 0.5 * (1.0 - Math.sqrt(avgC7 / (avgC7 + 6103515625))); // 25^7 = 6103515625

  const a1p = (1.0 + g) * a1;
  const a2p = (1.0 + g) * a2;

  const c1p = Math.sqrt(a1p * a1p + b1 * b1);
  const c2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (c1p + c2p) * 0.5;

  let h1p = Math.atan2(b1, a1p) * RAD2DEG;
  if (h1p < 0) h1p += 360.0;
  let h2p = Math.atan2(b2, a2p) * RAD2DEG;
  if (h2p < 0) h2p += 360.0;

  let deltahp = 0;
  if (c1p !== 0 && c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180.0) {
      deltahp = diff;
    } else if (diff > 180.0) {
      deltahp = diff - 360.0;
    } else {
      deltahp = diff + 360.0;
    }
  }

  const deltaLp = L2 - L1;
  const deltaCp = c2p - c1p;
  const deltaHp = 2.0 * Math.sqrt(c1p * c2p) * Math.sin(deltahp * 0.5 * DEG2RAD);

  let avghp = 0;
  if (c1p === 0 || c2p === 0) {
    avghp = h1p + h2p;
  } else {
    const diff = Math.abs(h1p - h2p);
    if (diff <= 180.0) {
      avghp = (h1p + h2p) * 0.5;
    } else if (h1p + h2p < 360.0) {
      avghp = (h1p + h2p + 360.0) * 0.5;
    } else {
      avghp = (h1p + h2p - 360.0) * 0.5;
    }
  }

  const T = 1.0 -
    0.17 * Math.cos((avghp - 30.0) * DEG2RAD) +
    0.24 * Math.cos(2.0 * avghp * DEG2RAD) +
    0.32 * Math.cos((3.0 * avghp + 6.0) * DEG2RAD) -
    0.20 * Math.cos((4.0 * avghp - 63.0) * DEG2RAD);

  const deltaTheta = 30.0 * Math.exp(-Math.pow((avghp - 275.0) / 25.0, 2));
  const avgCp7 = Math.pow(avgCp, 7);
  const RC = 2.0 * Math.sqrt(avgCp7 / (avgCp7 + 6103515625));

  const LMean50Sq = Math.pow(avgL - 50.0, 2);
  const SL = 1.0 + (0.015 * LMean50Sq) / Math.sqrt(20.0 + LMean50Sq);
  const SC = 1.0 + 0.045 * avgCp;
  const SH = 1.0 + 0.015 * avgCp * T;
  const RT = -Math.sin(2.0 * deltaTheta * DEG2RAD) * RC;

  const dL = deltaLp / SL;
  const dC = deltaCp / SC;
  const dH = deltaHp / SH;

  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

/**
 * CIE76 Delta E (Euclidean distance in CIELAB)
 */
export function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Oklab Euclidean distance
 */
export function deltaEOklab(ok1, ok2) {
  const dL = ok1.L - ok2.L;
  const da = ok1.a - ok2.a;
  const db = ok1.b - ok2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Euclidean RGB distance
 */
export function deltaERgb(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Prepares palette colors by precomputing Lab and Oklab values
 */
export function preparePalette(palette) {
  return palette.map((col, index) => {
    const lab = srgbToLab(col.r, col.g, col.b);
    const oklab = srgbToOklab(col.r, col.g, col.b);
    return {
      index,
      r: col.r,
      g: col.g,
      b: col.b,
      hex: col.hex,
      lab,
      oklab
    };
  });
}

/**
 * Finds the closest palette color index for a given RGB color
 */
export function findNearestColor(r, g, b, preparedPalette, metric = 'ciede2000') {
  if (preparedPalette.length === 0) {
    return { index: 0, r, g, b };
  }

  let bestIndex = 0;
  let minDistance = Infinity;

  if (metric === 'ciede2000') {
    const lab = srgbToLab(r, g, b);
    for (let i = 0; i < preparedPalette.length; i++) {
      const dist = deltaE2000(lab, preparedPalette[i].lab);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i;
        if (dist === 0) break;
      }
    }
  } else if (metric === 'cie76') {
    const lab = srgbToLab(r, g, b);
    for (let i = 0; i < preparedPalette.length; i++) {
      const dist = deltaE76(lab, preparedPalette[i].lab);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i;
        if (dist === 0) break;
      }
    }
  } else if (metric === 'oklab') {
    const ok = srgbToOklab(r, g, b);
    for (let i = 0; i < preparedPalette.length; i++) {
      const dist = deltaEOklab(ok, preparedPalette[i].oklab);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i;
        if (dist === 0) break;
      }
    }
  } else {
    // euclidean
    for (let i = 0; i < preparedPalette.length; i++) {
      const p = preparedPalette[i];
      const dist = deltaERgb(r, g, b, p.r, p.g, p.b);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i;
        if (dist === 0) break;
      }
    }
  }

  return preparedPalette[bestIndex];
}

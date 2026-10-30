/**
 * Dithering Algorithms with Strict Binary Transparency Isolation
 * Methods: Floyd-Steinberg, Atkinson, Bayer 4x4, Bayer 8x8, None (Nearest Color)
 */

import { findNearestColor } from './quantizer.js';

// Bayer 4x4 Matrix (normalized to [-0.5, 0.5])
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
].map(row => row.map(v => (v / 16.0) - 0.5));

// Bayer 8x8 Matrix (normalized to [-0.5, 0.5])
const BAYER_8X8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
].map(row => row.map(v => (v / 64.0) - 0.5));

/**
 * Apply Quantization & Dithering to resampled image buffer
 *
 * @param {Uint8ClampedArray} inputData - Resampled RGBA pixels
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @param {Array} preparedPalette - Preprocessed palette
 * @param {Object} options - { method, strength, metric, onProgress }
 * @returns {Uint8ClampedArray}
 */
export function applyDithering(inputData, width, height, preparedPalette, options = {}) {
  const {
    method = 'floyd-steinberg',
    strength = 80, // 0 to 100
    metric = 'ciede2000',
    onProgress = null
  } = options;

  const totalPixels = width * height;
  const outputData = new Uint8ClampedArray(inputData.length);

  // If no palette colors, return empty
  if (!preparedPalette || preparedPalette.length === 0) {
    return outputData;
  }

  const factor = Math.max(0, Math.min(100, strength)) / 100.0;

  // Direct mapping (Nearest Color) or if strength is 0
  if (method === 'none' || factor === 0) {
    // RGB Cache for faster quantization lookup
    const cache = new Map();

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const alpha = inputData[idx + 3];

      if (alpha === 0) {
        outputData[idx] = 0;
        outputData[idx + 1] = 0;
        outputData[idx + 2] = 0;
        outputData[idx + 3] = 0;
        continue;
      }

      const r = inputData[idx];
      const g = inputData[idx + 1];
      const b = inputData[idx + 2];
      const rgbKey = (r << 16) | (g << 8) | b;

      let matched = cache.get(rgbKey);
      if (!matched) {
        matched = findNearestColor(r, g, b, preparedPalette, metric);
        cache.set(rgbKey, matched);
      }

      outputData[idx] = matched.r;
      outputData[idx + 1] = matched.g;
      outputData[idx + 2] = matched.b;
      outputData[idx + 3] = 255;

      if (onProgress && (i & 1023) === 0) {
        onProgress(i / totalPixels);
      }
    }

    if (onProgress) onProgress(1.0);
    return outputData;
  }

  // Ordered Dithering: Bayer 4x4 or Bayer 8x8
  if (method === 'bayer4' || method === 'bayer8') {
    const matrix = method === 'bayer4' ? BAYER_4X4 : BAYER_8X8;
    const mSize = matrix.length;
    // Spread scaling factor: typical color step in RGB palette range
    const spread = 48.0 * factor;
    const cache = new Map();

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        const alpha = inputData[idx + 3];

        if (alpha === 0) {
          outputData[idx] = 0;
          outputData[idx + 1] = 0;
          outputData[idx + 2] = 0;
          outputData[idx + 3] = 0;
          continue;
        }

        const bayerOffset = matrix[y % mSize][x % mSize] * spread;
        const r = Math.max(0, Math.min(255, Math.round(inputData[idx] + bayerOffset)));
        const g = Math.max(0, Math.min(255, Math.round(inputData[idx + 1] + bayerOffset)));
        const b = Math.max(0, Math.min(255, Math.round(inputData[idx + 2] + bayerOffset)));

        const rgbKey = (r << 16) | (g << 8) | b;
        let matched = cache.get(rgbKey);
        if (!matched) {
          matched = findNearestColor(r, g, b, preparedPalette, metric);
          cache.set(rgbKey, matched);
        }

        outputData[idx] = matched.r;
        outputData[idx + 1] = matched.g;
        outputData[idx + 2] = matched.b;
        outputData[idx + 3] = 255;
      }

      if (onProgress && (y & 15) === 0) {
        onProgress(y / height);
      }
    }

    if (onProgress) onProgress(1.0);
    return outputData;
  }

  // Error Diffusion Dithering: Floyd-Steinberg or Atkinson
  // Working float buffer for RGB error accumulation
  const rBuf = new Float32Array(totalPixels);
  const gBuf = new Float32Array(totalPixels);
  const bBuf = new Float32Array(totalPixels);

  // Copy initial RGB values
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    rBuf[i] = inputData[idx];
    gBuf[i] = inputData[idx + 1];
    bBuf[i] = inputData[idx + 2];
  }

  // Diffusion kernels
  // Floyd-Steinberg (div 16): (x+1, y): 7/16, (x-1, y+1): 3/16, (x, y+1): 5/16, (x+1, y+1): 1/16
  // Atkinson (div 8): (x+1, y): 1/8, (x+2, y): 1/8, (x-1, y+1): 1/8, (x, y+1): 1/8, (x+1, y+1): 1/8, (x, y+2): 1/8
  const isAtkinson = method === 'atkinson';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIndex = y * width + x;
      const idx = pIndex * 4;
      const alpha = inputData[idx + 3];

      // Strict binary alpha isolation: transparent pixels do not diffuse error and receive no error
      if (alpha === 0) {
        outputData[idx] = 0;
        outputData[idx + 1] = 0;
        outputData[idx + 2] = 0;
        outputData[idx + 3] = 0;
        continue;
      }

      const curR = Math.max(0, Math.min(255, Math.round(rBuf[pIndex])));
      const curG = Math.max(0, Math.min(255, Math.round(gBuf[pIndex])));
      const curB = Math.max(0, Math.min(255, Math.round(bBuf[pIndex])));

      const matched = findNearestColor(curR, curG, curB, preparedPalette, metric);

      outputData[idx] = matched.r;
      outputData[idx + 1] = matched.g;
      outputData[idx + 2] = matched.b;
      outputData[idx + 3] = 255;

      // Error scaled by dithering strength
      const errR = (curR - matched.r) * factor;
      const errG = (curG - matched.g) * factor;
      const errB = (curB - matched.b) * factor;

      // Diffuse to neighbors ONLY IF neighbor is opaque (alpha !== 0)
      const diffuse = (dx, dy, weight) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIndex = ny * width + nx;
          // Check neighbor opacity
          if (inputData[nIndex * 4 + 3] !== 0) {
            rBuf[nIndex] += errR * weight;
            gBuf[nIndex] += errG * weight;
            bBuf[nIndex] += errB * weight;
          }
        }
      };

      if (isAtkinson) {
        // Atkinson diffusion (each gets 1/8)
        const w = 1.0 / 8.0;
        diffuse(1, 0, w);
        diffuse(2, 0, w);
        diffuse(-1, 1, w);
        diffuse(0, 1, w);
        diffuse(1, 1, w);
        diffuse(0, 2, w);
      } else {
        // Floyd-Steinberg diffusion
        diffuse(1, 0, 7.0 / 16.0);
        diffuse(-1, 1, 3.0 / 16.0);
        diffuse(0, 1, 5.0 / 16.0);
        diffuse(1, 1, 1.0 / 16.0);
      }
    }

    if (onProgress && (y & 15) === 0) {
      onProgress(y / height);
    }
  }

  if (onProgress) onProgress(1.0);
  return outputData;
}

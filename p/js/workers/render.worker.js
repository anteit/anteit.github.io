/**
 * Dedicated Web Worker for Computational Pipeline
 * Resampling, CIEDE2000 Quantization, and Dithering
 */

import { resampleImage } from '../core/resizer.js';
import { preparePalette } from '../core/quantizer.js';
import { applyDithering } from '../core/dither.js';

self.onmessage = function (e) {
  const { id, srcData, srcW, srcH, dstW, dstH, options } = e.data;

  try {
    const startTime = performance.now();

    // 1. Prepare active palette
    const activePalette = options.palette.filter(c => c.enabled !== false);
    const preparedPalette = preparePalette(activePalette);

    self.postMessage({ type: 'progress', id, progress: 0.1 });

    // 2. Resample image with linear gamma & premultiplied alpha
    const resampledData = resampleImage(srcData, srcW, srcH, dstW, dstH, {
      method: options.downsampleMethod,
      gammaCorrection: options.gammaCorrection,
      alphaThreshold: options.alphaThreshold
    });

    self.postMessage({ type: 'progress', id, progress: 0.3 });

    // 3. Apply quantization & dithering
    const ditheredData = applyDithering(resampledData, dstW, dstH, preparedPalette, {
      method: options.ditherMethod,
      strength: options.ditherStrength,
      metric: options.colorDistanceMetric,
      onProgress: (p) => {
        // Map progress from 0.3 to 0.95
        self.postMessage({ type: 'progress', id, progress: 0.3 + p * 0.65 });
      }
    });

    const elapsed = Math.round(performance.now() - startTime);

    // Return rendered result transferring buffer
    self.postMessage(
      {
        type: 'done',
        id,
        width: dstW,
        height: dstH,
        data: ditheredData,
        elapsed
      },
      [ditheredData.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      id,
      error: err.message || String(err)
    });
  }
};

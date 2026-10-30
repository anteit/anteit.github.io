/**
 * High-Precision Image Resampling with Premultiplied Alpha & Linear Gamma Correction
 * Algorithms: Lanczos-3, Lanczos-2, Bicubic (Catmull-Rom), Bilinear, Box / Area Averaging, Nearest Neighbor
 */

import { srgbToLinear, linearToSrgb } from './color.js';

// Lanczos kernel
function lanczosKernel(x, a) {
  if (x === 0) return 1.0;
  const absX = Math.abs(x);
  if (absX >= a) return 0.0;
  const pix = Math.PI * absX;
  return (a * Math.sin(pix) * Math.sin(pix / a)) / (pix * pix);
}

// Bicubic Catmull-Rom (B=0, C=0.5) or Mitchell-Netravali (B=1/3, C=1/3)
function bicubicKernel(x, B = 0.0, C = 0.5) {
  const absX = Math.abs(x);
  if (absX < 1.0) {
    return (
      ((12.0 - 9.0 * B - 6.0 * C) * absX * absX * absX +
        (-18.0 + 12.0 * B + 6.0 * C) * absX * absX +
        (6.0 - 2.0 * B)) /
      6.0
    );
  }
  if (absX < 2.0) {
    return (
      ((-B - 6.0 * C) * absX * absX * absX +
        (6.0 * B + 30.0 * C) * absX * absX +
        (-12.0 * B - 48.0 * C) * absX +
        (8.0 * B + 24.0 * C)) /
      6.0
    );
  }
  return 0.0;
}

// Bilinear kernel
function bilinearKernel(x) {
  const absX = Math.abs(x);
  return absX < 1.0 ? 1.0 - absX : 0.0;
}

/**
 * Precomputes 1D filter weights for 2-pass separable resampling
 */
function precomputeWeights(srcLength, dstLength, kernelFn, filterRadius) {
  const scale = dstLength / srcLength;
  const isDownscaling = scale < 1.0;
  // Anti-aliasing radius expansion during downsampling
  const radius = isDownscaling ? filterRadius / scale : filterRadius;
  const kernelScale = isDownscaling ? scale : 1.0;

  const weightsTable = new Array(dstLength);

  for (let dst = 0; dst < dstLength; dst++) {
    // Map dst pixel center to src coordinate
    const center = (dst + 0.5) / scale - 0.5;
    const left = Math.max(0, Math.floor(center - radius));
    const right = Math.min(srcLength - 1, Math.ceil(center + radius));

    let sum = 0.0;
    const entries = [];

    for (let src = left; src <= right; src++) {
      const dist = (src - center) * kernelScale;
      const weight = kernelFn(dist);
      if (Math.abs(weight) > 1e-6) {
        entries.push({ src, weight });
        sum += weight;
      }
    }

    // Normalize weights
    if (sum !== 0.0) {
      const invSum = 1.0 / sum;
      for (let i = 0; i < entries.length; i++) {
        entries[i].weight *= invSum;
      }
    }

    weightsTable[dst] = entries;
  }

  return weightsTable;
}

/**
 * Nearest Neighbor Resampling
 */
function resampleNearest(srcData, srcW, srcH, dstW, dstH, alphaThreshold) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(Math.floor((y + 0.5) * scaleY), srcH - 1);
    const rowOffset = y * dstW * 4;
    const srcRowOffset = srcY * srcW * 4;

    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(Math.floor((x + 0.5) * scaleX), srcW - 1);
      const si = srcRowOffset + srcX * 4;
      const di = rowOffset + x * 4;

      const a = srcData[si + 3];
      if (a < alphaThreshold) {
        dst[di] = 0;
        dst[di + 1] = 0;
        dst[di + 2] = 0;
        dst[di + 3] = 0;
      } else {
        dst[di] = srcData[si];
        dst[di + 1] = srcData[si + 1];
        dst[di + 2] = srcData[si + 2];
        dst[di + 3] = 255;
      }
    }
  }

  return dst;
}

/**
 * Box / Area-Averaging Resampling
 */
function resampleBox(srcData, srcW, srcH, dstW, dstH, gammaCorrection, alphaThreshold) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const top = y * scaleY;
    const bottom = (y + 1) * scaleY;
    const y0 = Math.floor(top);
    const y1 = Math.min(Math.ceil(bottom), srcH);

    for (let x = 0; x < dstW; x++) {
      const left = x * scaleX;
      const right = (x + 1) * scaleX;
      const x0 = Math.floor(left);
      const x1 = Math.min(Math.ceil(right), srcW);

      let totalWeight = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let sy = y0; sy < y1; sy++) {
        const hWeight = Math.min(bottom, sy + 1) - Math.max(top, sy);
        if (hWeight <= 0) continue;

        const rowOffset = sy * srcW * 4;

        for (let sx = x0; sx < x1; sx++) {
          const wWeight = Math.min(right, sx + 1) - Math.max(left, sx);
          if (wWeight <= 0) continue;

          const weight = hWeight * wWeight;
          const si = rowOffset + sx * 4;

          const aNorm = srcData[si + 3] / 255.0;
          totalWeight += weight;
          accA += aNorm * weight;

          if (gammaCorrection) {
            const rLin = srgbToLinear(srcData[si]);
            const gLin = srgbToLinear(srcData[si + 1]);
            const bLin = srgbToLinear(srcData[si + 2]);
            // Premultiplied alpha
            accR += rLin * aNorm * weight;
            accG += gLin * aNorm * weight;
            accB += bLin * aNorm * weight;
          } else {
            accR += (srcData[si] / 255.0) * aNorm * weight;
            accG += (srcData[si + 1] / 255.0) * aNorm * weight;
            accB += (srcData[si + 2] / 255.0) * aNorm * weight;
          }
        }
      }

      const di = (y * dstW + x) * 4;
      const finalAlpha = totalWeight > 0 ? accA / totalWeight : 0;
      const alphaByte = Math.round(finalAlpha * 255.0);

      if (alphaByte < alphaThreshold || finalAlpha <= 1e-5) {
        dst[di] = 0;
        dst[di + 1] = 0;
        dst[di + 2] = 0;
        dst[di + 3] = 0;
      } else {
        // Un-premultiply
        const invA = 1.0 / accA;
        if (gammaCorrection) {
          dst[di] = linearToSrgb(accR * invA);
          dst[di + 1] = linearToSrgb(accG * invA);
          dst[di + 2] = linearToSrgb(accB * invA);
        } else {
          dst[di] = Math.round(Math.max(0, Math.min(255, (accR * invA) * 255.0)));
          dst[di + 1] = Math.round(Math.max(0, Math.min(255, (accG * invA) * 255.0)));
          dst[di + 2] = Math.round(Math.max(0, Math.min(255, (accB * invA) * 255.0)));
        }
        dst[di + 3] = 255; // 1-bit binary alpha
      }
    }
  }

  return dst;
}

/**
 * 2-Pass Separable Convolution Resampling (Lanczos, Bicubic, Bilinear)
 */
function resampleSeparable(srcData, srcW, srcH, dstW, dstH, kernelFn, filterRadius, gammaCorrection, alphaThreshold) {
  // Precompute filter weights
  const weightsX = precomputeWeights(srcW, dstW, kernelFn, filterRadius);
  const weightsY = precomputeWeights(srcH, dstH, kernelFn, filterRadius);

  // Horizontal Pass: srcW x srcH -> dstW x srcH
  // Intermediate buffer holds 4 float channels (Premultiplied R, G, B, Alpha)
  const intermediate = new Float32Array(dstW * srcH * 4);

  for (let y = 0; y < srcH; y++) {
    const srcRow = y * srcW * 4;
    const interRow = y * dstW * 4;

    for (let x = 0; x < dstW; x++) {
      const entries = weightsX[x];
      let accR = 0.0, accG = 0.0, accB = 0.0, accA = 0.0;

      for (let i = 0; i < entries.length; i++) {
        const { src: sx, weight } = entries[i];
        const si = srcRow + sx * 4;
        const aNorm = srcData[si + 3] / 255.0;

        accA += aNorm * weight;

        if (gammaCorrection) {
          accR += srgbToLinear(srcData[si]) * aNorm * weight;
          accG += srgbToLinear(srcData[si + 1]) * aNorm * weight;
          accB += srgbToLinear(srcData[si + 2]) * aNorm * weight;
        } else {
          accR += (srcData[si] / 255.0) * aNorm * weight;
          accG += (srcData[si + 1] / 255.0) * aNorm * weight;
          accB += (srcData[si + 2] / 255.0) * aNorm * weight;
        }
      }

      const ii = interRow + x * 4;
      intermediate[ii] = accR;
      intermediate[ii + 1] = accG;
      intermediate[ii + 2] = accB;
      intermediate[ii + 3] = accA;
    }
  }

  // Vertical Pass: dstW x srcH -> dstW x dstH
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    const entries = weightsY[y];
    const dstRow = y * dstW * 4;

    for (let x = 0; x < dstW; x++) {
      let accR = 0.0, accG = 0.0, accB = 0.0, accA = 0.0;

      for (let i = 0; i < entries.length; i++) {
        const { src: sy, weight } = entries[i];
        const ii = (sy * dstW + x) * 4;

        accR += intermediate[ii] * weight;
        accG += intermediate[ii + 1] * weight;
        accB += intermediate[ii + 2] * weight;
        accA += intermediate[ii + 3] * weight;
      }

      const di = dstRow + x * 4;
      const alphaByte = Math.round(accA * 255.0);

      if (alphaByte < alphaThreshold || accA <= 1e-5) {
        dst[di] = 0;
        dst[di + 1] = 0;
        dst[di + 2] = 0;
        dst[di + 3] = 0;
      } else {
        // Un-premultiply
        const invA = 1.0 / accA;
        if (gammaCorrection) {
          dst[di] = linearToSrgb(accR * invA);
          dst[di + 1] = linearToSrgb(accG * invA);
          dst[di + 2] = linearToSrgb(accB * invA);
        } else {
          dst[di] = Math.round(Math.max(0, Math.min(255, (accR * invA) * 255.0)));
          dst[di + 1] = Math.round(Math.max(0, Math.min(255, (accG * invA) * 255.0)));
          dst[di + 2] = Math.round(Math.max(0, Math.min(255, (accB * invA) * 255.0)));
        }
        dst[di + 3] = 255; // 1-bit binary alpha
      }
    }
  }

  return dst;
}

/**
 * Calculate the bounding box of non-transparent pixels (Alpha >= threshold)
 */
export function getOpaqueBoundingBox(imageData, alphaThreshold = 1) {
  const { width, height, data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = data[rowOffset + x * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If entire image is transparent
  if (maxX < minX || maxY < minY) {
    return {
      minX: 0,
      minY: 0,
      maxX: width - 1,
      maxY: height - 1,
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      hasTransparentBorders: false,
      isEmpty: true
    };
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const hasTransparentBorders = (minX > 0 || minY > 0 || maxX < width - 1 || maxY < height - 1);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: cropWidth,
    height: cropHeight,
    originalWidth: width,
    originalHeight: height,
    hasTransparentBorders,
    isEmpty: false
  };
}

/**
 * Crop ImageData to a specified bounding box
 */
export function cropImageData(sourceImageData, cropBox) {
  const { minX, minY, width: cropWidth, height: cropHeight } = cropBox;
  const srcW = sourceImageData.width;
  const srcData = sourceImageData.data;
  const dst = new Uint8ClampedArray(cropWidth * cropHeight * 4);

  for (let y = 0; y < cropHeight; y++) {
    const srcRow = ((minY + y) * srcW + minX) * 4;
    const dstRow = y * cropWidth * 4;
    dst.set(srcData.subarray(srcRow, srcRow + cropWidth * 4), dstRow);
  }

  return {
    data: dst,
    width: cropWidth,
    height: cropHeight
  };
}

/**
 * Resample Image with chosen method, gamma correction, and alpha threshold
 */
export function resampleImage(srcData, srcW, srcH, dstW, dstH, options = {}) {
  const {
    method = 'lanczos3',
    gammaCorrection = true,
    alphaThreshold = 128
  } = options;

  if (srcW === dstW && srcH === dstH && method === 'nearest') {
    // Exact copy with binary alpha
    const dst = new Uint8ClampedArray(dstW * dstH * 4);
    for (let i = 0; i < srcData.length; i += 4) {
      if (srcData[i + 3] < alphaThreshold) {
        dst[i] = 0;
        dst[i + 1] = 0;
        dst[i + 2] = 0;
        dst[i + 3] = 0;
      } else {
        dst[i] = srcData[i];
        dst[i + 1] = srcData[i + 1];
        dst[i + 2] = srcData[i + 2];
        dst[i + 3] = 255;
      }
    }
    return dst;
  }

  switch (method) {
    case 'nearest':
      return resampleNearest(srcData, srcW, srcH, dstW, dstH, alphaThreshold);

    case 'box':
      return resampleBox(srcData, srcW, srcH, dstW, dstH, gammaCorrection, alphaThreshold);

    case 'bilinear':
      return resampleSeparable(
        srcData, srcW, srcH, dstW, dstH,
        bilinearKernel, 1.0,
        gammaCorrection, alphaThreshold
      );

    case 'bicubic':
      return resampleSeparable(
        srcData, srcW, srcH, dstW, dstH,
        (x) => bicubicKernel(x, 0.0, 0.5), 2.0, // Catmull-Rom
        gammaCorrection, alphaThreshold
      );

    case 'lanczos2':
      return resampleSeparable(
        srcData, srcW, srcH, dstW, dstH,
        (x) => lanczosKernel(x, 2), 2.0,
        gammaCorrection, alphaThreshold
      );

    case 'lanczos3':
    default:
      return resampleSeparable(
        srcData, srcW, srcH, dstW, dstH,
        (x) => lanczosKernel(x, 3), 3.0,
        gammaCorrection, alphaThreshold
      );
  }
}

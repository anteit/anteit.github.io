/**
 * Application Entry Point and Coordinator
 * Connects State, UI, Worker pipeline with robust fallback and initial sample image.
 */

import { state } from './state.js';
import { CanvasViewport } from './ui/canvas.js';
import { PaletteView } from './ui/paletteView.js';
import { ControlsView } from './ui/controls.js';
import { resampleImage } from './core/resizer.js';
import { preparePalette } from './core/quantizer.js';
import { applyDithering } from './core/dither.js';

class PixelArtApp {
  constructor() {
    this.worker = null;
    this.renderIdCounter = 0;
    this.activeRenderId = 0;
    this.debounceTimer = null;
    this.useWorkerFallback = false;

    this.initDOM();
    this.initWorker();
    this.initPipelines();
    this.createInitialSample();
  }

  initDOM() {
    const viewportContainer = document.querySelector('#canvas-viewport');
    this.viewport = new CanvasViewport(viewportContainer, state);

    const paletteRoot = document.querySelector('#palette-section');
    this.paletteView = new PaletteView(paletteRoot, state);

    const appRoot = document.querySelector('.app-container');
    this.controlsView = new ControlsView(appRoot, state, this.viewport);
  }

  initWorker() {
    try {
      // Initialize ES Module Web Worker
      this.worker = new Worker(new URL('./workers/render.worker.js', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (e) => this.handleWorkerMessage(e);

      this.worker.onerror = (err) => {
        console.warn('Worker error or file:// restriction encountered, switching to direct-thread execution:', err);
        this.useWorkerFallback = true;
      };
    } catch (err) {
      console.warn('Worker instantiation failed (e.g. file:// protocol restriction), switching to direct-thread execution:', err);
      this.useWorkerFallback = true;
    }
  }

  initPipelines() {
    // Re-render when any rendering parameter changes
    const renderTriggerKeys = [
      'targetWidth',
      'targetHeight',
      'downsampleMethod',
      'gammaCorrection',
      'alphaThreshold',
      'colorDistanceMetric',
      'ditherMethod',
      'ditherStrength',
      'palette',
      'sourceImageData'
    ];

    for (const key of renderTriggerKeys) {
      state.on(`change:${key}`, () => {
        this.scheduleRender();
      });
    }
  }

  scheduleRender() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // Smooth 35ms debounce for sliders and rapid adjustments
    this.debounceTimer = setTimeout(() => {
      this.executeRender();
    }, 35);
  }

  executeRender() {
    const srcData = state.get('sourceImageData');
    const srcW = state.get('sourceWidth');
    const srcH = state.get('sourceHeight');
    const dstW = state.get('targetWidth');
    const dstH = state.get('targetHeight');

    if (!srcData || !srcW || !srcH || dstW < 1 || dstH < 1) return;

    const renderId = ++this.renderIdCounter;
    this.activeRenderId = renderId;

    state.update({
      isRendering: true,
      renderProgress: 0.05
    });

    const options = {
      downsampleMethod: state.get('downsampleMethod'),
      gammaCorrection: state.get('gammaCorrection'),
      alphaThreshold: state.get('alphaThreshold'),
      colorDistanceMetric: state.get('colorDistanceMetric'),
      ditherMethod: state.get('ditherMethod'),
      ditherStrength: state.get('ditherStrength'),
      palette: state.get('palette')
    };

    if (this.worker && !this.useWorkerFallback) {
      // Send clone of pixel buffer to Worker
      const bufferCopy = new Uint8ClampedArray(srcData.data);
      this.worker.postMessage(
        {
          type: 'render',
          id: renderId,
          srcData: bufferCopy,
          srcW,
          srcH,
          dstW,
          dstH,
          options
        },
        [bufferCopy.buffer]
      );
    } else {
      // Fallback: asynchronous main-thread computation
      this.runMainThreadPipeline(renderId, srcData.data, srcW, srcH, dstW, dstH, options);
    }
  }

  handleWorkerMessage(e) {
    const { type, id, progress, width, height, data, elapsed, error } = e.data;

    // Discard stale render messages
    if (id !== this.activeRenderId) return;

    if (type === 'progress') {
      state.set('renderProgress', progress);
    } else if (type === 'done') {
      const finalImageData = new ImageData(data, width, height);
      state.update({
        isRendering: false,
        renderProgress: 1.0,
        renderTimeMs: elapsed,
        renderedImageData: finalImageData
      });
    } else if (type === 'error') {
      console.error('Worker render error:', error);
      state.update({ isRendering: false });
    }
  }

  async runMainThreadPipeline(id, srcData, srcW, srcH, dstW, dstH, options) {
    await new Promise(resolve => setTimeout(resolve, 10));
    if (id !== this.activeRenderId) return;

    try {
      const startTime = performance.now();
      const activePalette = options.palette.filter(c => c.enabled !== false);
      const preparedPalette = preparePalette(activePalette);

      state.set('renderProgress', 0.2);

      const resampled = resampleImage(srcData, srcW, srcH, dstW, dstH, {
        method: options.downsampleMethod,
        gammaCorrection: options.gammaCorrection,
        alphaThreshold: options.alphaThreshold
      });

      state.set('renderProgress', 0.4);

      const dithered = applyDithering(resampled, dstW, dstH, preparedPalette, {
        method: options.ditherMethod,
        strength: options.ditherStrength,
        metric: options.colorDistanceMetric,
        onProgress: (p) => {
          if (id === this.activeRenderId) {
            state.set('renderProgress', 0.4 + p * 0.55);
          }
        }
      });

      if (id !== this.activeRenderId) return;

      const elapsed = Math.round(performance.now() - startTime);
      const finalImageData = new ImageData(dithered, dstW, dstH);

      state.update({
        isRendering: false,
        renderProgress: 1.0,
        renderTimeMs: elapsed,
        renderedImageData: finalImageData
      });
    } catch (err) {
      console.error('Main thread pipeline error:', err);
      state.update({ isRendering: false });
    }
  }

  /**
   * Generates a charming high-res planet graphic with transparent background
   * to immediately provide a live preview on first launch.
   */
  createInitialSample() {
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Transparent background
    ctx.clearRect(0, 0, size, size);

    // Planet body with atmospheric glow
    const cx = size / 2;
    const cy = size / 2;
    const r = 96;

    // Base sphere
    const sphereGrad = ctx.createRadialGradient(cx - 30, cy - 35, 15, cx, cy, r);
    sphereGrad.addColorStop(0, '#70d6ff');
    sphereGrad.addColorStop(0.4, '#0099db');
    sphereGrad.addColorStop(0.75, '#004e92');
    sphereGrad.addColorStop(1, '#00142b');

    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Planet continents / topography
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#63c74d';
    ctx.beginPath();
    ctx.ellipse(cx - 20, cy + 10, 45, 25, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3e8948';
    ctx.beginPath();
    ctx.ellipse(cx + 35, cy - 25, 30, 20, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fee761';
    ctx.beginPath();
    ctx.ellipse(cx - 35, cy + 45, 25, 12, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Swirling cloud belts
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 40, 75, 12, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx - 10, cy + 25, 80, 10, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Planetary Ring with semi-transparency
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);

    ctx.beginPath();
    ctx.ellipse(0, 0, 145, 32, 0, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 223, 176, 0.85)';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, 158, 36, 0, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(202, 227, 255, 0.65)';
    ctx.stroke();

    ctx.restore();

    // Convert to Image and trigger initial pipeline
    const img = new Image();
    img.onload = () => {
      const imgData = ctx.getImageData(0, 0, size, size);
      state.update({
        rawImage: img,
        rawImageData: imgData,
        rawWidth: size,
        rawHeight: size,
        imageFileName: 'pixel_planet_demo'
      }, true);

      this.controlsView.updateActiveSource(true);

      setTimeout(() => {
        this.viewport.fitToScreen();
      }, 100);
    };
    img.src = canvas.toDataURL('image/png');
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.__pixelApp = new PixelArtApp();
});

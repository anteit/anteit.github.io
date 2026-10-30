/**
 * Application Reactive State & Event Bus
 */

class AppState {
  constructor() {
    this._listeners = new Map();

    this.state = {
      // Source Image (Full / Untouched)
      rawImage: null,
      rawImageData: null,
      rawWidth: 0,
      rawHeight: 0,
      imageFileName: '',

      // Auto-Trim Transparency
      trimTransparency: true,
      contentBoundingBox: null,

      // Active Source (Cropped if trimTransparency=true, otherwise full)
      sourceImage: null,
      sourceImageData: null,
      sourceWidth: 0,
      sourceHeight: 0,

      // Target Geometry
      targetWidth: 64,
      targetHeight: 64,
      lockAspectRatio: true,
      aspectRatio: 1.0,

      // Downsampling & Alpha
      downsampleMethod: 'lanczos3', // 'lanczos3', 'lanczos2', 'bicubic', 'bilinear', 'box', 'nearest'
      gammaCorrection: true,
      alphaThreshold: 128, // 1 to 254

      // Color Science & Dithering
      colorDistanceMetric: 'ciede2000', // 'ciede2000', 'cie76', 'oklab', 'euclidean'
      ditherMethod: 'floyd-steinberg', // 'none', 'floyd-steinberg', 'atkinson', 'bayer4', 'bayer8'
      ditherStrength: 80, // 0 to 100%

      // Palette
      paletteName: 'Pixelplanet Земля',
      palette: [], // Array of { r, g, b, hex, enabled }

      // Rendering state
      isRendering: false,
      renderProgress: 0,
      renderTimeMs: 0,
      renderedImageData: null,

      // Viewport
      zoom: 1.0,
      panX: 0,
      panY: 0,
      showGrid: true,
      compareMode: 'split', // 'split' | 'off'
      compareHold: false,
      splitPosition: 50 // 0 to 100
    };
  }

  get(key) {
    return this.state[key];
  }

  set(key, value, silent = false) {
    const oldValue = this.state[key];
    if (oldValue === value && typeof value !== 'object') return;
    this.state[key] = value;
    if (!silent) {
      this.emit(`change:${key}`, { value, oldValue });
      this.emit('change', { key, value, oldValue });
    }
  }

  update(patch, silent = false) {
    const changes = [];
    for (const [key, value] of Object.entries(patch)) {
      const oldValue = this.state[key];
      this.state[key] = value;
      changes.push({ key, value, oldValue });
    }
    if (!silent) {
      for (const change of changes) {
        this.emit(`change:${change.key}`, change);
      }
      this.emit('batchChange', changes);
    }
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
  }

  emit(event, payload) {
    if (this._listeners.has(event)) {
      for (const cb of this._listeners.get(event)) {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }

  getActivePalette() {
    return this.state.palette.filter(c => c.enabled);
  }
}

export const state = new AppState();

/**
 * UI Controls and State Data-Binding
 * Two-way synchronization between inputs, sliders, switches, and AppState
 */

import { getOpaqueBoundingBox, cropImageData } from '../core/resizer.js';
import { showToast } from './toast.js';

export class ControlsView {
  constructor(rootEl, state, canvasViewport) {
    this.root = rootEl;
    this.state = state;
    this.viewport = canvasViewport;

    // Image Input Elements
    this.imageFileInput = rootEl.querySelector('#image-file-input');
    this.imageDropzone = rootEl.querySelector('#image-dropzone');
    this.imageInfoPill = rootEl.querySelector('#image-info-pill');

    // Geometry Elements
    this.inputWidth = rootEl.querySelector('#target-width');
    this.inputHeight = rootEl.querySelector('#target-height');
    this.btnLockAspect = rootEl.querySelector('#btn-lock-aspect');
    this.btnResetDimensions = rootEl.querySelector('#btn-reset-dimensions');
    this.switchTrim = rootEl.querySelector('#switch-trim-transparency');
    this.trimInfoSubtext = rootEl.querySelector('#trim-info-subtext');

    // Downsampling & Alpha Elements
    this.selectDownsample = rootEl.querySelector('#select-downsample');
    this.switchGamma = rootEl.querySelector('#switch-gamma');
    this.sliderAlpha = rootEl.querySelector('#slider-alpha-threshold');
    this.labelAlphaVal = rootEl.querySelector('#val-alpha-threshold');

    // Color Science & Dither Elements
    this.selectMetric = rootEl.querySelector('#select-color-metric');
    this.selectDither = rootEl.querySelector('#select-dither-method');
    this.sliderDither = rootEl.querySelector('#slider-dither-strength');
    this.labelDitherVal = rootEl.querySelector('#val-dither-strength');
    this.fieldDitherStrength = rootEl.querySelector('#field-dither-strength');

    // Viewport & Comparison Elements
    this.btnZoomIn = rootEl.querySelector('#btn-zoom-in');
    this.btnZoomOut = rootEl.querySelector('#btn-zoom-out');
    this.btnZoomFit = rootEl.querySelector('#btn-zoom-fit');
    this.zoomIndicator = rootEl.querySelector('#zoom-indicator');
    this.btnHoldCompare = rootEl.querySelector('#btn-hold-compare');
    this.btnToggleCompare = rootEl.querySelector('#btn-toggle-compare');
    this.btnToggleGrid = rootEl.querySelector('#btn-toggle-grid');

    // Export Elements
    this.btnExportPng = rootEl.querySelector('#btn-export-png');
    this.renderStatusPill = rootEl.querySelector('#render-status-pill');
    this.progressBar = rootEl.querySelector('#render-progress-bar');
    this.progressContainer = rootEl.querySelector('#render-progress-container');

    this.initEvents();
    this.initSubscriptions();
  }

  initEvents() {
    // Image Dropzone & Browse
    this.imageDropzone.addEventListener('click', () => this.imageFileInput.click());

    this.imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.loadImageFile(e.target.files[0]);
        this.imageFileInput.value = '';
      }
    });

    this.imageDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.imageDropzone.classList.add('dragover');
    });

    this.imageDropzone.addEventListener('dragleave', () => {
      this.imageDropzone.classList.remove('dragover');
    });

    this.imageDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.imageDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.loadImageFile(e.dataTransfer.files[0]);
      }
    });

    // Window global drag & drop for convenience
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      if (e.target.closest('#image-dropzone') || e.target.closest('#palette-dropzone')) return;
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          this.loadImageFile(file);
        }
      }
    });

    // Geometry inputs
    this.inputWidth.addEventListener('input', () => {
      const w = parseInt(this.inputWidth.value, 10);
      if (isNaN(w) || w < 1) return;

      if (this.state.get('lockAspectRatio')) {
        const ratio = this.state.get('aspectRatio') || 1.0;
        const h = Math.max(1, Math.round(w / ratio));
        this.inputHeight.value = h;
        this.state.update({ targetWidth: w, targetHeight: h });
      } else {
        this.state.set('targetWidth', w);
      }
    });

    this.inputHeight.addEventListener('input', () => {
      const h = parseInt(this.inputHeight.value, 10);
      if (isNaN(h) || h < 1) return;

      if (this.state.get('lockAspectRatio')) {
        const ratio = this.state.get('aspectRatio') || 1.0;
        const w = Math.max(1, Math.round(h * ratio));
        this.inputWidth.value = w;
        this.state.update({ targetWidth: w, targetHeight: h });
      } else {
        this.state.set('targetHeight', h);
      }
    });

    this.btnLockAspect.addEventListener('click', () => {
      const locked = !this.state.get('lockAspectRatio');
      this.state.set('lockAspectRatio', locked);
      this.btnLockAspect.classList.toggle('locked', locked);
      this.btnLockAspect.title = locked ? 'Пропорции зафиксированы' : 'Пропорции свободны';
    });

    // Auto-Trim Transparency Switch
    if (this.switchTrim) {
      this.switchTrim.addEventListener('change', () => {
        this.state.set('trimTransparency', this.switchTrim.checked);
        this.updateActiveSource(true);
      });
    }

    if (this.btnResetDimensions) {
      this.btnResetDimensions.addEventListener('click', () => {
        const curW = this.state.get('sourceWidth');
        const curH = this.state.get('sourceHeight');
        if (curW && curH) {
          const maxDim = 128;
          let targetW = curW;
          let targetH = curH;
          if (curW > maxDim || curH > maxDim) {
            if (curW >= curH) {
              targetW = maxDim;
              targetH = Math.max(1, Math.round(curH * (maxDim / curW)));
            } else {
              targetH = maxDim;
              targetW = Math.max(1, Math.round(curW * (maxDim / curH)));
            }
          }
          this.inputWidth.value = targetW;
          this.inputHeight.value = targetH;
          this.state.update({ targetWidth: targetW, targetHeight: targetH });
        }
      });
    }

    // Downsampling & Alpha
    this.selectDownsample.addEventListener('change', (e) => {
      this.state.set('downsampleMethod', e.target.value);
    });

    this.switchGamma.addEventListener('change', (e) => {
      this.state.set('gammaCorrection', e.target.checked);
    });

    this.sliderAlpha.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.labelAlphaVal.textContent = val;
      this.state.set('alphaThreshold', val);
      // Update trim bounding box based on new alpha threshold
      if (this.state.get('rawImageData')) {
        this.updateActiveSource(false);
      }
    });

    // Color Science & Dither
    this.selectMetric.addEventListener('change', (e) => {
      this.state.set('colorDistanceMetric', e.target.value);
    });

    this.selectDither.addEventListener('change', (e) => {
      const val = e.target.value;
      this.state.set('ditherMethod', val);
      if (val === 'none') {
        this.fieldDitherStrength.style.display = 'none';
      } else {
        this.fieldDitherStrength.style.display = 'flex';
      }
    });

    this.sliderDither.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.labelDitherVal.textContent = `${val}%`;
      this.state.set('ditherStrength', val);
    });

    // Viewport controls
    this.btnZoomIn.addEventListener('click', () => {
      const current = this.state.get('zoom');
      this.viewport.setZoom(Math.min(64.0, current * 1.3));
    });

    this.btnZoomOut.addEventListener('click', () => {
      const current = this.state.get('zoom');
      this.viewport.setZoom(Math.max(0.1, current / 1.3));
    });

    this.btnZoomFit.addEventListener('click', () => {
      this.viewport.fitToScreen();
    });

    // Pixel Grid toggle
    if (this.btnToggleGrid) {
      this.btnToggleGrid.addEventListener('click', () => {
        const current = this.state.get('showGrid');
        this.state.set('showGrid', !current);
        this.btnToggleGrid.classList.toggle('active', !current);
        this.viewport.drawPixelGrid();
      });
    }

    // Comparison Controls: Split mode toggle & Hold button
    if (this.btnToggleCompare) {
      this.btnToggleCompare.addEventListener('click', () => {
        const curMode = this.state.get('compareMode');
        const newMode = curMode === 'split' ? 'off' : 'split';
        this.state.set('compareMode', newMode);
        this.btnToggleCompare.classList.toggle('active', newMode === 'split');
      });
    }

    if (this.btnHoldCompare) {
      const activateHold = (e) => {
        e.preventDefault();
        this.state.set('compareHold', true);
      };
      const deactivateHold = (e) => {
        e.preventDefault();
        this.state.set('compareHold', false);
      };

      this.btnHoldCompare.addEventListener('mousedown', activateHold);
      window.addEventListener('mouseup', deactivateHold);
      this.btnHoldCompare.addEventListener('touchstart', activateHold);
      window.addEventListener('touchend', deactivateHold);
    }

    // Clipboard Paste (Ctrl+V) anywhere on the page
    window.addEventListener('paste', (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }
      if (e.clipboardData && e.clipboardData.items) {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              this.loadImageFile(file);
              showToast('Изображение вставлено из буфера');
              break;
            }
          }
        }
      }
    });

    // Spacebar to hold-compare & keyboard shortcuts for zoom
    window.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.state.set('compareHold', true);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const current = this.state.get('zoom');
        this.viewport.setZoom(Math.min(64.0, current * 1.3));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const current = this.state.get('zoom');
        this.viewport.setZoom(Math.max(0.1, current / 1.3));
      } else if (e.key === '0') {
        e.preventDefault();
        this.viewport.setZoom(1.0);
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
        e.preventDefault();
        this.viewport.fitToScreen();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.state.set('compareHold', false);
      }
    });

    // Export PNG (1:1 original pixel-perfect download)
    this.btnExportPng.addEventListener('click', () => {
      this.exportPixelArtPng();
    });
  }

  initSubscriptions() {
    this.state.on('zoomChange', ({ zoom }) => {
      this.zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
    });

    this.state.on('change:isRendering', ({ value }) => {
      if (value) {
        this.progressContainer.classList.add('active');
        this.renderStatusPill.innerHTML = '<span class="status-dot busy"></span> Обработка...';
      } else {
        this.progressContainer.classList.remove('active');
        const ms = this.state.get('renderTimeMs');
        this.renderStatusPill.innerHTML = `<span class="status-dot"></span> Готово (${ms}мс)`;
      }
    });

    this.state.on('change:renderProgress', ({ value }) => {
      this.progressBar.style.width = `${Math.round(value * 100)}%`;
    });

    this.state.on('change:targetWidth', ({ value }) => {
      this.inputWidth.value = value;
    });

    this.state.on('change:targetHeight', ({ value }) => {
      this.inputHeight.value = value;
    });
  }

  /**
   * Adapts active source image data according to non-transparent bounding box
   * @param {boolean} recalculateTargetDimensions - Whether to auto-update target X & Y
   */
  updateActiveSource(recalculateTargetDimensions = false) {
    const rawImageData = this.state.get('rawImageData');
    const rawImage = this.state.get('rawImage');
    if (!rawImageData || !rawImage) return;

    const threshold = this.state.get('alphaThreshold') || 128;
    const bbox = getOpaqueBoundingBox(rawImageData, threshold);
    this.state.set('contentBoundingBox', bbox, true);

    const shouldTrim = this.state.get('trimTransparency') && bbox.hasTransparentBorders && !bbox.isEmpty;

    let activeImageData;
    let activeImage;
    let activeW;
    let activeH;

    if (shouldTrim) {
      const cropped = cropImageData(rawImageData, bbox);
      activeImageData = new ImageData(cropped.data, cropped.width, cropped.height);
      activeW = cropped.width;
      activeH = cropped.height;

      // Create an offscreen canvas element to serve as sourceImage for comparison view
      const offCanvas = document.createElement('canvas');
      offCanvas.width = activeW;
      offCanvas.height = activeH;
      offCanvas.getContext('2d').putImageData(activeImageData, 0, 0);
      activeImage = offCanvas;

      if (this.trimInfoSubtext) {
        this.trimInfoSubtext.textContent = `По контенту: ${activeW}×${activeH} px (из ${rawImageData.width}×${rawImageData.height})`;
      }
      if (this.imageInfoPill) {
        this.imageInfoPill.innerHTML = `<strong>${activeW}×${activeH}</strong> px (контент, поля обрезаны)`;
      }
    } else {
      activeImageData = rawImageData;
      activeImage = rawImage;
      activeW = rawImageData.width;
      activeH = rawImageData.height;

      if (this.trimInfoSubtext) {
        this.trimInfoSubtext.textContent = bbox.hasTransparentBorders
          ? `Полный кадр: ${activeW}×${activeH} px (есть прозрачные поля)`
          : `Нет прозрачных полей по краям (${activeW}×${activeH} px)`;
      }
      if (this.imageInfoPill) {
        this.imageInfoPill.innerHTML = `<strong>${activeW}×${activeH}</strong> px`;
      }
    }

    const ratio = activeW / activeH;
    const patch = {
      sourceImageData: activeImageData,
      sourceImage: activeImage,
      sourceWidth: activeW,
      sourceHeight: activeH,
      aspectRatio: ratio
    };

    if (recalculateTargetDimensions) {
      // Smart initial target dimension: scale down gracefully if larger than 64-128
      let targetW = activeW;
      let targetH = activeH;
      const maxDim = 64;

      if (activeW > maxDim || activeH > maxDim) {
        if (activeW >= activeH) {
          targetW = maxDim;
          targetH = Math.max(1, Math.round(maxDim / ratio));
        } else {
          targetH = maxDim;
          targetW = Math.max(1, Math.round(maxDim * ratio));
        }
      }

      patch.targetWidth = targetW;
      patch.targetHeight = targetH;
      this.inputWidth.value = targetW;
      this.inputHeight.value = targetH;
    } else if (this.state.get('lockAspectRatio')) {
      // Keep existing width, adapt height to new ratio
      const currentW = this.state.get('targetWidth');
      const newH = Math.max(1, Math.round(currentW / ratio));
      patch.targetHeight = newH;
      this.inputHeight.value = newH;
    }

    this.state.update(patch);
  }

  async loadImageFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите файл изображения (PNG, JPG, WebP, SVG, GIF).');
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Create an offscreen canvas to obtain raw unmultiplied ImageData
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const rawImageData = ctx.getImageData(0, 0, img.width, img.height);

      this.state.update({
        rawImage: img,
        rawImageData: rawImageData,
        rawWidth: img.width,
        rawHeight: img.height,
        imageFileName: file.name.replace(/\.[^/.]+$/, '')
      }, true);

      // Adapt to non-transparent pixels and set smart target dimensions
      this.updateActiveSource(true);
      showToast(`Загружено: ${file.name}`);
    };

    img.src = url;
  }

  exportPixelArtPng() {
    const rendered = this.state.get('renderedImageData');
    if (!rendered) {
      alert('Нет готового изображения для экспорта. Пожалуйста, загрузите изображение.');
      return;
    }

    // Create 1:1 canvas for pixel-perfect export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = rendered.width;
    exportCanvas.height = rendered.height;
    const ctx = exportCanvas.getContext('2d');
    ctx.putImageData(rendered, 0, 0);

    const baseName = this.state.get('imageFileName') || 'pixel-art';
    const filename = `${baseName}_${rendered.width}x${rendered.height}.png`;

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      showToast(`Экспорт ${filename} завершён`);
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }, 'image/png');
  }
}

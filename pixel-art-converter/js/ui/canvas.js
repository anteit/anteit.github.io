/**
 * Interactive Viewport Canvas
 * Pan & Zoom, Pixel Grid (>= 400%), Checkerboard Transparency, Instant Comparison
 */

export class CanvasViewport {
  constructor(containerEl, state) {
    this.container = containerEl;
    this.state = state;

    // Elements inside container
    this.transformLayer = containerEl.querySelector('.canvas-transform-layer');
    this.canvasCard = containerEl.querySelector('.canvas-card');
    this.pixelCanvas = containerEl.querySelector('.pixel-canvas');
    this.originalCanvas = containerEl.querySelector('.original-canvas-overlay');
    this.gridCanvas = containerEl.querySelector('.pixel-grid-canvas');
    this.splitDivider = containerEl.querySelector('.split-divider');

    this.pixelCtx = this.pixelCanvas.getContext('2d');
    this.originalCtx = this.originalCanvas.getContext('2d');
    this.gridCtx = this.gridCanvas.getContext('2d');

    // Pan & Zoom state
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Comparison split state
    this.isDraggingSplit = false;
    this.splitPercent = 50; // 0 to 100

    this.initEvents();
    this.initSubscriptions();
  }

  initEvents() {
    // Wheel zoom centered on cursor
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8333;
      const newScale = Math.max(0.1, Math.min(64.0, this.scale * zoomFactor));

      if (newScale !== this.scale) {
        // Zoom relative to mouse position
        this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
        this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
        this.scale = newScale;
        this.updateTransform();
      }
    }, { passive: false });

    // Mouse drag for panning
    this.container.addEventListener('mousedown', (e) => {
      // Check if clicking near split divider in split mode
      if (this.state.get('compareMode') === 'split') {
        const rect = this.canvasCard.getBoundingClientRect();
        const splitX = rect.left + (rect.width * this.splitPercent) / 100;
        if (Math.abs(e.clientX - splitX) < 12) {
          this.isDraggingSplit = true;
          e.preventDefault();
          return;
        }
      }

      if (e.button === 0 || e.button === 1) { // Left or middle click
        this.isPanning = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.container.classList.add('panning');
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingSplit) {
        const rect = this.canvasCard.getBoundingClientRect();
        if (rect.width > 0) {
          const clampedX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          this.splitPercent = (clampedX / rect.width) * 100;
          this.state.set('splitPosition', this.splitPercent, true);
          this.updateComparisonView();
        }
        return;
      }

      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.isDraggingSplit = false;
      this.container.classList.remove('panning');
    });

    // Handle touch events for mobile/trackpad
    let initialTouchDist = 0;
    let initialScale = 1;

    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isPanning = true;
        this.startX = e.touches[0].clientX - this.panX;
        this.startY = e.touches[0].clientY - this.panY;
      } else if (e.touches.length === 2) {
        this.isPanning = false;
        initialTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = this.scale;
      }
    }, { passive: true });

    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isPanning) {
        this.panX = e.touches[0].clientX - this.startX;
        this.panY = e.touches[0].clientY - this.startY;
        this.updateTransform();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (initialTouchDist > 0) {
          const factor = dist / initialTouchDist;
          this.scale = Math.max(0.1, Math.min(64.0, initialScale * factor));
          this.updateTransform();
        }
      }
    }, { passive: true });

    this.container.addEventListener('touchend', () => {
      this.isPanning = false;
    });
  }

  initSubscriptions() {
    this.state.on('change:renderedImageData', ({ value }) => {
      if (value) {
        this.renderPixelArt(value);
      }
    });

    this.state.on('change:sourceImage', ({ value }) => {
      if (value) {
        this.updateOriginalOverlay(value);
        this.fitToScreen();
      }
    });

    this.state.on('change:compareMode', () => this.updateComparisonView());
    this.state.on('change:compareHold', () => this.updateComparisonView());
    this.state.on('change:splitPosition', ({ value }) => {
      this.splitPercent = value;
      this.updateComparisonView();
    });
  }

  renderPixelArt(imageData) {
    const w = imageData.width;
    const h = imageData.height;

    this.pixelCanvas.width = w;
    this.pixelCanvas.height = h;
    this.canvasCard.style.width = `${w}px`;
    this.canvasCard.style.height = `${h}px`;

    this.pixelCtx.putImageData(imageData, 0, 0);

    // Update overlay & grid canvas sizes
    this.gridCanvas.width = w;
    this.gridCanvas.height = h;

    const srcImg = this.state.get('sourceImage');
    if (srcImg) {
      this.updateOriginalOverlay(srcImg);
    }

    this.drawPixelGrid();
    this.updateComparisonView();
  }

  updateOriginalOverlay(img) {
    const w = this.pixelCanvas.width || img.width;
    const h = this.pixelCanvas.height || img.height;

    this.originalCanvas.width = w;
    this.originalCanvas.height = h;
    this.originalCtx.clearRect(0, 0, w, h);
    // Draw original scaled to the target dimension
    this.originalCtx.drawImage(img, 0, 0, w, h);
  }

  drawPixelGrid() {
    const w = this.pixelCanvas.width;
    const h = this.pixelCanvas.height;
    if (!w || !h) return;

    this.gridCtx.clearRect(0, 0, w, h);

    // Only draw grid when zoom factor is >= 4.0 (400%)
    if (this.scale >= 4.0 && this.state.get('showGrid')) {
      const alpha = Math.min(0.25, (this.scale - 4.0) / 4.0 * 0.25);
      this.gridCanvas.style.opacity = '1';

      this.gridCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      this.gridCtx.lineWidth = 1.0 / this.scale;

      this.gridCtx.beginPath();
      for (let x = 0; x <= w; x++) {
        this.gridCtx.moveTo(x, 0);
        this.gridCtx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y++) {
        this.gridCtx.moveTo(0, y);
        this.gridCtx.lineTo(w, y);
      }
      this.gridCtx.stroke();
    } else {
      this.gridCanvas.style.opacity = '0';
    }
  }

  updateTransform() {
    this.transformLayer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.drawPixelGrid();
    this.state.set('zoom', this.scale, true);
    this.state.emit('zoomChange', { zoom: this.scale });
  }

  updateComparisonView() {
    const mode = this.state.get('compareMode');
    const hold = this.state.get('compareHold');

    if (hold) {
      // Temporarily show 100% original
      this.originalCanvas.style.clipPath = 'none';
      this.originalCanvas.classList.add('active');
      this.splitDivider.style.display = 'none';
      return;
    }

    if (mode === 'split') {
      const p = this.splitPercent;
      this.originalCanvas.classList.add('active');
      this.originalCanvas.style.clipPath = `polygon(0% 0%, ${p}% 0%, ${p}% 100%, 0% 100%)`;
      this.splitDivider.style.display = 'block';
      this.splitDivider.style.left = `${p}%`;
    } else {
      this.originalCanvas.classList.remove('active');
      this.originalCanvas.style.clipPath = 'none';
      this.splitDivider.style.display = 'none';
    }
  }

  fitToScreen() {
    const rect = this.container.getBoundingClientRect();
    const w = this.canvasCard.offsetWidth || this.state.get('targetWidth') || 200;
    const h = this.canvasCard.offsetHeight || this.state.get('targetHeight') || 200;

    const padding = 60;
    const availW = Math.max(50, rect.width - padding);
    const availH = Math.max(50, rect.height - padding);

    const fitScale = Math.min(availW / w, availH / h, 16.0);
    this.scale = Math.max(0.5, fitScale);

    this.panX = Math.round((rect.width - w * this.scale) / 2);
    this.panY = Math.round((rect.height - h * this.scale) / 2);

    this.updateTransform();
  }

  setZoom(scale) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.panX = centerX - (centerX - this.panX) * (scale / this.scale);
    this.panY = centerY - (centerY - this.panY) * (scale / this.scale);
    this.scale = scale;
    this.updateTransform();
  }
}

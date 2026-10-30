/**
 * Palette Inspector and Management View
 * Swatches grid, enable/disable toggles, import/export, built-in palettes
 */

import { hexToRgb, rgbToHex } from '../core/color.js';
import { parseGpl, exportGpl } from '../parsers/gpl.js';
import { parseJascPal, exportJascPal } from '../parsers/jascPal.js';
import { parseTextPal, exportText } from '../parsers/textPal.js';
import { showToast } from './toast.js';

// Built-in presets
export const BUILTIN_PALETTES = {
  'Pixelplanet Земля': [
    '#ffffff', '#e4e4e4', '#c4c4c4', '#888888', '#4e4e4e', '#000000',
    '#f4b3ae', '#ffa7d1', '#ff54b2', '#ff6565', '#e50000', '#9a0000',
    '#fea460', '#e59500', '#a06a42', '#604028', '#f5dfb0', '#fff889',
    '#e5d900', '#94e044', '#02be01', '#688338', '#006513', '#cae3ff',
    '#00d3dd', '#0083c7', '#0000ea', '#191973', '#cf6ee4', '#820080'
  ],
  'Pico-8': [
    '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F',
    '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436',
    '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
  ],
  'Game Boy': [
    '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
  ],
  'Endesga 32': [
    '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39',
    '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761',
    '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db',
    '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
    '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a',
    '#e8b796', '#c28569'
  ],
  'Resurrect 64': [
    '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#697b5b',
    '#524b24', '#323c39', '#3f3f74', '#306082', '#539e80', '#99e65f',
    '#e2f3e4', '#b38475', '#c26270', '#e3516e', '#8c3f5d', '#462446',
    '#311327', '#422433', '#5b3138', '#8e5252', '#ba7563', '#e39f78',
    '#dead7d', '#f7d38c', '#b0c4de', '#526478', '#37475c', '#273142',
    '#1b1c2b', '#181425', '#1e2436', '#2b334a', '#3e4a68', '#5b6e8a',
    '#8099b3', '#a7c1db', '#cfe2f3', '#492837', '#733c3c', '#b35d43',
    '#e08654', '#f5b06b', '#fce184', '#99b057', '#5f803b', '#3b542c',
    '#223321', '#16211c', '#1b3b3a', '#245f5a', '#368e82', '#5ec2a5',
    '#91e3bf', '#d0fced', '#124e89', '#0099db', '#2ce8f5', '#ff0044',
    '#cf6ee4', '#820080', '#ffffff', '#000000'
  ]
};

export class PaletteView {
  constructor(rootEl, state) {
    this.root = rootEl;
    this.state = state;

    // Elements
    this.presetSelect = rootEl.querySelector('#palette-preset-select');
    this.swatchesContainer = rootEl.querySelector('#palette-swatches');
    this.colorCountBadge = rootEl.querySelector('#palette-count-badge');
    this.fileInput = rootEl.querySelector('#palette-file-input');
    this.dropzone = rootEl.querySelector('#palette-dropzone');

    this.btnEnableAll = rootEl.querySelector('#btn-palette-enable-all');
    this.btnDisableAll = rootEl.querySelector('#btn-palette-disable-all');
    this.btnInvert = rootEl.querySelector('#btn-palette-invert');
    this.btnAddColor = rootEl.querySelector('#btn-palette-add-color');
    this.colorPicker = rootEl.querySelector('#palette-color-picker');

    this.btnExportGpl = rootEl.querySelector('#btn-export-gpl');
    this.btnExportTxt = rootEl.querySelector('#btn-export-txt');

    this.btnOpenPasteModal = rootEl.querySelector('#btn-open-paste-modal');
    this.pasteModal = document.querySelector('#modal-paste-palette');
    this.pasteTextarea = document.querySelector('#paste-palette-textarea');
    this.btnApplyPaste = document.querySelector('#btn-apply-paste-palette');
    this.btnClosePaste = document.querySelector('#btn-close-paste-modal');

    this.initPresets();
    this.initEvents();
    this.initSubscriptions();

    // Load initial preset (Pixelplanet Земля)
    this.loadPreset('Pixelplanet Земля');
  }

  initPresets() {
    this.presetSelect.innerHTML = '';
    for (const name of Object.keys(BUILTIN_PALETTES)) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      this.presetSelect.appendChild(option);
    }
  }

  loadPreset(name) {
    const hexList = BUILTIN_PALETTES[name];
    if (!hexList) return;

    const colors = hexList.map(hex => {
      const rgb = hexToRgb(hex);
      return {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        hex,
        enabled: true
      };
    });

    this.state.update({
      paletteName: name,
      palette: colors
    });
    this.presetSelect.value = name;
  }

  initEvents() {
    this.presetSelect.addEventListener('change', (e) => {
      this.loadPreset(e.target.value);
    });

    // Swatches selection controls
    this.btnEnableAll.addEventListener('click', () => {
      const pal = this.state.get('palette').map(c => ({ ...c, enabled: true }));
      this.state.set('palette', pal);
    });

    this.btnDisableAll.addEventListener('click', () => {
      const pal = this.state.get('palette').map(c => ({ ...c, enabled: false }));
      this.state.set('palette', pal);
    });

    this.btnInvert.addEventListener('click', () => {
      const pal = this.state.get('palette').map(c => ({ ...c, enabled: !c.enabled }));
      this.state.set('palette', pal);
    });

    // Add Color picker
    if (this.btnAddColor && this.colorPicker) {
      this.btnAddColor.addEventListener('click', () => {
        this.colorPicker.click();
      });

      this.colorPicker.addEventListener('change', (e) => {
        const hex = e.target.value.toLowerCase();
        const rgb = hexToRgb(hex);
        if (rgb) {
          const current = this.state.get('palette');
          if (current.some(c => c.hex.toLowerCase() === hex)) {
            showToast(`Цвет ${hex} уже есть в палитре`);
            return;
          }
          const updated = [...current, { r: rgb.r, g: rgb.g, b: rgb.b, hex, enabled: true }];
          this.state.set('palette', updated);
          showToast(`Добавлен цвет ${hex}`);
        }
      });
    }

    // File Dropzone & Browse
    this.dropzone.addEventListener('click', () => this.fileInput.click());

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handlePaletteFile(e.target.files[0]);
        this.fileInput.value = '';
      }
    });

    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('dragover');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('dragover');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handlePaletteFile(e.dataTransfer.files[0]);
      }
    });

    // Export Palette buttons
    this.btnExportGpl.addEventListener('click', () => {
      const pal = this.state.get('palette');
      const name = this.state.get('paletteName') || 'Palette';
      const content = exportGpl(pal, name);
      this.downloadFile(content, `${name}.gpl`, 'text/plain');
      showToast(`Экспорт ${name}.gpl выполнен`);
    });

    this.btnExportTxt.addEventListener('click', () => {
      const pal = this.state.get('palette');
      const name = this.state.get('paletteName') || 'Palette';
      const content = exportText(pal);
      this.downloadFile(content, `${name}.txt`, 'text/plain');
      showToast(`Экспорт ${name}.txt выполнен`);
    });

    // Paste Modal events
    if (this.btnOpenPasteModal && this.pasteModal) {
      this.btnOpenPasteModal.addEventListener('click', () => {
        this.pasteModal.classList.add('open');
        this.pasteTextarea.focus();
      });

      this.btnClosePaste.addEventListener('click', () => {
        this.pasteModal.classList.remove('open');
      });

      this.pasteModal.addEventListener('click', (e) => {
        if (e.target === this.pasteModal) {
          this.pasteModal.classList.remove('open');
        }
      });

      this.btnApplyPaste.addEventListener('click', () => {
        const text = this.pasteTextarea.value.trim();
        if (text) {
          const parsed = parseTextPal(text);
          if (parsed.colors.length > 0) {
            this.setCustomPalette('Custom Paste', parsed.colors);
            this.pasteModal.classList.remove('open');
            this.pasteTextarea.value = '';
            showToast(`Загружено ${parsed.colors.length} цветов`);
          } else {
            alert('Не удалось распознать цвета в введенном тексте. Используйте формат #RRGGBB, #RGB или rgb(r,g,b).');
          }
        }
      });
    }
  }

  initSubscriptions() {
    this.state.on('change:palette', () => {
      this.renderSwatches();
    });
  }

  async handlePaletteFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const text = await file.text();
    let parsed;

    if (ext === 'gpl') {
      parsed = parseGpl(text);
    } else if (ext === 'pal') {
      parsed = parseJascPal(text);
    } else {
      parsed = parseTextPal(text);
    }

    if (parsed && parsed.colors && parsed.colors.length > 0) {
      const name = parsed.name !== 'Custom Palette' && parsed.name !== 'GIMP Palette' && parsed.name !== 'JASC Palette'
        ? parsed.name
        : file.name.replace(/\.[^/.]+$/, '');
      this.setCustomPalette(name, parsed.colors);
      showToast(`Палитра "${name}" загружена (${parsed.colors.length} цв.)`);
    } else {
      alert(`Не удалось прочитать палитру из файла ${file.name}. Проверьте формат файла (.gpl, .pal, .txt).`);
    }
  }

  setCustomPalette(name, colors) {
    // Add custom option to dropdown if not exists
    let existingOpt = Array.from(this.presetSelect.options).find(o => o.value === name);
    if (!existingOpt) {
      existingOpt = document.createElement('option');
      existingOpt.value = name;
      existingOpt.textContent = `★ ${name}`;
      this.presetSelect.appendChild(existingOpt);
    }
    this.presetSelect.value = name;

    this.state.update({
      paletteName: name,
      palette: colors
    });
  }

  renderSwatches() {
    const palette = this.state.get('palette');
    this.swatchesContainer.innerHTML = '';

    const activeCount = palette.filter(c => c.enabled).length;
    this.colorCountBadge.textContent = `${activeCount} / ${palette.length} цветов`;

    palette.forEach((color, index) => {
      const swatch = document.createElement('div');
      swatch.className = `swatch-item ${color.enabled ? '' : 'disabled'}`;
      swatch.style.backgroundColor = color.hex;
      swatch.title = `${color.hex} (RGB: ${color.r}, ${color.g}, ${color.b})\nЛКМ: Вкл/Выкл\nПКМ: Скопировать HEX`;

      // Left click: Toggle on/off
      swatch.addEventListener('click', (e) => {
        const updated = [...this.state.get('palette')];
        updated[index] = { ...updated[index], enabled: !updated[index].enabled };
        this.state.set('palette', updated);
      });

      // Right click: Copy HEX to clipboard
      swatch.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(color.hex);
          showToast(`Скопирован ${color.hex}`);
        }
      });

      this.swatchesContainer.appendChild(swatch);
    });
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}

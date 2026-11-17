const EFFECT_FILTERS = [
  { id: 'ALL', label: 'Tutti Tecnomat' },
  { id: 'Legno', label: 'Legno' },
  { id: 'Marmo', label: 'Marmo' },
  { id: 'Pietra', label: 'Pietra' },
  { id: 'Cemento', label: 'Cemento' },
  { id: 'Design e Monocolore', label: 'Design / Colore' },
  { id: 'Cotto e Mattone', label: 'Cotto / Mattone' },
  { id: 'Mosaico', label: 'Mosaico' },
  { id: 'PRESETS', label: 'Preset Base' },
];

const PAGE_STEP = 24;

export class CatalogSelector {
  constructor({
    mountEl,
    catalogItems,
    presets,
    textureLib,
    initialPreset,
    onApplyBundle,
    onSelectionChange,
  }) {
    this.mountEl = mountEl;
    this.catalogItems = catalogItems;
    this.presets = presets;
    this.textureLib = textureLib;
    this.onApplyBundle = onApplyBundle;
    this.onSelectionChange = onSelectionChange;

    this.bySku = new Map();
    for (const it of catalogItems) {
      this.bySku.set(String(it.sku), it);
    }

    this.query = '';
    this.effect = 'ALL';
    this.format = 'ALL';
    this.color = 'ALL';
    this.visibleLimit = PAGE_STEP;

    this.selectedKey = `preset:${initialPreset.id}`;
    this.loadingKey = null;
    this.rotated90 = false;
    this.currentBaseBundle = this.textureLib.getPresetBundle(initialPreset);
    this.activeMeta = {
      title: initialPreset.name,
      sub: initialPreset.subtitle,
      sku: null,
      url: null,
      thumb: this.currentBaseBundle.previewUrl,
    };

    this.formatsList = this.computeTopFormats();
    this.colorsList = this.computeTopColors();

    this.buildDOM();
    this.renderResults();
  }

  getSelectionSpec() {
    return {
      key: this.selectedKey,
      rotated90: this.rotated90,
    };
  }

  notifyChange() {
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectionSpec());
    }
  }

  syncOrientationPills() {
    if (!this.orientGroup) return;
    this.orientGroup.querySelectorAll('.pill-btn').forEach((b) => {
      const is90 = b.dataset.rot === '90';
      b.classList.toggle('active', is90 === this.rotated90);
    });
  }

  async applySelectionSpec(spec, { triggerApply = true } = {}) {
    if (!spec || !spec.key) return;
    this.rotated90 = Boolean(spec.rotated90);
    this.syncOrientationPills();

    if (spec.key.startsWith('preset:')) {
      const pid = spec.key.slice('preset:'.length);
      const preset = this.presets.find((p) => p.id === pid) || this.presets[0];
      const bundle = this.textureLib.getPresetBundle(preset);
      this.selectedKey = `preset:${preset.id}`;
      this.currentBaseBundle = bundle;
      this.activeMeta = {
        title: preset.name,
        sub: preset.subtitle,
        sku: null,
        url: null,
        thumb: bundle.previewUrl,
      };
      this.updateBanner();
      if (triggerApply) {
        this.onApplyBundle(
          this.textureLib.getOrientedBundle(this.currentBaseBundle, this.rotated90)
        );
      }
      this.renderResults();
      return;
    }

    if (spec.key.startsWith('tm:')) {
      const sku = spec.key.slice('tm:'.length);
      const item = this.bySku.get(String(sku));
      if (!item) return;
      try {
        const bundle = await this.textureLib.getTecnomatBundle(item);
        const thumbUrl = `/tecnomat-media/${item.pic}?width=220&quality=80`;
        this.selectedKey = `tm:${item.sku}`;
        this.currentBaseBundle = bundle;
        this.activeMeta = {
          title: item.title,
          sub: `${item.w}×${item.l} cm · ${item.effect} · ${item.finish}${item.rect ? ' · Rettificato' : ''}`,
          sku: item.sku,
          url: item.url,
          thumb: thumbUrl,
        };
        this.updateBanner();
        if (triggerApply) {
          this.onApplyBundle(
            this.textureLib.getOrientedBundle(this.currentBaseBundle, this.rotated90)
          );
        }
        this.renderResults();
      } catch (err) {
        console.warn('Impossibile ripristinare SKU salvato:', sku, err);
      }
    }
  }

  computeTopFormats() {
    const counts = new Map();
    for (const it of this.catalogItems) {
      const key = `${it.w}×${it.l}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 22)
      .map(([fmt, cnt]) => ({ fmt, cnt }));
  }

  computeTopColors() {
    const counts = new Map();
    for (const it of this.catalogItems) {
      if (!it.color) continue;
      counts.set(it.color, (counts.get(it.color) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([col, cnt]) => ({ col, cnt }));
  }

  buildDOM() {
    this.mountEl.innerHTML = `
      <div class="active-tile-banner">
        <div class="active-tile-thumb"></div>
        <div class="active-tile-info">
          <div class="active-tile-title"></div>
          <div class="active-tile-sub"></div>
          <div class="active-tile-links"></div>
        </div>
      </div>

      <div class="orientation-bar">
        <span class="sub-label-inline">Senso posa:</span>
        <div class="pill-group orient-pills">
          <button type="button" class="pill-btn active" data-rot="0">↔ Posa 0°</button>
          <button type="button" class="pill-btn" data-rot="90">↕ Ruota 90°</button>
        </div>
      </div>

      <div class="catalog-search-wrap">
        <input
          type="search"
          class="catalog-search-input"
          placeholder="Cerca tra ${this.catalogItems.length} gres Tecnomat (nome, SKU, serie)..."
          autocomplete="off"
        />
      </div>

      <div class="effect-chips"></div>

      <div class="catalog-filters-row">
        <select class="catalog-select fmt-select" aria-label="Filtra per formato">
          <option value="ALL">Tutti i formati (cm)</option>
          ${this.formatsList
            .map((f) => `<option value="${f.fmt}">${f.fmt} cm (${f.cnt})</option>`)
            .join('')}
        </select>
        <select class="catalog-select col-select" aria-label="Filtra per colore">
          <option value="ALL">Tutti i colori</option>
          ${this.colorsList
            .map((c) => `<option value="${c.col}">${c.col} (${c.cnt})</option>`)
            .join('')}
        </select>
      </div>

      <div class="catalog-count-bar">
        <span class="catalog-count-text"></span>
        <button type="button" class="catalog-reset-btn" style="display:none">Azzera filtri</button>
      </div>

      <div class="swatch-grid catalog-grid"></div>

      <button type="button" class="load-more-btn" style="display:none"></button>
    `;

    this.bannerThumb = this.mountEl.querySelector('.active-tile-thumb');
    this.bannerTitle = this.mountEl.querySelector('.active-tile-title');
    this.bannerSub = this.mountEl.querySelector('.active-tile-sub');
    this.bannerLinks = this.mountEl.querySelector('.active-tile-links');
    this.searchInput = this.mountEl.querySelector('.catalog-search-input');
    this.chipsContainer = this.mountEl.querySelector('.effect-chips');
    this.fmtSelect = this.mountEl.querySelector('.fmt-select');
    this.colSelect = this.mountEl.querySelector('.col-select');
    this.countText = this.mountEl.querySelector('.catalog-count-text');
    this.resetBtn = this.mountEl.querySelector('.catalog-reset-btn');
    this.gridEl = this.mountEl.querySelector('.catalog-grid');
    this.loadMoreBtn = this.mountEl.querySelector('.load-more-btn');
    this.orientGroup = this.mountEl.querySelector('.orient-pills');
    this.orientGroup.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextRot = btn.dataset.rot === '90';
        if (this.rotated90 === nextRot) return;
        this.rotated90 = nextRot;
        this.syncOrientationPills();
        this.updateBanner();
        if (this.currentBaseBundle) {
          this.onApplyBundle(
            this.textureLib.getOrientedBundle(this.currentBaseBundle, this.rotated90)
          );
        }
        this.notifyChange();
      });
    });

    EFFECT_FILTERS.forEach((ef) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `effect-chip ${ef.id === this.effect ? 'active' : ''}`;
      chip.dataset.effect = ef.id;
      chip.textContent = ef.label;
      chip.addEventListener('click', () => {
        this.effect = ef.id;
        this.visibleLimit = PAGE_STEP;
        this.chipsContainer.querySelectorAll('.effect-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.effect === this.effect);
        });
        const isPresets = this.effect === 'PRESETS';
        this.fmtSelect.disabled = isPresets;
        this.colSelect.disabled = isPresets;
        this.renderResults();
      });
      this.chipsContainer.appendChild(chip);
    });

    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value.trim().toLowerCase();
      if (this.query && this.effect === 'PRESETS') {
        this.effect = 'ALL';
        this.chipsContainer.querySelectorAll('.effect-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.effect === 'ALL');
        });
      }
      this.visibleLimit = PAGE_STEP;
      this.renderResults();
    });

    this.fmtSelect.addEventListener('change', () => {
      this.format = this.fmtSelect.value;
      this.visibleLimit = PAGE_STEP;
      this.renderResults();
    });

    this.colSelect.addEventListener('change', () => {
      this.color = this.colSelect.value;
      this.visibleLimit = PAGE_STEP;
      this.renderResults();
    });

    this.resetBtn.addEventListener('click', () => {
      this.query = '';
      this.effect = 'ALL';
      this.format = 'ALL';
      this.color = 'ALL';
      this.searchInput.value = '';
      this.fmtSelect.value = 'ALL';
      this.colSelect.value = 'ALL';
      this.fmtSelect.disabled = false;
      this.colSelect.disabled = false;
      this.visibleLimit = PAGE_STEP;
      this.chipsContainer.querySelectorAll('.effect-chip').forEach((c) => {
        c.classList.toggle('active', c.dataset.effect === 'ALL');
      });
      this.renderResults();
    });

    this.loadMoreBtn.addEventListener('click', () => {
      this.visibleLimit += PAGE_STEP;
      this.renderResults();
    });

    this.updateBanner();
  }

  updateBanner() {
    const m = this.activeMeta;
    this.bannerThumb.style.backgroundImage = `url('${m.thumb}')`;
    this.bannerThumb.style.transform = this.rotated90 ? 'rotate(90deg)' : 'none';
    this.bannerTitle.textContent = m.title;
    this.bannerSub.textContent = `${m.sub}${this.rotated90 ? ' · Ruotata 90°' : ''}`;
    if (m.sku && m.url) {
      this.bannerLinks.innerHTML = `
        <span class="sku-tag">SKU ${m.sku}</span>
        <a href="${m.url}" target="_blank" rel="noopener noreferrer" class="tm-ext-link">Scheda Tecnomat ↗</a>
      `;
    } else {
      this.bannerLinks.innerHTML = `<span class="sku-tag">Texture Procedurale 3D</span>`;
    }
  }

  getFilteredCatalog() {
    const terms = this.query ? this.query.split(/\s+/).filter(Boolean) : [];
    return this.catalogItems.filter((it) => {
      if (this.effect !== 'ALL' && it.effect !== this.effect) return false;
      if (this.format !== 'ALL' && `${it.w}×${it.l}` !== this.format) return false;
      if (this.color !== 'ALL' && it.color !== this.color) return false;
      if (terms.length > 0) {
        const hay = `${it.title} ${it.fullName} ${it.sku} ${it.effect} ${it.color} ${it.w}x${it.l}`.toLowerCase();
        for (const t of terms) {
          if (!hay.includes(t)) return false;
        }
      }
      return true;
    });
  }

  renderResults() {
    this.gridEl.innerHTML = '';

    const hasFilters =
      Boolean(this.query) ||
      (this.effect !== 'ALL' && this.effect !== 'PRESETS') ||
      this.format !== 'ALL' ||
      this.color !== 'ALL';
    this.resetBtn.style.display = hasFilters ? 'inline-block' : 'none';

    if (this.effect === 'PRESETS') {
      this.countText.textContent = `${this.presets.length} texture procedurali base`;
      this.loadMoreBtn.style.display = 'none';

      for (const preset of this.presets) {
        const key = `preset:${preset.id}`;
        const bundle = this.textureLib.getPresetBundle(preset);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `swatch-card ${this.selectedKey === key ? 'active' : ''}`;
        card.innerHTML = `
          <div class="swatch-thumb" style="background-image: url('${bundle.previewUrl}')"></div>
          <div class="swatch-title">${preset.name}</div>
          <div class="swatch-sub">${preset.subtitle}</div>
        `;
        card.addEventListener('click', () => {
          this.selectedKey = key;
          this.currentBaseBundle = bundle;
          this.activeMeta = {
            title: preset.name,
            sub: preset.subtitle,
            sku: null,
            url: null,
            thumb: bundle.previewUrl,
          };
          this.updateBanner();
          this.onApplyBundle(
            this.textureLib.getOrientedBundle(this.currentBaseBundle, this.rotated90)
          );
          this.notifyChange();
          this.renderResults();
        });
        this.gridEl.appendChild(card);
      }
      return;
    }

    const filtered = this.getFilteredCatalog();
    this.countText.textContent = `${filtered.length} di ${this.catalogItems.length} gres Tecnomat`;

    if (filtered.length === 0) {
      this.loadMoreBtn.style.display = 'none';
      this.gridEl.innerHTML = `
        <div class="empty-catalog-msg">
          Nessuna piastrella trovata con questi filtri.
        </div>
      `;
      return;
    }

    const slice = filtered.slice(0, this.visibleLimit);
    for (const item of slice) {
      const key = `tm:${item.sku}`;
      const thumbUrl = `/tecnomat-media/${item.pic}?width=220&quality=80`;
      const isSelected = this.selectedKey === key;
      const isLoading = this.loadingKey === key;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `swatch-card tm-card ${isSelected ? 'active' : ''} ${isLoading ? 'loading' : ''}`;
      card.dataset.sku = item.sku;
      card.innerHTML = `
        <div class="swatch-thumb tm-thumb-wrap">
          <img src="${thumbUrl}" alt="${item.title}" loading="lazy" />
          <span class="fmt-pill">${item.w}×${item.l}</span>
        </div>
        <div class="swatch-title" title="${item.fullName}">${item.title}</div>
        <div class="swatch-sub">${item.effect} · ${item.rect ? 'Rett.' : 'Nat.'} · SKU ${item.sku}</div>
      `;

      card.addEventListener('click', async () => {
        if (this.loadingKey === key) return;
        this.loadingKey = key;
        card.classList.add('loading');

        try {
          const bundle = await this.textureLib.getTecnomatBundle(item);
          this.selectedKey = key;
          this.loadingKey = null;
          this.currentBaseBundle = bundle;
          this.activeMeta = {
            title: item.title,
            sub: `${item.w}×${item.l} cm · ${item.effect} · ${item.finish}${item.rect ? ' · Rettificato' : ''}`,
            sku: item.sku,
            url: item.url,
            thumb: thumbUrl,
          };
          this.updateBanner();
          this.onApplyBundle(
            this.textureLib.getOrientedBundle(this.currentBaseBundle, this.rotated90)
          );
          this.notifyChange();
          this.renderResults();
        } catch (err) {
          console.error(err);
          this.loadingKey = null;
          card.classList.remove('loading');
        }
      });

      this.gridEl.appendChild(card);
    }

    if (filtered.length > this.visibleLimit) {
      const rem = filtered.length - this.visibleLimit;
      this.loadMoreBtn.style.display = 'block';
      this.loadMoreBtn.textContent = `Mostra altre piastrelle (+${Math.min(PAGE_STEP, rem)} di ${rem})`;
    } else {
      this.loadMoreBtn.style.display = 'none';
    }
  }
}

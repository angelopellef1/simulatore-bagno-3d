import { getCatalogItemKey, getCatalogItemThumbUrl } from './textures.js';

const BRAND_OPTIONS = [
  { id: 'ALL', label: 'Tutti i cataloghi', short: 'Tutti' },
  { id: 'tecnomat', label: 'Tecnomat', short: 'Tecnomat' },
  { id: 'baucer', label: 'Progetto Baucer', short: 'Baucer' },
  { id: 'armonie', label: 'Armonie Ceramiche', short: 'Armonie' },
  { id: 'iperceramica', label: 'Iperceramica', short: 'Iperceramica' },
  { id: 'PRESETS', label: 'Preset Procedurali Base', short: 'Preset 3D' },
];

const EFFECT_FILTERS = [
  { id: 'ALL', label: 'Tutti gli effetti' },
  { id: 'Legno', label: 'Legno' },
  { id: 'Marmo', label: 'Marmo' },
  { id: 'Pietra', label: 'Pietra' },
  { id: 'Cemento', label: 'Cemento' },
  { id: 'Design e Monocolore', label: 'Design / Colore' },
  { id: 'Cotto e Mattone', label: 'Cotto / Mattone' },
  { id: 'Mosaico', label: 'Mosaico' },
];

const BRAND_LABELS = {
  tecnomat: 'Tecnomat',
  baucer: 'Progetto Baucer',
  armonie: 'Armonie',
  iperceramica: 'Iperceramica',
};

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

    this.byKey = new Map();
    this.brandCounts = { tecnomat: 0, baucer: 0, armonie: 0, iperceramica: 0 };
    for (const it of catalogItems) {
      const b = it.brand || 'tecnomat';
      this.brandCounts[b] = (this.brandCounts[b] || 0) + 1;
      this.byKey.set(getCatalogItemKey(it), it);
    }

    this.brand = 'ALL';
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
      brandLabel: null,
      sku: null,
      url: null,
      thumb: this.currentBaseBundle.previewUrl,
    };

    this.buildDOM();
    this.refreshFacetDropdowns();
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
        brandLabel: null,
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

    const item = this.byKey.get(String(spec.key));
    if (!item) return;

    try {
      const bundle = await this.textureLib.getCatalogItemBundle(item);
      const thumbUrl = getCatalogItemThumbUrl(item);
      this.selectedKey = getCatalogItemKey(item);
      this.currentBaseBundle = bundle;
      this.activeMeta = {
        title: item.title,
        sub: `${item.w}×${item.l} cm · ${item.effect} · ${item.finish}${item.rect ? ' · Rettificato' : ''}`,
        brandLabel: item.brandLabel || BRAND_LABELS[item.brand || 'tecnomat'] || 'Catalogo',
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
      console.warn('Impossibile ripristinare piastrella salvata:', spec.key, err);
    }
  }

  getBrandScopedItems() {
    if (this.brand === 'PRESETS') return [];
    if (this.brand === 'ALL') return this.catalogItems;
    return this.catalogItems.filter((it) => (it.brand || 'tecnomat') === this.brand);
  }

  computeTopFormats(items) {
    const counts = new Map();
    for (const it of items) {
      const key = `${it.w}×${it.l}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([fmt, cnt]) => ({ fmt, cnt }));
  }

  computeTopColors(items) {
    const counts = new Map();
    for (const it of items) {
      if (!it.color) continue;
      counts.set(it.color, (counts.get(it.color) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([col, cnt]) => ({ col, cnt }));
  }

  refreshFacetDropdowns() {
    const scoped = this.getBrandScopedItems();
    const isPresets = this.brand === 'PRESETS';

    const formatsList = this.computeTopFormats(scoped);
    const colorsList = this.computeTopColors(scoped);

    if (this.format !== 'ALL' && !formatsList.some((f) => f.fmt === this.format)) {
      this.format = 'ALL';
    }
    if (this.color !== 'ALL' && !colorsList.some((c) => c.col === this.color)) {
      this.color = 'ALL';
    }

    this.fmtSelect.innerHTML =
      `<option value="ALL">Tutti i formati (cm)</option>` +
      formatsList.map((f) => `<option value="${f.fmt}">${f.fmt} cm (${f.cnt})</option>`).join('');
    this.fmtSelect.value = this.format;
    this.fmtSelect.disabled = isPresets;

    this.colSelect.innerHTML =
      `<option value="ALL">Tutti i colori</option>` +
      colorsList.map((c) => `<option value="${c.col}">${c.col} (${c.cnt})</option>`).join('');
    this.colSelect.value = this.color;
    this.colSelect.disabled = isPresets;

    if (isPresets) {
      this.searchInput.placeholder = 'Cerca piastrella (passa ai cataloghi)...';
    } else if (this.brand === 'ALL') {
      this.searchInput.placeholder = `Cerca tra ${scoped.length} gres (4 cataloghi)...`;
    } else {
      const bLabel = BRAND_OPTIONS.find((b) => b.id === this.brand)?.label || this.brand;
      this.searchInput.placeholder = `Cerca in ${bLabel} (${scoped.length} articoli)...`;
    }
  }

  setBrand(nextBrand) {
    this.brand = nextBrand;
    this.visibleLimit = PAGE_STEP;
    this.brandSelect.value = nextBrand;
    this.brandPills.querySelectorAll('.brand-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.brand === nextBrand);
    });
    this.refreshFacetDropdowns();
    this.renderResults();
  }

  buildDOM() {
    const countForBrand = (id) => {
      if (id === 'ALL') return this.catalogItems.length;
      if (id === 'PRESETS') return this.presets.length;
      return this.brandCounts[id] || 0;
    };

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

      <div class="brand-menu-box">
        <div class="brand-menu-row">
          <label class="sub-label-inline">Catalogo:</label>
          <select class="catalog-select brand-select" aria-label="Seleziona catalogo fornitore">
            ${BRAND_OPTIONS.map(
              (b) => `<option value="${b.id}">${b.label} (${countForBrand(b.id)})</option>`
            ).join('')}
          </select>
        </div>
        <div class="brand-pills">
          ${BRAND_OPTIONS.map(
            (b) =>
              `<button type="button" class="brand-pill ${b.id === this.brand ? 'active' : ''}" data-brand="${b.id}">${b.short}</button>`
          ).join('')}
        </div>
      </div>

      <div class="catalog-search-wrap">
        <input
          type="search"
          class="catalog-search-input"
          placeholder="Cerca piastrella per nome, collezione, SKU..."
          autocomplete="off"
        />
      </div>

      <div class="effect-chips"></div>

      <div class="catalog-filters-row">
        <select class="catalog-select fmt-select" aria-label="Filtra per formato"></select>
        <select class="catalog-select col-select" aria-label="Filtra per colore"></select>
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
    this.brandSelect = this.mountEl.querySelector('.brand-select');
    this.brandPills = this.mountEl.querySelector('.brand-pills');
    this.searchInput = this.mountEl.querySelector('.catalog-search-input');
    this.chipsContainer = this.mountEl.querySelector('.effect-chips');
    this.fmtSelect = this.mountEl.querySelector('.fmt-select');
    this.colSelect = this.mountEl.querySelector('.col-select');
    this.countText = this.mountEl.querySelector('.catalog-count-text');
    this.resetBtn = this.mountEl.querySelector('.catalog-reset-btn');
    this.gridEl = this.mountEl.querySelector('.catalog-grid');
    this.loadMoreBtn = this.mountEl.querySelector('.load-more-btn');
    this.orientGroup = this.mountEl.querySelector('.orient-pills');

    this.brandSelect.addEventListener('change', () => {
      this.setBrand(this.brandSelect.value);
    });

    this.brandPills.querySelectorAll('.brand-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        this.setBrand(pill.dataset.brand);
      });
    });

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
        if (this.brand === 'PRESETS') {
          this.setBrand('ALL');
        }
        this.visibleLimit = PAGE_STEP;
        this.chipsContainer.querySelectorAll('.effect-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.effect === this.effect);
        });
        this.renderResults();
      });
      this.chipsContainer.appendChild(chip);
    });

    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value.trim().toLowerCase();
      if (this.query && this.brand === 'PRESETS') {
        this.setBrand('ALL');
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
      this.chipsContainer.querySelectorAll('.effect-chip').forEach((c) => {
        c.classList.toggle('active', c.dataset.effect === 'ALL');
      });
      if (this.brand === 'PRESETS') {
        this.setBrand('ALL');
      } else {
        this.refreshFacetDropdowns();
        this.visibleLimit = PAGE_STEP;
        this.renderResults();
      }
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
      const bName = m.brandLabel || 'Catalogo';
      this.bannerLinks.innerHTML = `
        <span class="brand-tag">${bName}</span>
        <span class="sku-tag">SKU ${m.sku}</span>
        <a href="${m.url}" target="_blank" rel="noopener noreferrer" class="tm-ext-link">Scheda ${bName} ↗</a>
      `;
    } else {
      this.bannerLinks.innerHTML = `<span class="sku-tag">Texture Procedurale 3D</span>`;
    }
  }

  getFilteredCatalog() {
    const scoped = this.getBrandScopedItems();
    const terms = this.query ? this.query.split(/\s+/).filter(Boolean) : [];
    return scoped.filter((it) => {
      if (this.effect !== 'ALL' && it.effect !== this.effect) return false;
      if (this.format !== 'ALL' && `${it.w}×${it.l}` !== this.format) return false;
      if (this.color !== 'ALL' && it.color !== this.color) return false;
      if (terms.length > 0) {
        const hay = `${it.brandLabel || ''} ${it.series || ''} ${it.title} ${it.fullName} ${it.sku} ${it.effect} ${it.color} ${it.w}x${it.l}`.toLowerCase();
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
      this.effect !== 'ALL' ||
      this.format !== 'ALL' ||
      this.color !== 'ALL';
    this.resetBtn.style.display = hasFilters ? 'inline-block' : 'none';

    if (this.brand === 'PRESETS') {
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
            brandLabel: null,
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

    const scopedTotal = this.getBrandScopedItems().length;
    const filtered = this.getFilteredCatalog();
    const scopeName =
      this.brand === 'ALL'
        ? '4 cataloghi'
        : BRAND_OPTIONS.find((b) => b.id === this.brand)?.label || this.brand;
    this.countText.textContent = `${filtered.length} di ${scopedTotal} articoli (${scopeName})`;

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
      const key = getCatalogItemKey(item);
      const brandId = item.brand || 'tecnomat';
      const brandLabel = item.brandLabel || BRAND_LABELS[brandId] || 'Tecnomat';
      const shortBadge =
        brandId === 'baucer' ? 'Baucer' : brandId === 'iperceramica' ? 'Iperceramica' : brandLabel;
      const thumbUrl = getCatalogItemThumbUrl(item);
      const isSelected = this.selectedKey === key;
      const isLoading = this.loadingKey === key;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `swatch-card tm-card ${isSelected ? 'active' : ''} ${isLoading ? 'loading' : ''}`;
      card.dataset.sku = item.sku;
      card.dataset.brand = brandId;
      card.innerHTML = `
        <div class="swatch-thumb tm-thumb-wrap">
          <img src="${thumbUrl}" alt="${item.title}" loading="lazy" />
          <span class="brand-badge brand-${brandId}">${shortBadge}</span>
          <span class="fmt-pill">${item.w}×${item.l}</span>
        </div>
        <div class="swatch-title" title="${item.fullName}">${item.title}</div>
        <div class="swatch-sub">${item.effect} · ${item.rect ? 'Rett.' : 'Nat.'} · ${item.sku}</div>
      `;

      card.addEventListener('click', async () => {
        if (this.loadingKey === key) return;
        this.loadingKey = key;
        card.classList.add('loading');

        try {
          const bundle = await this.textureLib.getCatalogItemBundle(item);
          this.selectedKey = key;
          this.loadingKey = null;
          this.currentBaseBundle = bundle;
          this.activeMeta = {
            title: item.title,
            sub: `${item.w}×${item.l} cm · ${item.effect} · ${item.finish}${item.rect ? ' · Rettificato' : ''}`,
            brandLabel,
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

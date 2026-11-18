import fs from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchWithRetry(url, options = {}, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Accept: 'text/html,application/json,*/*;q=0.9',
          ...(options.headers || {}),
        },
      });
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

function encodePathSegments(relPath) {
  return String(relPath)
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join('/');
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function mapColorToItalian(rawColor) {
  const s = String(rawColor || '').toLowerCase();
  if (/white|bianco|blanc|calce|cotton|milk|crystal|ghiaccio|snow|pure bone|brick bone|bone|aria/.test(s)) return 'Bianco';
  if (/ivory|avorio|ivoire|cream|crema|vanilla|champagne|mandorla|almond/.test(s)) return 'Avorio';
  if (/beige|sand|sabbia|ecru|dune|camel|corda|nocciola|hazel|amber|miele|honey|caramel|dorato|gold/.test(s)) return 'Beige';
  if (/taupe|tortora|greige|fango|mud|rope|warm/.test(s)) return 'Tortora';
  if (/anthracite|antracite|dark|coal|piombo|grafite|graphite|charcoal|iron/.test(s)) return 'Antracite';
  if (/black|nero|noir|marquinia|saint laurent/.test(s)) return 'Nero';
  if (/grey|gray|grigio|silver|argento|cenere|ash|smoke|perla|pearl|ice|acciaio|titanio|cemento|stone|cloud|platino/.test(s)) return 'Grigio';
  if (/walnut|noce|brown|marrone|tabacco|nut|wood|mogano|castagno|oak|rovere|havana|terra|burn/.test(s)) return 'Marrone';
  if (/cotto|rust|terracotta|corallo|matton|brick|sunset|apricot|peach|arancio/.test(s)) return 'Terracotta';
  if (/green|verde|sage|salvia|mint|menta|bosco|forest|olive|avocado|acquamarine|ottanio|turchese/.test(s)) return 'Verde';
  if (/blue|blu|azzurro|ocean|navy|zaffiro|cobalto|cielo|sky|indigo|denim/.test(s)) return 'Blu';
  if (/pink|rosa|blush|cipria|peony|mauve|lilla|porpora|viola|bordeaux|rosso|red/.test(s)) return 'Rosa';
  if (/multi|mix|kaleido|decor|fior|botanic|jungle|forest|atelier/.test(s)) return 'Multicolore';
  return 'Naturale';
}

function mapEffect(rawEffect, extraText = '') {
  const s = `${rawEffect} ${extraText}`.toLowerCase();
  if (/mosaico|esagon|herringbone|losanga|muretto/.test(s)) return 'Mosaico';
  if (/legno|wood|rovere|larice|parquet|canazei|laguna|larix/.test(s)) return 'Legno';
  if (/marmo|marble|statuario|calacatta|onice|travertin|heritage|dolomite/.test(s)) return 'Marmo';
  if (/pietra|stone|ardesia|quarry|quasar|bernina|merano|kazane|nova|legend|origine|unika|vortex|atmosphere|hurricane/.test(s)) return 'Pietra';
  if (/cotto|matton|brick|terracotta/.test(s)) return 'Cotto e Mattone';
  if (/cement|concret|resina|clay|eternal|echo|work|oficina|brush/.test(s)) return 'Cemento';
  return 'Design e Monocolore';
}

function parseDimPair(str) {
  const m = String(str || '').match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 3 || b < 3 || a > 320 || b > 320) {
    return null;
  }
  return {
    w: Math.round(Math.min(a, b) * 10) / 10,
    l: Math.round(Math.max(a, b) * 10) / 10,
  };
}

// ============================================================================
// 1. EXTRACT PROGETTO BAUCER CATALOG (https://www.progettobaucer.it)
// ============================================================================
async function fetchProgettoBaucerCatalog() {
  console.log('--- Fetching Progetto Baucer collections ---');
  const indexUrl = 'https://www.progettobaucer.it/collezioni-progetto-baucer-pavimenti-rivestimenti';
  const indexHtml = await (await fetchWithRetry(indexUrl, { headers: { 'User-Agent': UA } })).text();
  const colPaths = [
    ...new Set(
      [...indexHtml.matchAll(/href=["'](\/collezioni-progetto-baucer-pavimenti-rivestimenti\/[^"']+)["']/gi)].map(
        (m) => m[1]
      )
    ),
  ];

  const items = [];
  const seenPics = new Set();

  for (const colPath of colPaths) {
    const colUrl = `https://www.progettobaucer.it${colPath}`;
    const html = await (await fetchWithRetry(colUrl, { headers: { 'User-Agent': UA } })).text();
    const colSlug = colPath.split('/').pop();
    const colIdNum = colSlug.split('-')[0];

    const seriesName = decodeHtmlEntities(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || colSlug);
    const rawEffect = decodeHtmlEntities(html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '');
    const subMaterial = decodeHtmlEntities(
      html.match(/<div class="col-12 text-center">\s*<h2>([\s\S]*?)<\/h2>/i)?.[1] || 'Gres porcellanato'
    );

    const pageFormats = [
      ...new Set([...html.matchAll(/<b>\s*(\d+(?:[.,]\d+)?\s*[xX×]\s*\d+(?:[.,]\d+)?)\s*<\/b>/g)].map((m) => m[1])),
    ];
    const defaultDim = parseDimPair(seriesName) || parseDimPair(pageFormats[0]) || { w: 60, l: 120 };

    // Each color block is <div class="col-lg-... lightbox"...>...</div>
    const blockRegex = /<div class="col-lg-\d+[^"]*lightbox"[^>]*>([\s\S]*?)<\/div>/gi;
    let bMatch;
    let idxInCol = 0;

    while ((bMatch = blockRegex.exec(html)) !== null) {
      const blockHtml = bMatch[1];
      const blockColorName = decodeHtmlEntities(
        blockHtml.match(/class="thumb-info-inner">([\s\S]*?)<\/span>/i)?.[1] || ''
      );

      const anchorRegex = /<a\s+([^>]+)>/gi;
      let aMatch;
      const blockEntries = [];
      while ((aMatch = anchorRegex.exec(blockHtml)) !== null) {
        const attrs = aMatch[1];
        const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
        if (!href || !href.startsWith('upload/colori/')) continue;

        const normHref = encodePathSegments(href);
        if (seenPics.has(normHref)) continue;
        seenPics.add(normHref);

        const titleAttr = decodeHtmlEntities(
          attrs.match(/data-caption=["']([^"']*)["']/i)?.[1] ||
            attrs.match(/title=["']([^"']*)["']/i)?.[1] ||
            ''
        );

        const dim = parseDimPair(titleAttr) || parseDimPair(href) || defaultDim;
        blockEntries.push({ href, normHref, titleAttr, dim });
      }

      // Sort formats from largest slab (e.g. 60x120, 60x60) to smallest brick (10x30)
      blockEntries.sort((a, b) => b.dim.w * b.dim.l - a.dim.w * a.dim.l);

      const cleanSeriesLabel = seriesName.replace(/\s+\d+\s*[xX×]\s*\d+\s*$/i, '').trim() || seriesName;

      for (const entry of blockEntries) {
        const { href, normHref, titleAttr, dim } = entry;
        const slashIdx = href.lastIndexOf('/');
        const thumbRaw =
          slashIdx > -1
            ? `${href.slice(0, slashIdx)}/thumbnail/${href.slice(slashIdx + 1)}`
            : href;
        const normThumb = encodePathSegments(thumbRaw);

        idxInCol++;
        const isR11 = /\br11\b|\bgrip\b|\bout\b/i.test(`${titleAttr} ${href}`);
        const isDecor = /decor|mosaico|muretto|fascia|inserto/i.test(`${blockColorName} ${titleAttr}`);
        const cleanVariant = blockColorName || titleAttr.replace(/\d+\s*[xX×]\s*\d+/g, '').trim() || 'Naturale';

        const effect =
          isDecor && /mosaico|muretto/i.test(`${blockColorName} ${titleAttr}`)
            ? 'Mosaico'
            : isDecor
            ? 'Design e Monocolore'
            : mapEffect(rawEffect, seriesName);

        const color = mapColorToItalian(`${cleanVariant} ${titleAttr}`);
        const sku = `PB-${colIdNum}-${idxInCol}`;
        const displayTitle = `${cleanSeriesLabel} — ${cleanVariant}${isR11 ? ' Grip R11' : ''} ${dim.w}×${dim.l} cm`.replace(
          /\s{2,}/g,
          ' '
        );
        const rect = dim.l >= 60 || /30x90/.test(`${dim.w}x${dim.l}`);

        items.push({
          brand: 'baucer',
          brandLabel: 'Progetto Baucer',
          sku,
          series: cleanSeriesLabel,
          title: displayTitle,
          fullName: `PROGETTO BAUCER ${cleanSeriesLabel.toUpperCase()} ${cleanVariant.toUpperCase()} ${dim.w}x${dim.l} cm ${subMaterial.toUpperCase()}`,
          effect,
          color,
          w: dim.w,
          l: dim.l,
          thick: 9,
          rect,
          finish: isR11 ? 'Strutturato R11' : /lucid|levigat/i.test(titleAttr + seriesName) ? 'Levigato Lucido' : 'Naturale Opaco',
          usage: 'Pavimento e Rivestimento',
          pic: normHref,
          thumbPic: normThumb,
          url: colUrl,
        });
      }
    }
    console.log(`  [Baucer] ${seriesName.padEnd(20)} -> cumulative ${items.length} tiles`);
  }

  return items;
}

// ============================================================================
// 2. EXTRACT ARMONIE CERAMICHE CATALOG (https://www.armonieceramiche.com)
// ============================================================================
const ARMONIE_COLLECTION_DEFAULTS = {
  prisma: { series: 'Prisma', w: 33.3, l: 100, effect: 'Design e Monocolore', finish: 'Satinato Opaco', rect: true },
  origine: { series: 'Origine', w: 60, l: 120, effect: 'Pietra', finish: 'Naturale Opaco', rect: true },
  'opus-origini': { series: 'Opus Origini', w: 40, l: 60, effect: 'Pietra', finish: 'Naturale Anticato', rect: false },
  'i-legni': { series: 'I Legni', w: 20, l: 120, effect: 'Legno', finish: 'Naturale Opaco', rect: true },
  unika: { series: 'Unika', w: 60, l: 120, effect: 'Pietra', finish: 'Naturale Opaco', rect: true },
  vortex: { series: 'Vortex', w: 60, l: 120, effect: 'Pietra', finish: 'Naturale Opaco', rect: true },
  atmosphere: { series: 'Atmosphere', w: 60, l: 120, effect: 'Pietra', finish: 'Naturale Opaco', rect: true },
  'brush-rivestimento': { series: 'Brush', w: 33.3, l: 100, effect: 'Cemento', finish: 'Satinato Opaco', rect: true },
  'collezione-deco-art': { series: 'Deco Art', w: 60, l: 120, effect: 'Design e Monocolore', finish: 'Satinato Decorato', rect: true },
  'collezione-work-pro': { series: 'Work Pro', w: 60, l: 120, effect: 'Cemento', finish: 'Naturale Opaco', rect: true },
  'work-rivestimento': { series: 'Work Rivestimento', w: 25, l: 85, effect: 'Cemento', finish: 'Satinato Opaco', rect: true },
  'collezione-hurricane': { series: 'Hurricane', w: 60, l: 120, effect: 'Pietra', finish: 'Naturale Opaco', rect: true },
  heritage: { series: 'Heritage', w: 60, l: 120, effect: 'Marmo', finish: 'Levigato / Matt', rect: true },
  'rivestimento-lucido-colors-collection': { series: 'Colors', w: 10, l: 30, effect: 'Design e Monocolore', finish: 'Smaltato Lucido', rect: false },
  loop: { series: 'Loop', w: 6.5, l: 26, effect: 'Design e Monocolore', finish: 'Smaltato Lucido', rect: false },
  'rivestimenti-bagni-cucine-piccadilly-collection': { series: 'Piccadilly', w: 20, l: 60, effect: 'Design e Monocolore', finish: 'Matt / Lucido', rect: false },
  'rivestimento-cucina-diamante-collection': { series: 'Diamante', w: 10, l: 30, effect: 'Design e Monocolore', finish: 'Smaltato Lucido', rect: false },
  'larix-gres-larice': { series: 'Larix', w: 20, l: 120, effect: 'Legno', finish: 'Naturale Opaco', rect: true },
  oficina: { series: 'Oficina', w: 60, l: 120, effect: 'Cemento', finish: 'Naturale Opaco', rect: true },
};

function extractArmonieItemsFromHtml(htmlChunk) {
  const results = [];
  const itemRegex = /<div class="portfolio-item\b[\s\S]*?<\/picture>[\s\S]*?<div class="caption">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = itemRegex.exec(htmlChunk)) !== null) {
    const block = m[0];
    const imgUrl =
      block.match(/data-tgpli-src=["'](https:\/\/www\.armonieceramiche\.com\/wp-content\/uploads\/[^"']+)["']/i)?.[1] ||
      block.match(/src=["'](https:\/\/www\.armonieceramiche\.com\/wp-content\/uploads\/[^"']+)["']/i)?.[1];
    const title = decodeHtmlEntities(
      block.match(/<div class="title[^"]*">\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
        block.match(/alt=["']([^"']+)["']/i)?.[1] ||
        ''
    );
    if (imgUrl && title) {
      results.push({ imgUrl, title });
    }
  }
  return results;
}

async function fetchArmonieCatalog() {
  console.log('--- Fetching Armonie Ceramiche collections ---');
  const prodHtml = await (await fetchWithRetry('https://www.armonieceramiche.com/prodotti/')).text();
  const discoveredUrls = [
    ...new Set(
      [...prodHtml.matchAll(/href=["'](https:\/\/www\.armonieceramiche\.com\/pavimenti-rivestimenti\/[^"']+)["']/gi)].map(
        (m) => m[1]
      )
    ),
  ];

  for (const slug of Object.keys(ARMONIE_COLLECTION_DEFAULTS)) {
    const u = `https://www.armonieceramiche.com/pavimenti-rivestimenti/${slug}/`;
    if (!discoveredUrls.includes(u)) discoveredUrls.push(u);
  }

  const items = [];
  const seenPics = new Set();

  for (const colUrl of discoveredUrls) {
    const slug = colUrl.replace(/\/+$/, '').split('/').pop();
    const defaults = ARMONIE_COLLECTION_DEFAULTS[slug] || {
      series: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      w: 60,
      l: 120,
      effect: 'Pietra',
      finish: 'Naturale Opaco',
      rect: true,
    };

    const html = await (await fetchWithRetry(colUrl)).text();
    const rawItems = [];

    // Use TheGem portfolio AJAX configs to retrieve ALL items (including page 2+)
    const ajaxMatches = [...html.matchAll(/var\s+(thegem_portfolio_ajax_\w+)\s*=\s*(\{[^\n]+?\});/g)];
    if (ajaxMatches.length > 0) {
      for (const am of ajaxMatches) {
        try {
          const parsed = JSON.parse(am[2]);
          const body = new URLSearchParams();
          body.set('action', parsed.action);
          body.set('nonce', parsed.nonce);
          body.set('data', JSON.stringify({ ...parsed.data, items_per_page: '100', paged: 1, is_ajax: 1 }));
          const r = await fetchWithRetry(parsed.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });
          const j = await r.json();
          if (j && j.html) {
            rawItems.push(...extractArmonieItemsFromHtml(j.html));
          }
        } catch (err) {
          console.warn(`  [Armonie] AJAX fallback on ${slug}:`, err.message);
        }
      }
    }

    // Fallback to static article HTML if AJAX returned nothing
    if (rawItems.length === 0) {
      const artIdx = html.indexOf('<article');
      rawItems.push(...extractArmonieItemsFromHtml(artIdx > -1 ? html.slice(artIdx) : html));
    }

    let idxInCol = 0;
    for (const raw of rawItems) {
      const relThumb = raw.imgUrl.replace(/^https?:\/\/www\.armonieceramiche\.com\/+/i, '');
      const relFull = relThumb.replace(/-thegem-product-[^./]+(?=\.\w+$)/i, '');
      const normThumb = encodePathSegments(relThumb);
      const normFull = encodePathSegments(relFull);

      if (seenPics.has(normThumb)) continue;
      seenPics.add(normThumb);

      idxInCol++;
      const lowerTitle = raw.title.toLowerCase();
      const lowerFile = relFull.toLowerCase();

      // Determine exact format per variant (e.g. mosaics 30x30, bricks 6x25, hexagons 20x23, or collection default)
      let dim = parseDimPair(raw.title) || parseDimPair(relFull.replace(/300x300|150x150|256x256|5x5/g, ''));
      if (!dim) {
        if (/mosaico|mosaic/.test(lowerTitle + lowerFile)) {
          dim = { w: 30, l: 30 };
        } else if (/esagono/.test(lowerTitle)) {
          dim = { w: 21, l: 24 };
        } else if (/brick|muretto/.test(lowerTitle)) {
          dim = { w: 7.5, l: 30 };
        } else if (/marmette/.test(lowerTitle)) {
          dim = { w: 20, l: 20 };
        } else {
          dim = { w: defaults.w, l: defaults.l };
        }
      }

      let effect = defaults.effect;
      if (/mosaico|esagono|muretto|herringbone/.test(lowerTitle)) {
        effect = 'Mosaico';
      } else if (/inserto|decor|struttura/.test(lowerTitle) && defaults.effect !== 'Legno') {
        effect = 'Design e Monocolore';
      }

      let finish = defaults.finish;
      if (/lucido|lux|levigat/.test(lowerTitle + lowerFile)) {
        finish = 'Lucido / Levigato';
      } else if (/matt\b/.test(lowerTitle + lowerFile)) {
        finish = 'Matt Opaco';
      }

      const sku = `ARM-${slug.slice(0, 12).toUpperCase()}-${idxInCol}`;
      const displayTitle = `${defaults.series} — ${raw.title} ${dim.w}×${dim.l} cm`;

      items.push({
        brand: 'armonie',
        brandLabel: 'Armonie',
        sku,
        series: defaults.series,
        title: displayTitle,
        fullName: `ARMONIE CERAMICHE ${defaults.series.toUpperCase()} ${raw.title.toUpperCase()} ${dim.w}x${dim.l} cm`,
        effect,
        color: mapColorToItalian(raw.title),
        w: dim.w,
        l: dim.l,
        thick: 9,
        rect: defaults.rect,
        finish,
        usage: 'Pavimento e Rivestimento',
        pic: normFull,
        thumbPic: normThumb,
        url: colUrl,
      });
    }

    console.log(`  [Armonie] ${defaults.series.padEnd(20)} -> cumulative ${items.length} tiles`);
  }

  return items;
}

async function main() {
  const baucerItems = await fetchProgettoBaucerCatalog();
  const armonieItems = await fetchArmonieCatalog();

  const baucerPath = path.resolve('public', 'baucer-catalog.json');
  await fs.writeFile(
    baucerPath,
    JSON.stringify({
      source: 'Progetto Baucer — Catalogo Pavimenti e Rivestimenti',
      fetchedAt: new Date().toISOString(),
      totalCount: baucerItems.length,
      items: baucerItems,
    }),
    'utf8'
  );

  const armoniePath = path.resolve('public', 'armonie-catalog.json');
  await fs.writeFile(
    armoniePath,
    JSON.stringify({
      source: 'Armonie Ceramiche — Catalogo Pavimenti e Rivestimenti',
      fetchedAt: new Date().toISOString(),
      totalCount: armonieItems.length,
      items: armonieItems,
    }),
    'utf8'
  );

  console.log(`\nSaved ${baucerItems.length} Progetto Baucer tiles -> ${baucerPath}`);
  console.log(`Saved ${armonieItems.length} Armonie tiles -> ${armoniePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

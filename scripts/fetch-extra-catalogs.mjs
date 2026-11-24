import fs from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchWithRetry(url, options = {}, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': UA,
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
  if (/white|bianco|blanc|calce|cotton|milk|crystal|ghiaccio|snow|bone|aria|gesso|talco|panna|alaska|niveo|statuario|calacatta/.test(s)) return 'Bianco';
  if (/ivory|avorio|ivoire|cream|crema|vanilla|champagne|mandorla|almond|ecru|perla|pearl|silk/.test(s)) return 'Avorio';
  if (/beige|sand|sabbia|dune|camel|corda|nocciola|hazel|amber|miele|honey|caramel|dorato|gold|travertin|desert|warm|grano|nudo/.test(s)) return 'Beige';
  if (/taupe|tortora|greige|fango|mud|rope|cashmere|clay|argilla|cappuccino|visone/.test(s)) return 'Tortora';
  if (/anthracite|antracite|dark|coal|piombo|grafite|graphite|charcoal|iron|fumo|ardesia|lava/.test(s)) return 'Antracite';
  if (/black|nero|noir|marquinia|saint laurent|st\.?\s*laurent|ebano|notte|obsidian/.test(s)) return 'Nero';
  if (/grey|gray|grigio|silver|argento|cenere|ash|smoke|ice|acciaio|titanio|cemento|stone|cloud|platino|silt|drift/.test(s)) return 'Grigio';
  if (/walnut|noce|brown|marrone|tabacco|nut|wood|mogano|castagno|oak|rovere|havana|terra|burn|bark|corteccia|moka|caffe|caffè|cacao/.test(s)) return 'Marrone';
  if (/cotto|rust|terracotta|corallo|matton|brick|sunset|apricot|peach|arancio|ruggine|ramato|copper|siena/.test(s)) return 'Terracotta';
  if (/green|verde|sage|salvia|mint|menta|bosco|forest|olive|oliva|avocado|acquamarine|ottanio|turchese|matcha|agave|giada|emerald|smeraldo|asparago|malachite|laguna/.test(s)) return 'Verde';
  if (/blue|blu|azzurro|ocean|oceano|navy|zaffiro|cobalto|cielo|sky|indigo|denim|avio|oltremare|petrolio|baltico/.test(s)) return 'Blu';
  if (/pink|rosa|blush|cipria|peony|mauve|lilla|porpora|viola|bordeaux|vino|rosso|red|hibiscus|petal/.test(s)) return 'Rosa';
  if (/multi|mix|kaleido|decor|fior|botanic|jungle|atelier|palladiana/.test(s)) return 'Multicolore';
  return 'Naturale';
}

function mapEffect(rawEffect, extraText = '') {
  const s = `${rawEffect} ${extraText}`.toLowerCase();
  if (/mosaico|mosaic|esagon|herringbone|losanga|muretto|palladiana|tessere|appiani/.test(s)) return 'Mosaico';
  if (/legno|wood|rovere|larice|parquet|lecci|roveri|plank|doghe|foresta|abete|frassino/.test(s)) return 'Legno';
  if (/marmo|marble|statuario|calacatta|onice|onyx|onyce|travertin|arabescato|marquinia|fior di bosco|portoro|breccia|palazzo|roma|tele di marmo|etoile|prexious|rex/.test(s)) return 'Marmo';
  if (/pietra|stone|ardesia|ardoise|quarry|quarzit|cep|porfido|basalt|granit|slate|roxstones|bloomstone|trav3rse|cava|petra|portland|fossil|falda|norway|elysian|glocal|restone|jurupa|norr|quarziti|silverlake/.test(s)) return 'Pietra';
  if (/cotto|matton|brick|terracotta|fornace|argilla|terrae|pieve|lore/.test(s)) return 'Cotto e Mattone';
  if (/cement|concret|resina|clay|metallo|metal|oxide|urban|industrial|work|concreta|materica|studio 50|reconcrete|indomita|alchemy/.test(s)) return 'Cemento';
  return 'Design e Monocolore';
}

function parseDimPair(str) {
  const m = String(str || '').match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1 || a > 340 || b > 340) {
    return null;
  }
  return {
    w: Math.round(Math.min(a, b) * 10) / 10,
    l: Math.round(Math.max(a, b) * 10) / 10,
  };
}

// ============================================================================
// 1. FLORIM (Rex, Casa dolce casa, Cerim, CEDIT, Florim Stone)
// ============================================================================
function mapFlorimSubBrand(rawBrand, seriesName) {
  const b = String(rawBrand || '').trim();
  if (/cedit/i.test(b)) return 'Florim · CEDIT';
  if (/florim\s*stone/i.test(b)) return 'Florim Stone';
  if (/luxury/i.test(b)) return 'Florim · Rex (Luxury)';
  if (/contemporary/i.test(b)) return 'Florim · Casa dolce casa';
  if (/creative/i.test(b)) return 'Florim · Cerim (Creative)';
  if (/architectural/i.test(b)) return 'Florim · Architectural';
  if (/skin/i.test(b)) return 'Florim Skin';
  return `Florim (${b || seriesName})`;
}

async function fetchFlorimCatalog() {
  console.log('\n=== 1. Fetching FLORIM catalog (Rex, Casa dolce casa, Cerim, CEDIT, Florim Stone) ===');
  const colRes = await fetchWithRetry(
    'https://www.florim.com/d/api/listing/?categoria_id=2&per_page=100&first_page_per_page=100&filtri_slug=|&lang=it&p=1'
  );
  const colJson = await colRes.json();
  const collectionsByTitle = new Map();
  for (const c of colJson.listing?.elementi || []) {
    collectionsByTitle.set(String(c.titolo || '').toLowerCase(), c);
  }

  const effectOrder = [
    { slug: 'marmo', mapped: 'Marmo' },
    { slug: 'pietra', mapped: 'Pietra' },
    { slug: 'legno', mapped: 'Legno' },
    { slug: 'cemento', mapped: 'Cemento' },
    { slug: 'terrazzo', mapped: 'Pietra' },
    { slug: 'metallo', mapped: 'Cemento' },
    { slug: 'tinta-unita', mapped: 'Design e Monocolore' },
    { slug: 'tessuto', mapped: 'Design e Monocolore' },
    { slug: 'affresco', mapped: 'Design e Monocolore' },
    { slug: 'pelle', mapped: 'Design e Monocolore' },
  ];

  const effectByPk = new Map();
  for (const ef of effectOrder) {
    try {
      const r = await fetchWithRetry(
        `https://www.florim.com/d/api/listing/?categoria_id=71&per_page=300&first_page_per_page=300&filtri_slug=${ef.slug}|&lang=it&p=1`
      );
      const j = await r.json();
      for (const el of j.listing?.elementi || []) {
        if (!effectByPk.has(el.pk)) {
          effectByPk.set(el.pk, ef.mapped);
        }
      }
    } catch (err) {
      console.warn('  [Florim] Effect query warning:', ef.slug, err.message);
    }
  }

  const allElements = [];
  const seenPks = new Set();
  for (let p = 1; p <= 8; p++) {
    const r = await fetchWithRetry(
      `https://www.florim.com/d/api/listing/?categoria_id=71&per_page=100&first_page_per_page=100&filtri_slug=|&lang=it&p=${p}`
    );
    const j = await r.json();
    const list = j.listing?.elementi || [];
    if (list.length === 0) break;
    for (const el of list) {
      if (!seenPks.has(el.pk)) {
        seenPks.add(el.pk);
        allElements.push(el);
      }
    }
    if (p >= (j.listing?.paginator?.num_pages || 1)) break;
  }

  const items = [];
  for (const el of allElements) {
    if (!el.immagine || !el.immagine.includes('florim-cdn.thron.com/')) continue;
    const relImg = el.immagine.replace(/^https?:\/\/florim-cdn\.thron\.com\/+/i, '');
    const series = decodeHtmlEntities(el.sottotitolo || 'Florim');
    const colorTitle = decodeHtmlEntities(el.titolo || el.slug || 'Naturale');
    const colInfo = collectionsByTitle.get(series.toLowerCase());
    const rawBrand = colInfo?.brand || el.brand || 'FLORIM';
    const subBrandLabel = mapFlorimSubBrand(rawBrand, series);

    const effect = effectByPk.get(el.pk) || mapEffect('', `${series} ${colorTitle} ${rawBrand}`);
    const dim =
      parseDimPair(colorTitle) ||
      (/florim\s*stone/i.test(rawBrand)
        ? { w: 160, l: 320 }
        : /cedit/i.test(rawBrand)
        ? { w: 120, l: 240 }
        : effect === 'Legno'
        ? { w: 20, l: 120 }
        : { w: 60, l: 120 });

    const sku = `FLR-${el.pk}`;
    items.push({
      brand: 'florim',
      brandLabel: subBrandLabel,
      sku,
      series,
      title: `${series} — ${colorTitle} ${dim.w}×${dim.l} cm`,
      fullName: `${subBrandLabel.toUpperCase()} Rex Casa dolce casa Cerim CEDIT Florim Stone ${series.toUpperCase()} ${colorTitle.toUpperCase()} ${dim.w}x${dim.l} cm`,
      effect,
      color: mapColorToItalian(`${colorTitle} ${series}`),
      w: dim.w,
      l: dim.l,
      thick: /florim\s*stone/i.test(rawBrand) ? 12 : 9,
      rect: true,
      finish: /glossy|lucid/i.test(colorTitle) ? 'Glossy Lucido' : 'Matte Naturale',
      usage: 'Pavimento e Rivestimento',
      pic: `${relImg}?w=720&q=85`,
      thumbPic: `${relImg}?w=260&q=80`,
      url: `https://www.florim.com${el.url}`,
    });
  }

  console.log(`  [Florim] Extracted ${items.length} tiles across all Florim sub-brands.`);
  return items;
}

// ============================================================================
// 2. MIRAGE (https://www.mirage.it/it)
// ============================================================================
async function fetchMirageCatalog() {
  console.log('\n=== 2. Fetching MIRAGE catalog ===');
  const indexRes = await fetchWithRetry('https://www.mirage.it/it/products/collections');
  const indexHtml = await indexRes.text();
  const slugs = [
    ...new Set([...indexHtml.matchAll(/\/it\/products\/collections\/([a-z0-9_-]+)/gi)].map((m) => m[1])),
  ];

  const items = [];
  const seenSrcs = new Set();

  for (const slug of slugs) {
    const colUrl = `https://www.mirage.it/it/products/collections/${slug}`;
    try {
      const res = await fetchWithRetry(colUrl);
      const html = await res.text();
      const nm = html.match(/id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (!nm) continue;
      const arr = JSON.parse(nm[1]);
      const pkey =
        html.match(/mirage-cdn\.thron\.com\/delivery\/public\/image\/mirage\/[a-f0-9-]+\/([a-z0-9]+)\/std/i)?.[1] ||
        '9pkhty';

      const rawTitle =
        decodeHtmlEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')
          .replace(/^Collezione\s+/i, '')
          .replace(/\s*\|\s*Mirage.*$/i, '')
          .trim() || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      let colCount = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (!v || typeof v !== 'object' || Array.isArray(v) || !('minimal' in v) || !('slug' in v)) {
          continue;
        }
        const itemSlug = typeof arr[v.slug] === 'string' ? arr[v.slug] : '';
        const minObj = arr[v.minimal];
        const minAsset = minObj && typeof minObj === 'object' ? arr[minObj.asset] : null;
        if (!minAsset || typeof minAsset !== 'object') continue;

        const srcUuid = typeof arr[minAsset.src] === 'string' ? arr[minAsset.src] : '';
        if (!srcUuid || !/^[a-f0-9-]{20,}$/i.test(srcUuid)) continue;
        if (seenSrcs.has(srcUuid)) continue;
        seenSrcs.add(srcUuid);

        const btnObj = arr[v.button];
        const btnTitle = btnObj && typeof btnObj === 'object' && typeof arr[btnObj.title] === 'string'
          ? arr[btnObj.title]
          : '';
        const altTitle = typeof arr[minAsset.alt] === 'string' ? arr[minAsset.alt] : '';
        const label = decodeHtmlEntities(btnTitle || altTitle || itemSlug)
          .replace(new RegExp(`^${rawTitle}\\s+`, 'i'), '')
          .trim();

        const ambObj = arr[v.ambient];
        const ambAsset = ambObj && typeof ambObj === 'object' ? arr[ambObj.asset] : null;
        const ambAlt = ambAsset && typeof ambAsset === 'object' && typeof arr[ambAsset.alt] === 'string'
          ? arr[ambAsset.alt]
          : '';

        const effect = mapEffect('', `${rawTitle} ${slug} ${label}`);
        const dim =
          parseDimPair(label) ||
          parseDimPair(ambAlt) ||
          (effect === 'Legno' ? { w: 20, l: 120 } : { w: 60, l: 120 });

        colCount++;
        const sku = `MIR-${slug.slice(0, 8).toUpperCase()}-${colCount}`;
        const pic = `delivery/public/image/mirage/${srcUuid}/${pkey}/std/756x0/${srcUuid}`;
        const thumbPic = `delivery/public/image/mirage/${srcUuid}/${pkey}/std/300x0/${srcUuid}`;

        items.push({
          brand: 'mirage',
          brandLabel: 'Mirage',
          sku,
          series: rawTitle,
          title: `${rawTitle} — ${label} ${dim.w}×${dim.l} cm`,
          fullName: `MIRAGE CERAMICHE ${rawTitle.toUpperCase()} ${label.toUpperCase()} ${dim.w}x${dim.l} cm`,
          effect,
          color: mapColorToItalian(`${label} ${rawTitle}`),
          w: dim.w,
          l: dim.l,
          thick: 9,
          rect: true,
          finish: /lucid|glossy|lux/i.test(label) ? 'Lucido / Lappato' : /saffiano|struttur|grip/i.test(label) ? 'Strutturato 3D' : 'Naturale Matt',
          usage: 'Pavimento e Rivestimento',
          pic,
          thumbPic,
          url: colUrl,
        });
      }
      console.log(`  [Mirage] ${rawTitle.padEnd(22)} -> +${colCount} (total ${items.length})`);
    } catch (err) {
      console.warn(`  [Mirage] Warning on ${slug}:`, err.message);
    }
  }

  return items;
}

// ============================================================================
// 3. CAESAR CERAMICHE (https://www.caesar.it/it/)
// ============================================================================
async function fetchCaesarCatalog() {
  console.log('\n=== 3. Fetching CAESAR CERAMICHE catalog (Algolia Global Index) ===');
  const hits = [];
  for (let page = 0; page < 5; page++) {
    const r = await fetchWithRetry(
      'https://LHJFWI4NSY-dsn.algolia.net/1/indexes/RicercaCaesarGlobal/query',
      {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': 'LHJFWI4NSY',
          'X-Algolia-API-Key': 'd812e9c34a3c9dd2df38b81b53c73afc',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: '', hitsPerPage: 500, page }),
      }
    );
    const j = await r.json();
    if (!j.hits || j.hits.length === 0) break;
    hits.push(...j.hits);
    if (page + 1 >= (j.nbPages || 1)) break;
  }

  const seenKeys = new Set();
  const items = [];

  for (const h of hits) {
    if (!h.immagine && !h.immagine_600) continue;
    const dim = parseDimPair(h.formato) || { w: 60, l: 120 };
    const series = decodeHtmlEntities(h.collezione || 'Caesar');
    const colorName = decodeHtmlEntities(h.prodotto || h.colore || 'Naturale');
    const finish = decodeHtmlEntities(h.finitura || 'Matt');
    const dedupKey = `${series}|${colorName}|${dim.w}x${dim.l}|${finish}`.toLowerCase();
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    const picRel = String(h.immagine_600 || h.immagine).replace(/^https?:\/\/www\.caesar\.it\/+/i, '');
    const thumbRel = String(h.immagine || h.immagine_600).replace(/^https?:\/\/www\.caesar\.it\/+/i, '');

    const effect = mapEffect(h.effetto || '', `${series} ${colorName}`);
    const sku = `CAE-${h.codformato || h.idprodotto || items.length + 1}`;

    items.push({
      brand: 'caesar',
      brandLabel: 'Caesar Ceramiche',
      sku,
      series,
      title: `${series} — ${colorName} (${finish}) ${dim.w}×${dim.l} cm`,
      fullName: `CAESAR CERAMICHE ${series.toUpperCase()} ${colorName.toUpperCase()} ${finish.toUpperCase()} ${dim.w}x${dim.l} cm ${h.codformato || ''}`,
      effect,
      color: mapColorToItalian(`${h.colore || ''} ${colorName}`),
      w: dim.w,
      l: dim.l,
      thick: parseFloat(h.spessore) || 9,
      rect: h.rettificato === 'RT' || dim.l >= 60,
      finish,
      usage: 'Pavimento e Rivestimento',
      pic: picRel,
      thumbPic: thumbRel,
      url: h.link || 'https://www.caesar.it/it/',
    });
  }

  console.log(`  [Caesar] Extracted ${items.length} tiles from ${hits.length} Algolia SKU records.`);
  return items;
}

// ============================================================================
// 4. FAP CERAMICHE (https://www.fapceramiche.com/it/)
// ============================================================================
async function fetchFapCatalog() {
  console.log('\n=== 4. Fetching FAP CERAMICHE catalog ===');
  const prodRes = await fetchWithRetry('https://www.fapceramiche.com/it/prodotti/');
  const prodHtml = await prodRes.text();
  const colPaths = [
    ...new Set([...prodHtml.matchAll(/href=["'](\/it\/prodotti\/[a-z0-9_-]+\/)["']/gi)].map((m) => m[1])),
  ].filter((p) => !/submenu|megamenu|ambiente|effetto/i.test(p));

  const items = [];
  const seenPics = new Set();

  for (const colPath of colPaths) {
    const colUrl = `https://www.fapceramiche.com${colPath}`;
    try {
      const res = await fetchWithRetry(colUrl);
      const html = await res.text();
      const slug = colPath.replace(/\/+$/, '').split('/').pop();
      const rawH1 = decodeHtmlEntities(
        html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') || slug
      )
        .replace(/porcelain\s*tiles|ceramic\s*tiles|wall\s*tiles|floor\s*tiles/gi, '')
        .trim();
      const series = rawH1
        ? rawH1.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
        : slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      const itemRegex = /<div class="cell color-item">([\s\S]*?)<\/a>\s*<\/div>/gi;
      let m;
      let colCount = 0;
      while ((m = itemRegex.exec(html)) !== null) {
        const block = m[1];
        const href = block.match(/href=["']([^"']+)["']/i)?.[1] || colPath;
        const imgSrc = block.match(/src=["'](\/media\/[^"']+)["']/i)?.[1];
        if (!imgSrc) continue;
        const relImg = imgSrc.replace(/^\/+/, '');
        if (seenPics.has(relImg)) continue;
        seenPics.add(relImg);

        const colorName = decodeHtmlEntities(
          block.match(/<h4>([\s\S]*?)<\/h4>/i)?.[1]?.replace(/<[^>]+>/g, '') ||
            block.match(/alt=["'][^"']*:\s*([^"']+)["']/i)?.[1] ||
            'Naturale'
        );

        const isWall = /rivestimento|wall/i.test(href);
        const dim =
          parseDimPair(relImg.replace(/1600x1600|600x600|305x915/g, '')) ||
          (relImg.includes('305x915') || slug.includes('305x915')
            ? { w: 30.5, l: 91.5 }
            : slug.includes('50x120')
            ? { w: 50, l: 120 }
            : slug.includes('80x160')
            ? { w: 80, l: 160 }
            : isWall
            ? { w: 50, l: 120 }
            : { w: 60, l: 120 });

        const effect = mapEffect('', `${series} ${slug} ${colorName} ${relImg}`);
        colCount++;
        const sku = `FAP-${slug.slice(0, 8).toUpperCase()}-${colCount}`;

        items.push({
          brand: 'fap',
          brandLabel: 'FAP Ceramiche',
          sku,
          series,
          title: `${series} — ${colorName} ${dim.w}×${dim.l} cm`,
          fullName: `FAP CERAMICHE ${series.toUpperCase()} ${colorName.toUpperCase()} ${dim.w}x${dim.l} cm`,
          effect,
          color: mapColorToItalian(`${colorName} ${series}`),
          w: dim.w,
          l: dim.l,
          thick: 9,
          rect: true,
          finish: /glossy|lucid|brillant|lux/i.test(`${series} ${colorName} ${relImg}`)
            ? 'Brillante Lucido'
            : 'Satinato / Matt',
          usage: isWall ? 'Rivestimento' : 'Pavimento e Rivestimento',
          pic: relImg,
          thumbPic: relImg,
          url: `https://www.fapceramiche.com${href}`,
        });
      }
      console.log(`  [FAP] ${series.padEnd(22)} -> +${colCount} (total ${items.length})`);
    } catch (err) {
      console.warn(`  [FAP] Warning on ${colPath}:`, err.message);
    }
  }

  return items;
}

// ============================================================================
// 5. GRUPPO BARDELLI (Ceramica Bardelli, Ceramica Vogue, Appiani)
// ============================================================================
async function fetchGruppoBardelliCatalog() {
  console.log('\n=== 5. Fetching GRUPPO BARDELLI catalog (Ceramica Bardelli, Ceramica Vogue, Appiani) ===');
  const items = [];
  const seenIds = new Set();

  for (let page = 1; page <= 6; page++) {
    const res = await fetchWithRetry(`https://www.gruppobardelli.com/products.json?limit=250&page=${page}`);
    const json = await res.json();
    const products = json.products || [];
    if (products.length === 0) break;

    for (const p of products) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);

      const imgObj = p.images?.[0];
      if (!imgObj || !imgObj.src) continue;

      const relBase = imgObj.src
        .replace(/^https?:\/\/cdn\.shopify\.com\/+/i, '')
        .replace(/\?.*$/, '');

      const rawVendor = String(p.vendor || 'Gruppo Bardelli').trim();
      let subBrand = 'Gruppo Bardelli';
      if (/vogue/i.test(rawVendor) || /flauti|trasparenze|graph|system|flooring/i.test(`${p.title} ${p.product_type}`)) {
        subBrand = 'Gruppo Bardelli · Ceramica Vogue';
      } else if (/appiani/i.test(rawVendor)) {
        subBrand = 'Gruppo Bardelli · Appiani';
      } else if (/bardelli/i.test(rawVendor)) {
        subBrand = 'Gruppo Bardelli · Ceramica Bardelli';
      }

      const series = decodeHtmlEntities(p.product_type || p.title.split(/[–-]/)[0] || 'Atelier').trim();
      const cleanTitle = decodeHtmlEntities(p.title || series);

      let dim = parseDimPair(`${cleanTitle} ${series}`);
      if (!dim) {
        if (/appiani/i.test(subBrand)) {
          dim = { w: 30, l: 30 };
        } else if (/flauti/i.test(cleanTitle)) {
          dim = { w: 5, l: 40 };
        } else {
          dim = { w: 20, l: 20 };
        }
      }

      const effect = /appiani/i.test(subBrand)
        ? 'Mosaico'
        : mapEffect('', `${series} ${cleanTitle} ${(p.tags || []).join(' ')}`);

      const sku = `GB-${p.id}`;
      items.push({
        brand: 'bardelli',
        brandLabel: subBrand,
        sku,
        series,
        title: `${cleanTitle} (${dim.w}×${dim.l} cm)`,
        fullName: `${subBrand.toUpperCase()} Ceramica Bardelli Ceramica Vogue Appiani ${series.toUpperCase()} ${cleanTitle.toUpperCase()} ${dim.w}x${dim.l} cm`,
        effect,
        color: mapColorToItalian(`${cleanTitle} ${series}`),
        w: dim.w,
        l: dim.l,
        thick: 8,
        rect: true,
        finish: /lucid|shine|trasparenze|glossy/i.test(`${cleanTitle} ${series}`)
          ? 'Smaltato Lucido'
          : 'Satinato / Matt',
        usage: 'Pavimento e Rivestimento',
        pic: `${relBase}?width=640`,
        thumbPic: `${relBase}?width=240`,
        url: `https://www.gruppobardelli.com/products/${p.handle}`,
      });
    }
  }

  console.log(`  [Gruppo Bardelli] Extracted ${items.length} tiles (Ceramica Bardelli, Ceramica Vogue, Appiani).`);
  return items;
}

// ============================================================================
// 6. SERENISSIMA CERAMICHE (https://www.serenissima.re.it/)
// ============================================================================
async function fetchSerenissimaCatalog() {
  console.log('\n=== 6. Fetching SERENISSIMA CERAMICHE catalog ===');
  const indexRes = await fetchWithRetry('https://www.serenissima.re.it/collezioni/');
  const indexHtml = await indexRes.text();
  const slugs = [
    ...new Set(
      [...indexHtml.matchAll(/https:\/\/www\.serenissima\.re\.it\/collezioni\/([a-z0-9_-]+)\//gi)].map((m) => m[1])
    ),
  ].filter((s) => s !== 'filtro');

  const items = [];
  const seenPics = new Set();

  for (const slug of slugs) {
    const colUrl = `https://www.serenissima.re.it/collezioni/${slug}/`;
    try {
      const res = await fetchWithRetry(colUrl);
      const html = await res.text();
      const series =
        decodeHtmlEntities(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') || slug).trim() ||
        slug.toUpperCase();

      const fmtBlock =
        html.match(/sommario-formati-sopra[\s\S]*?<div class=['"]elenco[^'"]*['"]>([\s\S]*?)<\/div>/i)?.[1] || '';
      const rawFmts = [...fmtBlock.matchAll(/<span>(\d+(?:[.,]\d+)?\s*[xX×]\s*\d+(?:[.,]\d+)?)<\/span>/g)].map(
        (m) => m[1]
      );
      const parsedFmts = rawFmts.map(parseDimPair).filter(Boolean);
      const preferredDim =
        parsedFmts.find((d) => (d.w === 60 && d.l === 120) || (d.w === 20 && d.l === 120)) ||
        parsedFmts[0] ||
        { w: 60, l: 120 };

      const taccaMatches = [
        ...html.matchAll(/sommario-colori[\s\S]*?<div class=['"]elenco[^'"]*['"]>([\s\S]*?)<\/div>/gi),
      ];
      const taccaUrls = taccaMatches[0]
        ? [...taccaMatches[0][1].matchAll(/url\((https:\/\/www\.serenissima\.re\.it\/wp-content\/uploads\/[^)]+)\)/gi)].map(
            (m) => m[1]
          )
        : [];

      const mainCutoff = html.indexOf('potrebbe interessarti');
      const mainHtml = mainCutoff > -1 ? html.slice(0, mainCutoff) : html;
      const extraTileUrls = [
        ...new Set(
          [
            ...mainHtml.matchAll(
              /https:\/\/www\.serenissima\.re\.it\/wp-content\/uploads\/[^"'\s)]+\.(?:jpg|jpeg|png)/gi
            ),
          ].map((m) => m[0])
        ),
      ].filter(
        (u) =>
          !/AMBIENT|principale|emozionale|poster|dettaglio|DETT_|STILL-LIFE|Serenissima_|for_|pz_|cerchio|logo|_z\.jpg/i.test(
            u
          ) && /tacca|tacche|_col\.jpg|Scaglie|MOSAICO|PALLADIANA|60x120|ROVERE-|ACANTO-[A-Z]+\.jpg/i.test(u)
      );

      const combinedUrls = [...new Set([...taccaUrls, ...extraTileUrls])];
      let colCount = 0;

      for (const fullUrl of combinedUrls) {
        const relPath = fullUrl.replace(/^https?:\/\/www\.serenissima\.re\.it\/+/i, '');
        if (seenPics.has(relPath)) continue;
        seenPics.add(relPath);

        const baseName = relPath
          .split('/')
          .pop()
          .replace(/\.(?:jpg|jpeg|png)+$/i, '')
          .replace(/^\d+_/, '')
          .replace(/^Serenissima[-_]/i, '')
          .replace(new RegExp(`^${slug.replace(/-/g, '[-_]')}[_-]?`, 'i'), '')
          .replace(new RegExp(`^${series.replace(/\s+/g, '[-_]')}[_-]?`, 'i'), '')
          .replace(/[_-]?tacca(?:-\d+)?$/i, '')
          .replace(/[_-]?tacche$/i, '')
          .replace(/[_-]?\d+[_-]?col$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim();

        const colorLabel = baseName
          ? baseName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
          : `Colore ${colCount + 1}`;

        const dim =
          parseDimPair(baseName) ||
          (/mosaico/i.test(baseName) ? { w: 30, l: 30 } : preferredDim);
        const effect = /mosaico|palladiana/i.test(baseName)
          ? 'Mosaico'
          : mapEffect('', `${series} ${slug} ${colorLabel}`);

        colCount++;
        const sku = `SER-${slug.slice(0, 8).toUpperCase()}-${colCount}`;

        items.push({
          brand: 'serenissima',
          brandLabel: 'Serenissima',
          sku,
          series,
          title: `${series} — ${colorLabel} ${dim.w}×${dim.l} cm`,
          fullName: `SERENISSIMA CERAMICHE ${series.toUpperCase()} ${colorLabel.toUpperCase()} ${dim.w}x${dim.l} cm`,
          effect,
          color: mapColorToItalian(`${colorLabel} ${series}`),
          w: dim.w,
          l: dim.l,
          thick: 9,
          rect: true,
          finish: /lux|lucid|silk/i.test(baseName) ? 'Silk / Levigato' : 'Naturale Rettificato',
          usage: 'Pavimento e Rivestimento',
          pic: relPath,
          thumbPic: relPath,
          url: colUrl,
        });
      }
      console.log(`  [Serenissima] ${series.padEnd(22)} -> +${colCount} (total ${items.length})`);
    } catch (err) {
      console.warn(`  [Serenissima] Warning on ${slug}:`, err.message);
    }
  }

  return items;
}

async function saveCatalogJson(filename, sourceTitle, items) {
  const outPath = path.resolve('public', filename);
  await fs.writeFile(
    outPath,
    JSON.stringify({
      source: sourceTitle,
      fetchedAt: new Date().toISOString(),
      totalCount: items.length,
      items,
    }),
    'utf8'
  );
  console.log(`Saved ${items.length} items -> ${outPath}`);
}

async function main() {
  const florim = await fetchFlorimCatalog();
  await saveCatalogJson('florim-catalog.json', 'Florim (Rex, Casa dolce casa, Cerim, CEDIT, Florim Stone)', florim);

  const mirage = await fetchMirageCatalog();
  await saveCatalogJson('mirage-catalog.json', 'Mirage Ceramiche — Collezione Gres Porcellanato', mirage);

  const caesar = await fetchCaesarCatalog();
  await saveCatalogJson('caesar-catalog.json', 'Caesar Ceramiche — Gres Porcellanato', caesar);

  const fap = await fetchFapCatalog();
  await saveCatalogJson('fap-catalog.json', 'FAP Ceramiche — Pavimenti e Rivestimenti', fap);

  const bardelli = await fetchGruppoBardelliCatalog();
  await saveCatalogJson('bardelli-catalog.json', 'Gruppo Bardelli (Ceramica Bardelli, Ceramica Vogue, Appiani)', bardelli);

  const serenissima = await fetchSerenissimaCatalog();
  await saveCatalogJson('serenissima-catalog.json', 'Serenissima Ceramiche — Collezioni Gres', serenissima);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

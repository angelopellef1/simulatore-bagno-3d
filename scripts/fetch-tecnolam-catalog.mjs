import fs from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function mapColor(text = '') {
  const s = text.toLowerCase();
  if (/white|bianco|statuario|calacatta|neve|ghiaccio|talco|panna|artico|perla|nordico|avorio/.test(s)) return 'Bianco';
  if (/beige|sabbia|crusca|travertin|coco|tan|oro|senese|domus/.test(s)) return 'Beige';
  if (/taupe|tortora|greige|fango|corda/.test(s)) return 'Tortora';
  if (/anthracite|antracite|piombo|grafite|tempesta|basalto|carbone/.test(s)) return 'Antracite';
  if (/black|nero|marquinia|notte/.test(s)) return 'Nero';
  if (/grey|gray|grigio|silver|argento|polvere|pietra grey|augusto/.test(s)) return 'Grigio';
  if (/brown|marrone|moro|moka|terra|tabacco|noce|legno/.test(s)) return 'Marrone';
  if (/cotto|corallo|ramato|ruggine|mattone/.test(s)) return 'Terracotta';
  if (/green|verde|sottobosco|bambu|bambù|clodia|salvia|malawi/.test(s)) return 'Verde';
  if (/blue|blu|avio|marino|oceano|levante/.test(s)) return 'Blu';
  if (/pink|rosa|cipria|soave|bella di notte|viola/.test(s)) return 'Rosa';
  if (/incanto|reverso|pixel|graffio/.test(s)) return 'Multicolore';
  return 'Naturale';
}

function mapEffect(seriesSlug, title = '') {
  const s = `${seriesSlug} ${title}`.toLowerCase();
  if (/marmi|statuario|calacatta|marquinia|travertin|venato|onice|patagonia|versaglia|alpina|artico|malawi|ramato/.test(s)) {
    return 'Marmo';
  }
  if (/basalto|pietra|geo|augusto/.test(s)) return 'Pietra';
  if (/matheria|malta|resine|cemento/.test(s)) return 'Cemento';
  if (/bambu|bambù|legno/.test(s)) return 'Legno';
  return 'Design e Monocolore';
}

function normalizeTechnolamPath(urlStr) {
  return String(urlStr || '')
    .replace(/^https?:\/\/(?:www\.)?technolam\.it\//i, '')
    .replace(/^\/+/, '');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log('Fetching Technolam series from WP REST API...');
  const serieList = await fetchJson('https://technolam.it/wp-json/wp/v2/serie?per_page=100');
  console.log(`Loaded ${serieList.length} Technolam series.`);

  const surfaces = [];
  const seenPics = new Set();

  const addSurface = (seriesName, seriesSlug, variantName, imgUrl, pageUrl) => {
    const pic = normalizeTechnolamPath(imgUrl);
    if (!pic || !/\.(?:jpg|jpeg|png|webp)$/i.test(pic)) return;
    if (/Logo|LineaTechnolam|flags|cropped|body-bg|traccia|favicon/i.test(pic)) return;
    const key = `${seriesSlug}:${variantName.toLowerCase()}`;
    if (seenPics.has(key)) return;
    seenPics.add(key);
    surfaces.push({
      seriesName,
      seriesSlug,
      variantName,
      pic,
      thumbPic: pic,
      url: pageUrl,
    });
  };

  // Curated high-res official Technolam slab textures from their WP media library + series pages
  const KNOWN_SWATCHES = [
    // Marmi Pregiati
    ['Marmi Pregiati', 'marmi-pregiati', 'Statuario', 'wp-content/uploads/2020/12/Statuario-1024x819.jpg', 'https://technolam.it/collezioni/marmi-pregiati-statutario/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Calacatta', 'wp-content/uploads/2020/12/Calacatta-1024x819.jpg', 'https://technolam.it/collezioni/marmi-pregiati-calacatta/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Venato Reale', 'wp-content/uploads/2020/12/Reale-1024x819.jpg', 'https://technolam.it/collezioni/marmi-pregiati-venato-reale/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Pietra Grey', 'wp-content/uploads/2020/12/PietraGrey-1024x819.jpg', 'https://technolam.it/collezioni/marmi-pregiati-pietra-grey/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Nero Marquinia', 'wp-content/uploads/2020/12/Marquinia-1024x819.jpg', 'https://technolam.it/collezioni/marmi-pregiati-nero-marquinia/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Travertino Classico', 'wp-content/uploads/2020/12/TravertinoClassico-1024x819.jpg', 'https://technolam.it/collezioni/marmi-pregiati-travertino/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Artico', 'wp-content/uploads/2026/04/Artico-1-scaled.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Calacatta Macchia Vecchia', 'wp-content/uploads/2025/03/LIVING_CALACATTA_MACCHIA_VECCHIA.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Patagonia', 'wp-content/uploads/2025/03/LIVING_PATAGONIA.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Perla Alpina', 'wp-content/uploads/2025/03/LIVING_PERLA_ALPINA.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Marmo di Versaglia', 'wp-content/uploads/2025/03/LIVING_MARMO_DI_VERSAGLIA.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Marmo Ramato', 'wp-content/uploads/2025/03/CUCINA_MARMO_RAMATO.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Travertino Senese', 'wp-content/uploads/2025/03/CAMERA_TRAVERTINO_SENESE.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Venato Marino', 'wp-content/uploads/2025/03/BAGNO_VENATO_MARINO.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    ['Marmi Pregiati', 'marmi-pregiati', 'Malawi', 'wp-content/uploads/2025/03/DOCCIA_MALAWI.jpg', 'https://technolam.it/serie/marmi-pregiati/'],
    // Resine
    ['Resine', 'resine', 'Avorio', 'wp-content/uploads/2020/11/Resina-avorio-scaled.jpg', 'https://technolam.it/serie/resine/'],
    ['Resine', 'resine', 'Piombo', 'wp-content/uploads/2020/11/Resina-piombo-scaled.jpg', 'https://technolam.it/serie/resine/'],
    ['Resine', 'resine', 'Talco', 'wp-content/uploads/2020/11/Resina-talco-scaled.jpg', 'https://technolam.it/serie/resine/'],
    ['Resine', 'resine', 'Tortora', 'wp-content/uploads/2020/11/Resina-tortora-scaled.jpg', 'https://technolam.it/serie/resine/'],
    ['Resine', 'resine', 'Moka', 'wp-content/uploads/2020/11/RESINE_MOKA-2.jpg', 'https://technolam.it/serie/resine/'],
    // Matheria
    ['Matheria', 'matheria', 'Tortora', 'wp-content/uploads/2020/11/Matheria-tortora-scaled.jpg', 'https://technolam.it/serie/matheria/'],
    ['Matheria', 'matheria', 'Piombo', 'wp-content/uploads/2020/11/Matheria-piombo-scaled.jpg', 'https://technolam.it/serie/matheria/'],
    ['Matheria', 'matheria', 'Silver', 'wp-content/uploads/2020/11/Matheria-silver-scaled.jpg', 'https://technolam.it/serie/matheria/'],
    ['Matheria', 'matheria', 'Panna', 'wp-content/uploads/2020/11/Matheria-panna-scaled.jpg', 'https://technolam.it/serie/matheria/'],
    ['Matheria', 'matheria', 'Moka', 'wp-content/uploads/2020/11/MATHERIA_MOKA.jpg', 'https://technolam.it/serie/matheria/'],
    // Malta
    ['Malta', 'malta', 'Coco', 'wp-content/uploads/2020/11/Malta-coco-scaled.jpg', 'https://technolam.it/serie/malta/'],
    ['Malta', 'malta', 'Nordico', 'wp-content/uploads/2020/11/Malta-nordico-scaled.jpg', 'https://technolam.it/serie/malta/'],
    ['Malta', 'malta', 'Piombo', 'wp-content/uploads/2020/11/Malta-piombo-scaled.jpg', 'https://technolam.it/serie/malta/'],
    ['Malta', 'malta', 'Tan', 'wp-content/uploads/2020/11/Malta-tan-scaled.jpg', 'https://technolam.it/serie/malta/'],
    ['Malta', 'malta', 'Avio', 'wp-content/uploads/2020/11/Malta-avio-scaled.jpg', 'https://technolam.it/serie/malta/'],
    ['Malta', 'malta', 'Cotto', 'wp-content/uploads/2025/03/MALTA_COTTO.jpg', 'https://technolam.it/serie/malta/'],
    // Geo
    ['Geo', 'geo', 'Ghiaccio', 'wp-content/uploads/2020/11/Geo-ghiaccio-scaled.jpg', 'https://technolam.it/serie/geo/'],
    ['Geo', 'geo', 'Polvere', 'wp-content/uploads/2020/11/Geo-polvere-scaled.jpg', 'https://technolam.it/serie/geo/'],
    ['Geo', 'geo', 'Tempesta', 'wp-content/uploads/2022/05/Geo-Tempesta-.png', 'https://technolam.it/serie/geo/'],
    ['Geo', 'geo', 'Grafite', 'wp-content/uploads/2020/11/Geo-grafite-scaled.jpg', 'https://technolam.it/serie/geo/'],
    ['Geo', 'geo', 'Terra', 'wp-content/uploads/2022/05/GEO-TERRA.png', 'https://technolam.it/serie/geo/'],
    ['Geo', 'geo', 'Sottobosco', 'wp-content/uploads/2022/05/GEO-SOTTOBOSCO-1.png', 'https://technolam.it/serie/geo/'],
    // Basic
    ['Basic', 'basic', 'Neve', 'wp-content/uploads/2020/11/Basic-neve-scaled.jpg', 'https://technolam.it/serie/basic/'],
    ['Basic', 'basic', 'Avorio', 'wp-content/uploads/2020/11/Basic-avorio-scaled.jpg', 'https://technolam.it/serie/basic/'],
    ['Basic', 'basic', 'Crusca', 'wp-content/uploads/2020/11/Basic-crusca-scaled.jpg', 'https://technolam.it/serie/basic/'],
    ['Basic', 'basic', 'Tortora', 'wp-content/uploads/2020/11/Basic-tortora-scaled.jpg', 'https://technolam.it/serie/basic/'],
    ['Basic', 'basic', 'Moro', 'wp-content/uploads/2020/11/Basic-moro-scaled.jpg', 'https://technolam.it/serie/basic/'],
    ['Basic', 'basic', 'Bianco Puro', 'wp-content/uploads/2020/11/Basic-bianco-puro-scaled.jpg', 'https://technolam.it/serie/basic/'],
    // Basalto
    ['Basalto', 'basalto', 'Perla', 'wp-content/uploads/2020/11/Basalto-perla-1-scaled.jpg', 'https://technolam.it/serie/basalto/'],
    ['Basalto', 'basalto', 'Nero', 'wp-content/uploads/2020/11/Basalto-nero-1-scaled.jpg', 'https://technolam.it/serie/basalto/'],
    // Pixel
    ['Pixel', 'pixel', 'Argento', 'wp-content/uploads/2020/11/Pixel-argento-scaled.jpg', 'https://technolam.it/serie/pixel/'],
    ['Pixel', 'pixel', 'Bianco', 'wp-content/uploads/2020/11/Pixel-bianco-scaled.jpg', 'https://technolam.it/serie/pixel/'],
    ['Pixel', 'pixel', 'Corallo', 'wp-content/uploads/2020/11/Pixel-corallo-scaled.jpg', 'https://technolam.it/serie/pixel/'],
    ['Pixel', 'pixel', 'Nero', 'wp-content/uploads/2020/11/Pixel-nero-scaled.jpg', 'https://technolam.it/serie/pixel/'],
    ['Pixel', 'pixel', 'Oro', 'wp-content/uploads/2020/11/Pixel-oro-scaled.jpg', 'https://technolam.it/serie/pixel/'],
  ];

  for (const [sName, sSlug, vName, pic, url] of KNOWN_SWATCHES) {
    addSurface(sName, sSlug, vName, pic, url);
  }

  // Also extract moodboard & decorative surfaces from all 17 series in WP REST API
  for (const s of serieList) {
    const sName = s.title?.rendered?.trim() || s.slug;
    const content = s.content?.rendered || '';
    const imgs = [
      ...new Set(
        [
          ...content.matchAll(
            /https?:\/\/(?:www\.)?technolam\.it\/wp-content\/uploads\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi
          ),
        ].map((m) => m[0])
      ),
    ].filter(
      (u) =>
        !/Logo|LineaTechnolam|flags|cropped|body-bg|traccia|elementor\/thumbs|-\d+x\d+\./i.test(u)
    );

    for (const imgUrl of imgs) {
      const base = path
        .basename(imgUrl)
        .replace(/\.(?:jpg|jpeg|png|webp)$/i, '')
        .replace(/-scaled$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (/schizzo|visual/i.test(base)) continue;
      addSurface(sName, s.slug, base, imgUrl, s.link);
    }
  }

  console.log(`Collected ${surfaces.length} distinct Technolam surfaces.`);

  // Technolam official slab & sub-formats (from technolam.it/serie/basic/: 100x300, 100x100, 50x100, 60x120, 120x120, 120x240)
  const FORMATS = [
    { w: 50, l: 100, thick: 5 },
    { w: 60, l: 120, thick: 6 },
    { w: 100, l: 100, thick: 5 },
    { w: 120, l: 120, thick: 6 },
    { w: 100, l: 300, thick: 5 },
  ];

  const items = [];
  for (const surf of surfaces) {
    const effect = mapEffect(surf.seriesSlug, surf.variantName);
    const color = mapColor(`${surf.seriesName} ${surf.variantName}`);
    const cleanVariant = surf.variantName
      .replace(new RegExp(`^${surf.seriesName}\\s*`, 'i'), '')
      .trim() || surf.variantName;
    const codeBase = `${surf.seriesSlug}-${cleanVariant}`
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    for (const fmt of FORMATS) {
      const sku = `TLM-${codeBase}-${fmt.w}X${fmt.l}`;
      items.push({
        brand: 'tecnolam',
        brandLabel: 'Technolam',
        sku,
        series: surf.seriesName,
        title: `${surf.seriesName} — ${cleanVariant} ${fmt.w}×${fmt.l} cm`,
        fullName: `TECHNOLAM ${surf.seriesName.toUpperCase()} ${cleanVariant.toUpperCase()} ${fmt.w}x${fmt.l} cm`,
        effect,
        color,
        w: fmt.w,
        l: fmt.l,
        thick: fmt.thick,
        rect: true,
        finish: 'Lastra Ceramica Naturale',
        usage: 'Pavimento e Rivestimento',
        pic: surf.pic,
        thumbPic: surf.thumbPic,
        url: surf.url,
      });
    }
  }

  if (items.length > 0) {
    const testUrl = `https://technolam.it/${items[0].pic}`;
    const tr = await fetch(testUrl, { method: 'HEAD', headers: { 'User-Agent': UA } });
    console.log('Sample Technolam image check:', testUrl, '->', tr.status);
  }

  const out = {
    source: 'Technolam — Superfici e Lastre Ceramiche',
    fetchedAt: new Date().toISOString(),
    totalCount: items.length,
    items,
  };

  const outPath = path.resolve('public/tecnolam-catalog.json');
  await fs.writeFile(outPath, JSON.stringify(out), 'utf8');
  console.log(`Saved ${items.length} items to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

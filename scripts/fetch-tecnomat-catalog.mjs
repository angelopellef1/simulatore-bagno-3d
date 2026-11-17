import fs from 'node:fs/promises';
import path from 'node:path';

const TYPESENSE_URL =
  'https://eap1gtvsjbd4xhiyp.a1.typesense.net/multi_search?x-typesense-api-key=BB2uGetxL9CCej15O4hdDoXJav6pT8lW';

const EXCLUDED_PRODUCT_TYPES = new Set([
  'Piastrella battiscopa',
  'Piastrella a L',
  'Piastrella coprigradino per scale',
]);

function parseNumberCm(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(',', '.'));
  return Number.isFinite(n) && n > 2 && n <= 320 ? n : null;
}

function parseDimsFromName(name) {
  // Match e.g. 60x120, 20,5x61,5, 30X60
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return { w: 60, l: 60 };
  const a = parseNumberCm(m[1]) || 60;
  const b = parseNumberCm(m[2]) || 60;
  return { w: Math.min(a, b), l: Math.max(a, b) };
}

function inferEffect(doc) {
  const cats = (doc.categories_without_path || []).join(' ').toLowerCase();
  const rawEff = String(doc.att_14428 || '').toLowerCase();
  const nm = String(doc.name || '').toLowerCase();

  if (doc.att_22088 === 'Mosaico' || cats.includes('mosaici') || nm.includes('mosaico')) {
    return 'Mosaico';
  }
  if (cats.includes('legno') || rawEff.includes('legno') || rawEff.includes('parquet')) {
    return 'Legno';
  }
  if (cats.includes('marmo') || rawEff.includes('marmo') || nm.includes('calacatta') || nm.includes('statuario') || nm.includes('marquinia') || nm.includes('onice')) {
    return 'Marmo';
  }
  if (cats.includes('pietra') || rawEff.includes('pietra') || nm.includes('ardesia') || nm.includes('travertino') || nm.includes('quarzite')) {
    return 'Pietra';
  }
  if (cats.includes('cemento') || rawEff.includes('cemento') || rawEff.includes('resina') || rawEff.includes('beton')) {
    return 'Cemento';
  }
  if (cats.includes('cotto') || cats.includes('matton') || rawEff.includes('cotto') || rawEff.includes('matton') || nm.includes('cotto')) {
    return 'Cotto e Mattone';
  }
  return 'Design e Monocolore';
}

function formatCleanTitle(rawName) {
  let s = String(rawName || '').trim();
  s = s
    .replace(/^PAVIMENTO\s+(INTERNO\/ESTERNO|INTERNO|ESTERNO)\s+/i, '')
    .replace(/^RIVESTIMENTO\s+(INTERNO\/ESTERNO|INTERNO|MURALE|BAGNO|MURO)?\s*/i, '')
    .replace(/^PIASTRELLA\s+/i, '')
    .replace(/\bGRES\s+PORCELLANATO(\s+SMALTATO)?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s
    .toLowerCase()
    .replace(/(^|\s)\S/g, (ch) => ch.toUpperCase())
    .replace(/\bCm\b/g, 'cm')
    .replace(/\bMm\b/g, 'mm')
    .replace(/\bRett\b/gi, 'Rett.')
    .replace(/\bR(\d+)\b/gi, 'R$1');
}

async function main() {
  const rawDocs = [];
  let page = 1;

  const filterBy =
    '(att_10840:=`Gres porcellanato` || categories_without_path:[`Pavimenti in gres porcellanato`, `Gres porcellanato effetto legno`, `Gres porcellanato effetto marmo`, `Gres porcellanato effetto cemento`, `Gres porcellanato effetto pietra`, `Gres porcellanato effetto cotto e mattone`, `Gres porcellanato altri effetti`, `Gres porcellanato per esterni`, `Gres porcellanato spessore 20 mm`, `Mosaici in gres porcellanato`, `Lastre e grandi formati`]) && $tm_prod_products_offers_1_135(id:*)';

  while (true) {
    const res = await fetch(TYPESENSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        searches: [
          {
            collection: 'tm_prod_products_catalog_1',
            q: '*',
            filter_by: filterBy,
            sort_by: '$tm_prod_products_offers_1_135(ordered_qty:desc)',
            include_fields:
              'sku,name,picture,url,att_00053,att_00256,att_00596,att_01746,att_05209,att_06428,att_10840,att_10842,att_12515,att_14428,att_22088,categories_without_path,smart_capacity_quantity,smart_capacity_unit_code,$tm_prod_products_offers_1_135(price,in_stock,ordered_qty)',
            per_page: 250,
            page,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Typesense HTTP ${res.status}`);
    }
    const json = await res.json();
    const r = json.results[0];
    if (r.error) {
      throw new Error(`Typesense error: ${r.error}`);
    }
    const hits = r.hits || [];
    for (const h of hits) rawDocs.push(h.document);
    console.log(`Fetched page ${page}: +${hits.length} (total ${rawDocs.length}/${r.found})`);
    if (rawDocs.length >= r.found || hits.length === 0) break;
    page++;
  }

  const seenSkus = new Set();
  const catalog = [];

  for (const d of rawDocs) {
    if (!d.sku || !d.picture || seenSkus.has(d.sku)) continue;
    if (EXCLUDED_PRODUCT_TYPES.has(d.att_22088)) continue;

    const cats = (d.categories_without_path || []).join(' ');
    if (cats.includes('Battiscopa') || cats.includes('mobili bagno') || cats.includes('scale e gradini')) {
      continue;
    }
    if (/^BATTISCOPA\b|^GRADINO\b|^ANGOLARE\b/i.test(d.name || '')) {
      continue;
    }
    if (d.att_10840 && d.att_10840 !== 'Gres porcellanato') {
      continue;
    }

    const allFaces = String(d.picture)
      .split(',')
      .map((p) => p.trim().replace(/^\/+/, ''))
      .filter(Boolean);
    if (allFaces.length === 0) continue;

    seenSkus.add(d.sku);

    const parsed = parseDimsFromName(d.name || '');
    const wRaw = parseNumberCm(d.att_00053) || parsed.w;
    const lRaw = parseNumberCm(d.att_00256) || parsed.l;
    const w = Math.round(Math.min(wRaw, lRaw) * 10) / 10;
    const l = Math.round(Math.max(wRaw, lRaw) * 10) / 10;

    const finishParts = [d.att_12515, d.att_10842].filter(Boolean).join(' · ');
    const rect = String(d.att_06428 || '').toLowerCase() === 'rettificato';
    const effect = inferEffect(d);
    const color = String(d.att_01746 || 'Naturale').split(',')[0].trim();
    const usage = String(d.att_05209 || 'Pavimento e Rivestimento');

    const offer = d.tm_prod_products_offers_1_135;
    const packEur = offer?.price?.EUR?.default || 0;
    const capMq = parseFloat(String(d.smart_capacity_quantity || '0').replace(',', '.'));
    let priceMq = null;
    if (packEur > 0 && d.smart_capacity_unit_code === 'MTK' && capMq > 0) {
      priceMq = Math.round((packEur / capMq) * 100) / 100;
    } else if (packEur > 0) {
      priceMq = Math.round(packEur * 100) / 100;
    }

    catalog.push({
      sku: String(d.sku),
      title: formatCleanTitle(d.name),
      fullName: String(d.name || ''),
      effect,
      color,
      w,
      l,
      thick: parseNumberCm(d.att_00596) || 9,
      rect,
      finish: finishParts || 'Naturale',
      usage,
      pic: allFaces[0],
      faces: allFaces.length > 1 ? allFaces.slice(0, 4) : undefined,
      url: String(d.url || `https://www.tecnomat.it/it/search/?q=${d.sku}`),
      priceMq,
    });
  }

  const outPath = path.resolve('public', 'tecnomat-gres-catalog.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({
      source: 'Tecnomat Italia — Catalogo Gres Porcellanato',
      fetchedAt: new Date().toISOString(),
      totalCount: catalog.length,
      items: catalog,
    }),
    'utf8'
  );

  const stats = await fs.stat(outPath);
  const byEffect = {};
  for (const item of catalog) {
    byEffect[item.effect] = (byEffect[item.effect] || 0) + 1;
  }
  console.log(`Saved ${catalog.length} Tecnomat Gres Porcellanato tiles to ${outPath} (${Math.round(stats.size / 1024)} KB)`);
  console.log('Breakdown by effect:', byEffect);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const QUERY = `query Query(
  $page: Int
  $sort_by: String
  $perPage: Int
  $category_id: Int!
  $totalRecords: Int!
  $filters: String
) {
  GetProductsFromCategory(
    page: $page
    sort_by: $sort_by
    perPage: $perPage
    category_id: $category_id
    totalRecords: $totalRecords
    filters: $filters
  ) {
    total
    totalPage
    items {
      product_id
      product_arc_id
      product_name
      product_sku
      product_url
      product_readyId
      product_codeWeb
      product_nameWeb
      product_ready_nameWeb
      pictures {
        picture_id
        picture_name
        picture_order
      }
      price {
        old_price
        new_discount
        final_price
      }
    }
  }
}`;

function buildDeghiImgPath(size, readyId, urlSlug, order = 1, ext = 'webp') {
  const cleanSlug = String(urlSlug || '')
    .replace(/[ #,_'"+_\\/]/g, '-')
    .toLowerCase();
  return `_p/aft/webp/${size}/${readyId}/${cleanSlug}-${order}.${ext}`;
}

function parseWidthCm(text) {
  const m = String(text || '').match(/\b(40|45|50|55|60|65|70|75|80|85|90|95|100|105|110|115|120|130|140|150|160)\s*cm\b/i);
  if (m) return Number(m[1]);
  const m2 = String(text || '').match(/(\d{2,3})\s*[xX×]\s*\d{2}/);
  if (m2) {
    const val = Number(m2[1]);
    if (val >= 40 && val <= 180) return val;
  }
  return 90;
}

function parseColorMeta(text) {
  const s = String(text || '').toLowerCase();
  if (/noce|walnut|tabacco|rovere scuro|castagno|weng|marrone|legno scuro/.test(s)) {
    return { color: 'Noce / Rovere Scuro', hex: '#6c4932', wood: true };
  }
  if (/rovere|quercia|oak|miele|naturale|legno|olmo|frassino|larice|teak|betulla/.test(s)) {
    return { color: 'Rovere Naturale', hex: '#c89e6e', wood: true };
  }
  if (/verde|salvia|bosco|menta|oliva|agave|ottanio|petrolio/.test(s)) {
    return { color: 'Verde Opaco', hex: '#586e60', wood: false };
  }
  if (/azzurro|blu|navy|cielo|carta da zucchero|avio|oceano/.test(s)) {
    return { color: 'Blu / Azzurro', hex: '#52738a', wood: false };
  }
  if (/antracite|nero|carbone|grafite|black|piombo|scuro/.test(s)) {
    return { color: 'Antracite / Nero', hex: '#34383d', wood: false };
  }
  if (/tortora|beige|sabbia|greige|taupe|cappuccino|corda|fango|avorio|crema|kashmir|cashmere/.test(s)) {
    return { color: 'Tortora / Sabbia', hex: '#b8ad9e', wood: false };
  }
  if (/grigio|perla|cemento|argento|ardesia|cenere|grey/.test(s)) {
    return { color: 'Grigio Opaco', hex: '#8e9399', wood: false };
  }
  if (/rosa|cipria|terracotta|corallo|bordeaux|malva/.test(s)) {
    return { color: 'Rosa / Terracotta', hex: '#c7978d', wood: false };
  }
  if (/bianco|white|ghiaccio| opaco|lucido/.test(s)) {
    return { color: 'Bianco', hex: '#f1f0ec', wood: false };
  }
  return { color: 'Rovere Naturale', hex: '#c89e6e', wood: true };
}

function parseOpeningMeta(text) {
  const s = String(text || '').toLowerCase();
  if (/4\s*cassetti|quattro\s*cassetti/.test(s)) return { opening: '4 Cassetti', kind: '2-drawers' };
  if (/3\s*cassetti|tre\s*cassetti/.test(s)) return { opening: '3 Cassetti', kind: '2-drawers' };
  if (/2\s*cassetti|due\s*cassetti|con\s*cassetti/.test(s)) return { opening: '2 Cassetti', kind: '2-drawers' };
  if (/1\s*cassetto|un\s*cassetto|cassetto/.test(s)) return { opening: '1 Cassetto', kind: '1-drawer' };
  if (/2\s*ante|due\s*ante|con\s*ante/.test(s)) return { opening: '2 Ante', kind: '2-doors' };
  if (/1\s*anta|un['’]?\s*anta|anta/.test(s)) return { opening: '1 Anta', kind: '1-door' };
  return { opening: '2 Cassetti', kind: '2-drawers' };
}

function parseBasinMeta(text) {
  const s = String(text || '').toLowerCase();
  const hasColumn = /colonna|pensile/.test(s);
  const isFluted = /cannettat|rigat|millerighe|pliss/.test(s);

  if (/doppio\s*lavabo|2\s*vasche|doppia\s*vasca|due\s*lavabi/.test(s)) {
    return {
      basin: 'Doppio Lavabo',
      basinType: 'double-smart',
      doubleBasin: true,
      offsetBasin: 0,
      hasColumn,
      fluted: isFluted,
    };
  }
  if (/d['’]appoggio|ciotola|top\s*legno|toppino|mensola/.test(s)) {
    return {
      basin: "Lavabo d'Appoggio",
      basinType: 'toppino',
      doubleBasin: false,
      offsetBasin: 0,
      hasColumn,
      fluted: isFluted,
    };
  }
  if (/vasca\s*a?\s*sinistra|lavabo\s*a?\s*sinistra|\bsx\b/.test(s)) {
    return {
      basin: 'Lavabo Vasca Sinistra',
      basinType: 'left-basin',
      doubleBasin: false,
      offsetBasin: -0.24,
      hasColumn,
      fluted: isFluted,
    };
  }
  if (/vasca\s*a?\s*destra|lavabo\s*a?\s*destra|\bdx\b/.test(s)) {
    return {
      basin: 'Lavabo Vasca Destra',
      basinType: 'right-basin',
      doubleBasin: false,
      offsetBasin: 0.24,
      hasColumn,
      fluted: isFluted,
    };
  }
  if (/resina|mineralmarmo|solid/.test(s)) {
    return {
      basin: 'Lavabo in Resina',
      basinType: 'resina',
      doubleBasin: false,
      offsetBasin: 0,
      hasColumn,
      fluted: isFluted,
    };
  }
  return {
    basin: 'Lavabo in Ceramica + Specchio',
    basinType: 'smart',
    doubleBasin: false,
    offsetBasin: 0,
    hasColumn,
    fluted: isFluted,
  };
}

function formatEuro(val) {
  if (!Number.isFinite(Number(val))) return '';
  return `${Number(val).toFixed(2).replace('.', ',')} €`;
}

async function main() {
  console.log('--- Fetching Deghi Mobili da Bagno Sospesi catalog ---');
  const rawItems = [];
  const seenIds = new Set();

  // Fetch first 14 pages (24 * 14 = 336 top-ranked suspended vanities across all collections, widths, and finishes)
  for (let page = 1; page <= 14; page++) {
    const res = await fetch('https://www.deghi.it/graphql', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Origin: 'https://www.deghi.it',
        Referer: 'https://www.deghi.it/bagno/mobili-da-bagno/mobile-sospeso',
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          page,
          sort_by: '',
          perPage: 24,
          category_id: 4,
          totalRecords: 0,
          filters: '{}',
        },
      }),
    });
    const json = await res.json();
    const list = json.data?.GetProductsFromCategory?.items || [];
    if (list.length === 0) break;

    for (const it of list) {
      if (!seenIds.has(it.product_id)) {
        seenIds.add(it.product_id);
        rawItems.push(it);
      }
    }
    console.log(`  [Deghi] Page ${page}/14 -> cumulative ${rawItems.length} vanities`);
  }

  const items = [];
  for (const raw of rawItems) {
    if (!raw.product_readyId || !raw.product_url) continue;
    const fullTitle = String(raw.product_name || raw.product_nameWeb || 'Mobile bagno sospeso').trim();
    const readyTitle = String(raw.product_ready_nameWeb || '').trim();
    const combinedText = `${fullTitle} ${readyTitle}`;

    // Extract series name after the last " - " in product_name (e.g. "Cuki", "Boho", "Kora")
    const dashParts = fullTitle.split(/\s+-\s+/);
    const series = dashParts.length > 1 ? dashParts[dashParts.length - 1].trim() : 'Deghi Design';

    const widthCm = parseWidthCm(combinedText);
    const depthCm = widthCm <= 55 ? 40 : 46;
    const colorMeta = parseColorMeta(combinedText);
    const openMeta = parseOpeningMeta(combinedText);
    const basinMeta = parseBasinMeta(combinedText);
    const heightCm = openMeta.kind === '1-drawer' ? 35 : 54;

    const picOrder = raw.pictures?.[0]?.picture_order || 1;
    const thumbPic = buildDeghiImgPath(350, raw.product_readyId, raw.product_url, picOrder, 'webp');
    const pic = buildDeghiImgPath(750, raw.product_readyId, raw.product_url, picOrder, 'webp');

    const finalPrice = formatEuro(raw.price?.final_price);
    const oldPrice = formatEuro(raw.price?.old_price);
    const discount = raw.price?.new_discount ? `-${raw.price.new_discount}%` : '';
    const sku = raw.product_sku || raw.product_codeWeb || `DG-${raw.product_id}`;

    const shortTitle = `${series} ${widthCm} cm · ${openMeta.opening} — ${colorMeta.color}${basinMeta.hasColumn ? ' + Colonna' : ''}`;

    items.push({
      id: `deghi-${raw.product_id}`,
      sku,
      brand: 'deghi',
      brandLabel: `Deghi · ${series}`,
      series,
      title: shortTitle,
      fullName: fullTitle,
      widthCm,
      depthCm,
      heightCm,
      opening: openMeta.opening,
      openingKind: openMeta.kind,
      color: colorMeta.color,
      hex: colorMeta.hex,
      wood: colorMeta.wood,
      basin: `${basinMeta.basin}${basinMeta.hasColumn ? ' + Colonna' : ''}`,
      basinType: basinMeta.basinType,
      doubleBasin: basinMeta.doubleBasin,
      offsetBasin: basinMeta.offsetBasin,
      hasColumn: basinMeta.hasColumn,
      fluted: basinMeta.fluted,
      price: finalPrice,
      oldPrice,
      discount,
      pic,
      thumbPic,
      url: `https://www.deghi.it/${raw.product_url}`,
    });
  }

  const outPath = path.resolve('public', 'deghi-vanities.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({
      source: 'Deghi — Catalogo Mobili da Bagno Sospesi',
      fetchedAt: new Date().toISOString(),
      totalCount: items.length,
      items,
    }),
    'utf8'
  );

  console.log(`Saved ${items.length} Deghi suspended vanities -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

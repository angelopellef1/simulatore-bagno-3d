import fs from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 84;
const SEARCH_BASE_URL = 'https://www.iperceramica.it/ProductListingView';

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCdnPath(url) {
  return String(url || '')
    .replace(/^https?:\/\/cdn\.iperceramica\.it\/+/i, '')
    .replace(/^\/\/cdn\.iperceramica\.it\/+/i, '')
    .replace(/^\/+/, '');
}

async function fetchText(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': UA,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

function buildSearchUrl(beginIndex) {
  const params = new URLSearchParams({
    advancedSearch: '',
    manufacturer: '',
    metaData: '',
    enableSKUListView: 'false',
    storeId: '10151',
    catalogId: '10051',
    langId: '-4',
    sType: 'SimpleSearch',
    resultCatEntryType: '2',
    searchType: '',
    filterFacet: '',
    filterTerm: '',
    facet: '',
    categoryFacetHierarchyPath: '',
    ajaxStoreImageDir: '//cdn.iperceramica.it/wcsstore/bayker/',
    searchTermScope: '',
    parent_category_rn: '',
    ddkey: 'ProductListingView_6_-2011_1410',
    disableProductCompare: 'true',
    pageView: 'grid',
    beginIndex: String(beginIndex),
    productBeginIndex: String(beginIndex),
    pageSize: String(PAGE_SIZE),
    resultsPerPage: String(PAGE_SIZE),
    searchTerm: 'gres porcellanato',
    categoryId: '29180',
    resultType: 'products',
    loadProductsList: 'true',
  });
  return `${SEARCH_BASE_URL}?${params}`;
}

function parseDimension(title) {
  const match = String(title).match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (!match) return { w: 60, l: 60 };
  const first = Number(match[1].replace(',', '.'));
  const second = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(first) || !Number.isFinite(second) || first < 2 || second < 2) {
    return { w: 60, l: 60 };
  }
  return {
    w: Math.round(Math.min(first, second) * 10) / 10,
    l: Math.round(Math.max(first, second) * 10) / 10,
  };
}

function inferEffect(title, category = '') {
  const text = `${title} ${category}`.toLowerCase();
  if (/mosaico|mosaici|muretto|esagon|listello decor/.test(text)) return 'Mosaico';
  if (/effetto legno|parquet|rovere|wood|legno/.test(text)) return 'Legno';
  if (/effetto marmo|calacatta|statuario|marquinia|onice|travertino|marmo/.test(text)) return 'Marmo';
  if (/effetto pietra|pietra|ardesia|quarzite|stone|calcarea/.test(text)) return 'Pietra';
  if (/cotto|terracotta|matton|brick/.test(text)) return 'Cotto e Mattone';
  if (/cemento|concreto|resina|beton|concrete/.test(text)) return 'Cemento';
  return 'Design e Monocolore';
}

function inferColor(title) {
  const text = String(title).toLowerCase();
  if (/white|bianco|calacatta bianco|ice|snow|ghiaccio|ultrawhite/.test(text)) return 'Bianco';
  if (/ivory|avorio|cream|crema|almond|mandorla|biscuit/.test(text)) return 'Avorio';
  if (/beige|sand|sabbia|ecru|dune|gold|oro|champagne/.test(text)) return 'Beige';
  if (/taupe|tortora|greige|cognac|rope/.test(text)) return 'Tortora';
  if (/black|nero|noir|anthracite|antracite|dark|graphite|carbon/.test(text)) return 'Nero';
  if (/grey|gray|grigio|silver|argento|cenere|ash|smoke|pearl|perla|cemento|stone grey/.test(text)) return 'Grigio';
  if (/walnut|noce|brown|marrone|oak|rovere|tabacco|terra|natural wood/.test(text)) return 'Marrone';
  if (/terracotta|cotto|rust|ruggine|rosso|red|orange|arancio/.test(text)) return 'Terracotta';
  if (/green|verde|sage|salvia|mint|menta|teal|bosco/.test(text)) return 'Verde';
  if (/blue|blu|azzurro|navy|ocean|cobalto|cielo/.test(text)) return 'Blu';
  if (/pink|rosa|blush|cipria|lilla|viola|mauve|purple/.test(text)) return 'Rosa';
  if (/multi|mix|decor|pattern|floral/.test(text)) return 'Multicolore';
  return 'Naturale';
}

function inferFinish(title) {
  const text = String(title).toLowerCase();
  if (/full lappato|lucido|levigato/.test(text)) return 'Lucido / Levigato';
  if (/strutturato|grip|antiscivolo|outdoor/.test(text)) return 'Strutturato Antiscivolo';
  if (/naturale matt|naturale opaco|\bmatt\b/.test(text)) return 'Naturale Opaco';
  if (/satinato/.test(text)) return 'Satinato';
  return 'Naturale';
}

function parseProducts(html) {
  const products = [];
  const blockPattern =
    /<div class="product"\s+catentryId="(\d+)">([\s\S]*?)<!-- END CatalogEntryDisplay.jsp -->/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[2];
    const title =
      decodeHtmlEntities(
        block.match(/<div class="product_name">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
          block.match(/<img[^>]+alt="([^"]+)"/i)?.[1] ||
          ''
      );
    if (!title || /^(battiscopa|gradino|coprigradino|angolare|profilo)\b/i.test(title)) continue;

    const sku = block.match(/"item_id"\s*:\s*"(\d+)"/)?.[1];
    const pic = normalizeCdnPath(
      block.match(/<img[\s\S]*?data-src="([^"]+)"/i)?.[1] || ''
    );
    const url = block.match(/href="(https:\/\/www\.iperceramica\.it\/it\/ita\/catalogo\/[^"]+)"/i)?.[1] || '';
    if (!sku || !pic || !url) continue;

    const dimensions = parseDimension(title);
    const category = decodeHtmlEntities(block.match(/"category"\s*:\s*"([^"]+)"/)?.[1] || '');
    const parsedPrice = Number.parseFloat(block.match(/"price"\s*:\s*([0-9.]+)/)?.[1] || '');
    const thicknessMatch = title.match(/spess(?:ore)?\s*(?:di\s*)?(\d+(?:[.,]\d+)?)\s*mm/i);
    const thick = thicknessMatch ? Number(thicknessMatch[1].replace(',', '.')) : 9;
    const seriesSource = title
      .replace(/^piastrella\s+/i, '')
      .replace(/^gres\s+/i, '')
      .split(/\d+(?:[.,]\d+)?\s*[xX×]\s*\d+/)[0]
      .trim();

    products.push({
      brand: 'iperceramica',
      brandLabel: 'Iperceramica',
      sku,
      catalogEntryId: match[1],
      series: seriesSource || 'Gres porcellanato',
      title,
      fullName: title.toUpperCase(),
      effect: inferEffect(title, category),
      color: inferColor(title),
      w: dimensions.w,
      l: dimensions.l,
      thick,
      rect: /\brettificato?\b/i.test(title),
      finish: inferFinish(title),
      usage: /esterni|outdoor/i.test(title) ? 'Interno ed Esterno' : 'Pavimento e Rivestimento',
      pic,
      thumbPic: pic,
      url,
      priceMq: Number.isFinite(parsedPrice) ? parsedPrice : null,
    });
  }
  return products;
}

async function findBestTileImage(item) {
  try {
    const html = await fetchText(item.url);
    const galleryPaths = [
      ...html.matchAll(/data-(?:zoom-)?image="([^"]+)"|content="(https:\/\/cdn\.iperceramica\.it\/[^"]+)"/gi),
    ]
      .flatMap((match) => [match[1], match[2]])
      .filter(Boolean)
      .map(normalizeCdnPath);
    const tileImage =
      galleryPaths.find((image) => /minimale(?!.*zoom)\.(?:jpe?g|png|webp)$/i.test(image)) ||
      galleryPaths.find((image) => /(?:fronte|texture|campione|piastrella)(?!.*zoom)\.(?:jpe?g|png|webp)$/i.test(image));
    return tileImage || item.pic;
  } catch (error) {
    console.warn(`Using listing image for Iperceramica SKU ${item.sku}: ${error.message}`);
    return item.pic;
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      output[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

async function main() {
  const allItems = [];
  let total = null;

  for (let beginIndex = 0; total === null || beginIndex < total; beginIndex += PAGE_SIZE) {
    const html = await fetchText(buildSearchUrl(beginIndex));
    const countMatch = html.match(/(\d+)\s*(?:&nbsp;)?\s*-\s*(\d+)\s+di\s+([\d.]+)/i);
    if (!countMatch) {
      throw new Error(`Unable to read Iperceramica product count at offset ${beginIndex}`);
    }
    total = Number(countMatch[3].replace(/\./g, ''));
    const pageItems = parseProducts(html);
    if (pageItems.length === 0) {
      throw new Error(`No Iperceramica products parsed at offset ${beginIndex}`);
    }
    allItems.push(...pageItems);
    console.log(
      `Fetched Iperceramica offset ${beginIndex}: +${pageItems.length} (total ${allItems.length}/${total})`
    );
  }

  const uniqueItems = [...new Map(allItems.map((item) => [item.sku, item])).values()].filter(
    (item) => item.pic
  );
  let completed = 0;
  const enrichedItems = await mapWithConcurrency(uniqueItems, 10, async (item) => {
    const pic = await findBestTileImage(item);
    completed++;
    if (completed % 100 === 0 || completed === uniqueItems.length) {
      console.log(`Resolved ${completed}/${uniqueItems.length} Iperceramica tile images`);
    }
    return { ...item, pic };
  });

  const outPath = path.resolve('public', 'iperceramica-gres-catalog.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({
      source: 'Iperceramica — Catalogo Gres Porcellanato',
      fetchedAt: new Date().toISOString(),
      totalCount: enrichedItems.length,
      items: enrichedItems,
    }),
    'utf8'
  );

  const stats = await fs.stat(outPath);
  console.log(
    `Saved ${enrichedItems.length} Iperceramica gres products to ${outPath} (${Math.round(stats.size / 1024)} KB)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

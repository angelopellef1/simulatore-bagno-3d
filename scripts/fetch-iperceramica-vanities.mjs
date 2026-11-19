import fs from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&euro;/g, '€')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseColorMeta(title) {
  const s = title.toLowerCase();
  if (s.includes('rovere chiaro')) {
    return { color: 'Rovere Chiaro', hex: '#c89e6e', wood: true };
  }
  if (s.includes('rovere scuro')) {
    return { color: 'Rovere Scuro', hex: '#6c4932', wood: true };
  }
  if (s.includes('verde opaco') || s.includes('verde')) {
    return { color: 'Verde Opaco', hex: '#586e60', wood: false };
  }
  if (s.includes('azzurro opaco') || s.includes('azzurro')) {
    return { color: 'Azzurro Opaco', hex: '#6e8c9e', wood: false };
  }
  if (s.includes('bianco opaco')) {
    return { color: 'Bianco Opaco', hex: '#f0efe9', wood: false };
  }
  return { color: 'Rovere Chiaro', hex: '#c89e6e', wood: true };
}

function parseOpeningMeta(title) {
  const s = title.toLowerCase();
  if (s.includes('2 cassetti')) return { opening: '2 Cassetti', kind: '2-drawers' };
  if (s.includes('1 cassetto')) return { opening: '1 Cassetto', kind: '1-drawer' };
  if (s.includes('2 ante')) return { opening: '2 Ante', kind: '2-doors' };
  if (s.includes('1 anta')) return { opening: '1 Anta', kind: '1-door' };
  return { opening: '2 Cassetti', kind: '2-drawers' };
}

function parseBasinMeta(title) {
  const s = title.toLowerCase();
  if (s.includes('toppino')) {
    return { basin: 'Con Toppino', basinType: 'toppino', doubleBasin: false, offsetBasin: 0 };
  }
  if (s.includes('2 vasche')) {
    return { basin: 'Ceramica SMART 2 Vasche', basinType: 'double-smart', doubleBasin: true, offsetBasin: 0 };
  }
  if (s.includes('vasca sinistra')) {
    return { basin: 'Ceramica Vasca Sinistra', basinType: 'left-basin', doubleBasin: false, offsetBasin: -0.26 };
  }
  if (s.includes('vasca destra')) {
    return { basin: 'Ceramica Vasca Destra', basinType: 'right-basin', doubleBasin: false, offsetBasin: 0.26 };
  }
  if (s.includes('hide bianco opaco')) {
    return { basin: 'Resina HIDE Bianco Opaco', basinType: 'hide-matte', doubleBasin: false, offsetBasin: 0 };
  }
  if (s.includes('hide bianco lucido')) {
    return { basin: 'Resina HIDE Bianco Lucido', basinType: 'hide-glossy', doubleBasin: false, offsetBasin: 0 };
  }
  if (s.includes('smile')) {
    return { basin: 'Resina SMILE Bianco Lucido', basinType: 'smile', doubleBasin: false, offsetBasin: 0 };
  }
  if (s.includes('wash')) {
    return { basin: 'Lavatoio Resina WASH', basinType: 'wash', doubleBasin: false, offsetBasin: 0 };
  }
  if (s.includes('smart')) {
    return { basin: 'Ceramica SMART Bianco Lucido', basinType: 'smart', doubleBasin: false, offsetBasin: 0 };
  }
  return { basin: 'Resina Bianco Lucido', basinType: 'resina', doubleBasin: false, offsetBasin: 0 };
}

async function main() {
  console.log('--- Fetching Iperceramica Mobili Bagno AVIVO catalog ---');
  const url = 'https://www.iperceramica.it/it/ita/mobili-bagno-avivo';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const html = await res.text();

  const cardRegex = /<div class="product" catentryId="(\d+)">([\s\S]*?)<!-- END CatalogEntryDisplay\.jsp -->/gi;
  let m;
  const items = [];
  const seenSkus = new Set();

  while ((m = cardRegex.exec(html)) !== null) {
    const catId = m[1];
    const block = m[2];
    const sku = block.match(/dataci_product="_(\d+)"/i)?.[1] || catId;
    if (seenSkus.has(sku)) continue;
    seenSkus.add(sku);

    const href = block.match(/href="(https:\/\/www\.iperceramica\.it\/it\/ita\/catalogo\/[^"]+)"/i)?.[1] || url;
    const rawTitle = decodeHtmlEntities(block.match(/title="([^"]+)"/i)?.[1] || 'Mobile Bagno AVIVO');
    const dataSrc = block.match(/data-src="([^"]+)"/i)?.[1] || '';
    const srcset = block.match(/data-srcset="([^"]+)"/i)?.[1] || '';

    let hiResPic = dataSrc;
    const srcsetParts = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
    if (srcsetParts.length > 0) {
      hiResPic = srcsetParts[srcsetParts.length - 1];
    }

    const thumbRel = dataSrc.replace(/^(?:https?:)?\/\/cdn\.iperceramica\.it\/+/i, '');
    const picRel = hiResPic.replace(/^(?:https?:)?\/\/cdn\.iperceramica\.it\/+/i, '');

    const rawPrice = decodeHtmlEntities(
      block.match(/id="ProductInfoPrice_\d+" value="([^"]+)"/i)?.[1] || ''
    );
    const oldPrice = decodeHtmlEntities(
      block.match(/id="listPrice_\d+">\s*([\d.,]+\s*(?:&euro;|€))/i)?.[1] || ''
    );
    const discount = decodeHtmlEntities(
      block.match(/id="discount_\d+">\s*([-\d.,]+%)/i)?.[1] || ''
    );

    const widthMatch = rawTitle.match(/\b(60|75|90|120)\s*cm\b/i);
    const widthCm = widthMatch ? Number(widthMatch[1]) : 90;
    const depthCm = 46;
    const heightCm = /2\s*cassetti|\b2\s*ante|\b1\s*anta/i.test(rawTitle) ? 54 : 35;

    const colorMeta = parseColorMeta(rawTitle);
    const openMeta = parseOpeningMeta(rawTitle);
    const basinMeta = parseBasinMeta(rawTitle);

    const shortTitle = `AVIVO ${widthCm} cm · ${openMeta.opening} — ${colorMeta.color}`;

    items.push({
      id: `avivo-${sku}`,
      sku,
      brand: 'iperceramica',
      brandLabel: 'Iperceramica · Avivo',
      series: 'Avivo Cannettato',
      title: shortTitle,
      fullName: rawTitle,
      widthCm,
      depthCm,
      heightCm,
      opening: openMeta.opening,
      openingKind: openMeta.kind,
      color: colorMeta.color,
      hex: colorMeta.hex,
      wood: colorMeta.wood,
      basin: basinMeta.basin,
      basinType: basinMeta.basinType,
      doubleBasin: basinMeta.doubleBasin,
      offsetBasin: basinMeta.offsetBasin,
      price: rawPrice,
      oldPrice,
      discount,
      pic: picRel,
      thumbPic: thumbRel,
      url: href,
    });
  }

  const outPath = path.resolve('public', 'iperceramica-avivo-vanities.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({
      source: 'Iperceramica — Mobili Bagno Serie AVIVO Cannettato',
      fetchedAt: new Date().toISOString(),
      totalCount: items.length,
      items,
    }),
    'utf8'
  );

  console.log(`Saved ${items.length} Iperceramica Avivo vanities -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Fioranese catalog scraper -> public/fioranese-catalog.json
import fs from 'node:fs';
const BASE = 'https://www.fioranese.it';
const UA = 'Mozilla/5.0 (compatible; simulatore-bagno-3d catalog fetch)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}
const dec = s => String(s || '').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&ugrave;/g, 'ù').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é').replace(/&#8217;/g, "'").replace(/&#8211;/g, '-').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function mapColor(name) {
  const s = name.toLowerCase();
  if (/white|bianco|blanc|ivory|ivoire|avorio|latte|neve|snow|ice|perla|pearl|calce|chalk/.test(s)) return 'Bianco';
  if (/beige|sand|sabbia|sable|cream|crema|champagne|almond|camel|honey|miele|dune|burro|paglia|nocciola|travertino/.test(s)) return 'Beige';
  if (/taupe|tortora|greige|fango|mud|cappuccino|visone|clay|argilla|corda|cenere/.test(s)) return 'Tortora';
  if (/anthracite|antracite|dark|coal|piombo|grafite|graphite|charcoal|carbon|lava|ardesia|slate|smoke|fumo/.test(s)) return 'Antracite';
  if (/black|nero|noir|ebano|notte|night/.test(s)) return 'Nero';
  if (/grey|gray|grigio|gris|silver|argento|acciaio|steel|ash|cement|cemento|cloud|nuvola/.test(s)) return 'Grigio';
  if (/walnut|noce|brown|marrone|moro|tabacco|mogano|castagno|oak|rovere|cacao|moka|caff|terre|terra|bruno|wenge|chocolate|havana/.test(s)) return 'Marrone';
  if (/cotto|rust|terracotta|corallo|brick|mattone|arancio|ruggine|copper|rame|siena|orange/.test(s)) return 'Terracotta';
  if (/green|verde|vert|sage|salvia|mint|menta|olive|oliva|bosco|forest|emerald|smeraldo|eucalipto/.test(s)) return 'Verde';
  if (/blue|blu|bleu|azzurro|navy|cobalto|cielo|sky|petrolio|ocean|indaco|avio/.test(s)) return 'Blu';
  if (/pink|rosa|rose|blush|cipria|mauve|lilla|viola|bordeaux|rosso|red|salmone/.test(s)) return 'Rosa';
  if (/multi|mix|mosaic|decor|blend|patchwork|fusion/.test(s)) return 'Multicolore';
  return 'Naturale';
}
function mapEffect(text) {
  const s = text.toLowerCase();
  if (/mosaico|mosaic|esagon|hexagon|chevron|spina|herringbone|palladiana|tessere|muretto|bits\b|ciottoli/.test(s)) return 'Mosaico';
  if (/legno|wood|rovere|oak|larice|parquet|doghe|plank|essenza|noce|teak|cottage|wellness/.test(s)) return 'Legno';
  if (/marmo|marble|statuario|calacatta|onice|onyx|alabaster|alabastro|travertin|arabescato|breccia|marmorea|palazzo|terme-romane/.test(s)) return 'Marmo';
  if (/cotto|mattone|brick|terracotta|terraviva|argill|clay|fornace/.test(s)) return 'Cotto e Mattone';
  if (/pietra|stone|ardesia|slate|quarzit|porfido|basalt|granit|lava|caliza|cote|côte|dolomia|pietraviva|terrazzo|castle/.test(s)) return 'Pietra';
  if (/cement|concret|resina|metal|oxyde|oxide|steel|urban|materic|legnocemento|industrial/.test(s)) return 'Cemento';
  return 'Design e Monocolore';
}
function parseDims(str) {
  const out = [];
  for (const m of str.matchAll(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/g)) {
    const a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
    if (a < 3 || b < 3 || a > 340 || b > 340) continue;
    out.push({ w: Math.round(Math.min(a, b) * 10) / 10, l: Math.round(Math.max(a, b) * 10) / 10 });
  }
  return out;
}
const toRel = u => { const m = u.match(/fioranese\.it\/(wp-content\/.+)$/); return m ? m[1] : null; };
const thumbOf = u => u.replace(/(\.(?:jpe?g|png|webp))$/i, '-300x300$1');
const titleCase = s => s.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

const sm = await get(`${BASE}/prodotti-sitemap.xml`);
if (!sm) { console.error('Sitemap unavailable / blocked'); process.exit(1); }
const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/pavimenti-e-rivestimenti\/[^/]+\/$/.test(u)))];
console.log('collections:', urls.length);

const items = [], seen = new Set();
for (const url of urls) {
  const html = await get(url);
  await sleep(250);
  if (!html) { console.warn('skip', url); continue; }
  const series = titleCase(dec((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]));
  if (!series) continue;
  const desc = dec((html.match(/<div class="content">([\s\S]*?)<\/div>/) || [])[1]);
  const fm = html.match(/class="formati[^"]*"[\s\S]*?<\/section>/);
  let dims = fm ? parseDims(dec(fm[0]).replace(/Formati/i, '')) : [];
  if (!dims.length) dims = [{ w: 60, l: 60 }];
  const colorSec = (html.match(/<section class="colori[\s\S]*?<\/section>/) || [])[0] || '';
  const slug = url.split('/').filter(Boolean).pop();
  const effect = mapEffect(`${slug} ${series} ${desc}`);
  const usage = /rivestiment/i.test(desc) && !/pavimenti?/i.test(desc) ? 'Rivestimento' : 'Pavimento e Rivestimento';
  const blocks = colorSec.split(/<div class="item">/).slice(1);
  for (const b of blocks) {
    const full = (b.match(/href="([^"]+\.(?:jpe?g|png|webp))"/i) || [])[1];
    const thumb = (b.match(/data-src="([^"]+)"/) || [])[1];
    const name = dec((b.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1]) || dec((b.match(/alt="([^"]*)"/) || [])[1]);
    const picAbs = full || thumb;
    if (!picAbs || !name) continue;
    const pic = toRel(picAbs), thumbPic = toRel(thumb || thumbOf(picAbs));
    if (!pic) continue;
    const color = mapColor(name);
    for (const { w, l } of dims) {
      const base = `FIO-${slug}-${name}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/-+$/, '');
      const sku = `${base}-${w}x${l}`.replace(/\./g, '_');
      if (seen.has(sku)) continue;
      seen.add(sku);
      items.push({
        brand: 'fioranese', brandLabel: 'Fioranese', sku, series,
        title: `${series} — ${name} ${w}×${l} cm`,
        fullName: `FIORANESE ${series.toUpperCase()} ${name.toUpperCase()} ${w}x${l} cm`,
        effect, color, w, l, thick: 9, rect: true, finish: 'Naturale', usage,
        pic, thumbPic, url,
      });
    }
  }
  console.log(series, blocks.length, 'colors', dims.length, 'sizes');
}
const out = { source: 'Fioranese Ceramica — Gres Porcellanato', fetchedAt: new Date().toISOString(), totalCount: items.length, items };
fs.writeFileSync('public/fioranese-catalog.json', JSON.stringify(out));
console.log('TOTAL', items.length);

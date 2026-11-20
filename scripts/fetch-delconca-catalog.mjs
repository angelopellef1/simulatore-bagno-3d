import fs from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'https://www.delconca.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = path.resolve('public/delconca-catalog.json');

async function get(url, retries = 4) {
  for (let i = 1; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
    } catch (e) {
      if (i === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * i));
  }
  return '';
}

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#039;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, ' '));

function mapColor(raw) {
  const s = raw.toLowerCase();
  if (/white|bianco|calacatta|statuario|latte|neve|ghiaccio|panna|avorio|ivory|crema|cream|perla|ghiaccioli|almond/.test(s)) return 'Bianco';
  if (/beige|sabbia|sand|miele|nocciola|travertin|champagne|dune|desert|amani|sahara|gold|oro/.test(s)) return 'Beige';
  if (/tortora|taupe|greige|fango|corda|cappuccino|mud|visone/.test(s)) return 'Tortora';
  if (/antracite|anthracite|grafite|piombo|ardesia|dark|lava|carbone/.test(s)) return 'Antracite';
  if (/nero|black|noir|ebano|notte|marquinia|portoro/.test(s)) return 'Nero';
  if (/grigio|grey|gray|silver|argento|cenere|cemento|fumo|ash|acciaio|invisible|zebrino|titanio|cloud|piombo/.test(s)) return 'Grigio';
  if (/moka|marrone|brown|noce|walnut|tabacco|castagno|rovere|oak|cacao|caffe|caffè|havana|wengè|wenge|teak|legno|terra\b/.test(s)) return 'Marrone';
  if (/cotto|rosso|red|terracotta|mattone|brick|ruggine|rust|arancio|corallo|coral|ramato|copper/.test(s)) return 'Terracotta';
  if (/verde|green|salvia|sage|oliva|olive|menta|mint|smeraldo|bosco|forest/.test(s)) return 'Verde';
  if (/blu|blue|azzurro|cielo|sky|navy|oceano|ocean|petrolio|cobalto|turchese/.test(s)) return 'Blu';
  if (/rosa|pink|cipria|blush|lilla|viola|malva|bordeaux/.test(s)) return 'Rosa';
  if (/multi|mix|decor|cementine/.test(s)) return 'Multicolore';
  return 'Naturale';
}

// Series-level effect hints (Del Conca site exposes no machine-readable effect on series pages)
const SERIES_EFFECT = [
  [/rockstar|stone|quartz|galestro|climb|trevi|vignoni|lavaredo|stelvio|wild|st-?regis|native|monteverde|forum|carpegna|gardena|soul|sensoria/, 'Pietra'],
  [/foreste|bioterre|timeline|burma|legno|wood/, 'Legno'],
  [/marble|boutique|onice|marmo|calacatta|dinamika|london|paris/, 'Marmo'],
  [/cementine|era|cotto|terre|manufatti|dimore|progetto1962|mattone/, 'Cotto e Mattone'],
  [/alchimia|iconic|nesting|deco-studio|metall|frammenti|cement/, 'Cemento'],
  [/capricci|ghiaccioli|wall|art-collection/, 'Design e Monocolore'],
];
function mapEffect(slug, text) {
  const t = `${slug} ${text}`.toLowerCase();
  if (/mosaico/.test(slug)) return 'Mosaico';
  for (const [re, eff] of SERIES_EFFECT) if (re.test(slug)) return eff;
  if (/legno|wood|rovere|larice/.test(t)) return 'Legno';
  if (/marmo|marble|onice|calacatta/.test(t)) return 'Marmo';
  if (/pietra|stone|porfido|ardesia|quarz/.test(t)) return 'Pietra';
  if (/cotto|mattone|terracotta/.test(t)) return 'Cotto e Mattone';
  if (/cement|concret|resina|metal/.test(t)) return 'Cemento';
  return 'Design e Monocolore';
}

function title(s) {
  return s.toLowerCase().replace(/(^|[\s-])([a-zà-ù])/g, (_, a, b) => a.replace('-', ' ') + b.toUpperCase());
}

async function main() {
  const sm = await get(`${ORIGIN}/sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    .filter((u) => /\/it\/collezioni\/[^/]+\/[^/]+\/[^/]+\/$/.test(u));
  console.log('color pages:', urls.length);

  const items = [];
  const seen = new Set();
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      const html = await get(url);
      if (!html) continue;
      const parts = url.split('/').filter(Boolean);
      const [brandLine, seriesSlug, colorSlug] = parts.slice(-3);
      const series = strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || title(seriesSlug));
      const h2 = strip((html.match(/<h2 class="text-extra-large">([\s\S]*?)<\/h2>/) || [])[1] || colorSlug);
      const colorName = h2;
      const seriesT = title(series);
      // main articles only: everything before DECORI block
      const cut = html.search(/>\s*DECORI\s*</);
      const main = cut > 0 ? html.slice(0, cut) : html;
      const imgs = [...main.matchAll(/href="https?:\/\/www\.delconca\.com\/file\/\d+x\d+\/(articoli\/[^"]+\.(?:jpg|png|webp))"/gi)].map((m) => m[1]);
      const defaultImg = imgs[0];
      const sizeBlocks = [...main.matchAll(/<img[^>]+formati\/(\d+(?:,\d+)?x\d+(?:,\d+)?)\.png[\s\S]*?<strong>([A-Z0-9]+)<\/strong>\s*([^<]*)/g)];
      for (const b of sizeBlocks) {
        const [a, c] = b[1].replace(/,/g, '.').split('x').map(Number);
        if (!a || !c) continue;
        const code = b[2];
        const note = decode(b[3]);
        const w = Math.min(a, c), l = Math.max(a, c);
        const sku = `DC-${code}`;
        if (seen.has(sku)) continue;
        seen.add(sku);
        const img = imgs.find((p) => p.includes(code)) || defaultImg;
        if (!img) continue;
        const rect = /rett/i.test(note);
        const finish = /lapp/i.test(note) ? 'Lappato' : /strutt|struct/i.test(note) ? 'Strutturato' : /lucid|polish/i.test(note) ? 'Lucido' : 'Matt';
        const outdoor = /20mm|2cm|esterno|outdoor|grip/i.test(note);
        items.push({
          brand: 'delconca',
          brandLabel: 'Del Conca',
          sku,
          series: seriesT,
          title: `${seriesT} — ${colorName} ${w}×${l} cm`,
          fullName: `DEL CONCA ${series.toUpperCase()} ${colorName.toUpperCase()} ${w}x${l} cm ${code}`,
          effect: mapEffect(seriesSlug, `${series} ${colorName}`),
          color: mapColor(`${colorName} ${colorSlug}`),
          w, l,
          thick: /20mm|2cm/i.test(note) ? 20 : 9,
          rect,
          finish,
          usage: outdoor ? 'Esterno' : 'Pavimento e Rivestimento',
          pic: img.replace('articoli/', 'file/800x0/articoli/'),
          thumbPic: img.replace('articoli/', 'file/400x0/articoli/'),
          url,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  items.sort((x, y) => x.sku.localeCompare(y.sku));
  await fs.writeFile(OUT, JSON.stringify({
    source: 'Ceramica del Conca — Gres Porcellanato',
    fetchedAt: new Date().toISOString(),
    totalCount: items.length,
    items,
  }));
  console.log('items:', items.length);
}
main().catch((e) => { console.error(e); process.exit(1); });

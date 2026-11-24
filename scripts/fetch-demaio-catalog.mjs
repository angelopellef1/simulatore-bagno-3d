// Fetches the Francesco De Maio product catalog (Flazio e-commerce site).
// Product list comes from sitemap_ecommerce.xml; each product page exposes og:title / og:image / description.
// Output: public/demaio-catalog.json  (images served from https://francescodemaio.it/<pic>)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://francescodemaio.it';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DELAY_MS = Number(process.env.DEMAIO_DELAY_MS || 2500); // robots.txt asks Crawl-delay 30; override if desired
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demaio-catalog.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,*/*' } });
      if (res.ok) return await res.text();
      if (i === retries) throw new Error(`HTTP ${res.status} ${url}`);
    } catch (e) {
      if (i === retries) throw e;
    }
    await sleep(800 * i);
  }
}

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

function meta(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
}

function titleCase(s) {
  return s.replace(/\b([a-zà-ù])/g, (c) => c.toUpperCase());
}

function colorFrom(text, fallback) {
  const s = text.toLowerCase();
  if (/bianco|white/.test(s)) return 'Bianco';
  if (/sabbia|sand/.test(s)) return 'Beige';
  if (/caff[eè]|coffee/.test(s)) return 'Marrone';
  if (/azzurro|blu\b|blue/.test(s)) return 'Blu';
  if (/verde|green/.test(s)) return 'Verde';
  if (/nero|black/.test(s)) return 'Nero';
  if (/rosa|pink/.test(s)) return 'Rosa';
  if (/giallo|yellow/.test(s)) return 'Multicolore';
  return fallback;
}

async function main() {
  const idx = await get(`${ORIGIN}/sitemap_ecommerce.xml`);
  const sitemaps = [...new Set([...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('://www.', '://')))];
  const urls = new Map(); // slug -> url
  for (const sm of sitemaps) {
    const xml = await get(sm);
    for (const m of xml.matchAll(/<loc>([^<]+\/shop\/products\/([^<]+))<\/loc>/g)) {
      if (!urls.has(m[2])) urls.set(m[2], `${ORIGIN}/shop/products/${m[2]}`);
    }
  }
  console.log(`Found ${urls.size} product URLs`);

  const items = [];
  const seen = new Set();
  for (const [slug, url] of urls) {
    await sleep(DELAY_MS);
    let html;
    try { html = await get(url); } catch (e) { console.warn('skip', slug, e.message); continue; }
    const title0 = meta(html, 'og:title');
    const img = meta(html, 'og:image');
    const desc = meta(html, 'og:description');
    if (!title0 || !img) { console.warn('no data', slug); continue; }

    // Only keep images on the single supported origin
    let pic = '';
    try {
      const u = new URL(img);
      if (u.origin === ORIGIN) pic = u.pathname.replace(/^\/+/, '');
    } catch {}
    if (!pic) {
      // try any ogfile/ecommerce image in the page
      const m = html.match(/https?:\/\/(?:www\.)?francescodemaio\.it\/(ogfile\/ecommerce\/[^"'\s)]+\.(?:jpe?g|png|webp))/i);
      if (m) pic = m[1];
    }
    if (!pic) { console.warn('no same-origin image', slug, img); continue; }

    // Series / color / effect
    const name = title0.replace(/\s+\d+\s*x\s*\d+\s*cm$/i, '').trim();
    const lower = name.toLowerCase();
    let series, color, effect = 'Design e Monocolore';
    if (/^blu ponti/.test(lower)) { series = 'Blu Ponti (Gio Ponti)'; color = 'Blu'; }
    else if (/^puntini/.test(lower)) { series = 'Puntini Dot'; color = 'Multicolore'; }
    else if (/^(earth|rain|mist)\b/.test(lower)) {
      series = titleCase(lower.split(/[\s-]/)[0]);
      effect = 'Cotto e Mattone';
      color = colorFrom(lower.replace(/^(earth|rain|mist)/, ''), 'Naturale');
    } else {
      series = 'Van Gogh Museum';
      color = colorFrom(lower, 'Multicolore');
    }

    // Size
    let w = 20, l = 20;
    const dm = (slug.match(/(\d+)x(\d+)cm/) || title0.match(/(\d+)\s*x\s*(\d+)\s*cm/i) || desc.match(/(\d{2})\s*x\s*(\d{2})\s*cm/i));
    if (dm) { const a = +dm[1], b = +dm[2]; w = Math.min(a, b); l = Math.max(a, b); }

    const sku = 'FDM-' + slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (seen.has(sku)) continue;
    seen.add(sku);
    const sizeLabel = `${w}×${l} cm`;
    items.push({
      brand: 'demaio',
      brandLabel: 'Francesco De Maio',
      sku,
      series,
      title: `${series} — ${name} ${sizeLabel}`,
      fullName: `FRANCESCO DE MAIO ${series.toUpperCase()} ${name.toUpperCase()} ${w}x${l} cm`,
      effect,
      color,
      w,
      l,
      thick: effect === 'Cotto e Mattone' ? 1.5 : 1,
      rect: true,
      finish: effect === 'Cotto e Mattone' ? 'Cotto smaltato a mano' : 'Maiolica decorata a mano',
      usage: 'Pavimento e Rivestimento',
      pic,
      thumbPic: pic,
      url,
    });
    console.log(`${items.length}. ${sku} -> ${pic}`);
  }

  const out = {
    source: 'Francesco De Maio — Maioliche e Cotto',
    fetchedAt: new Date().toISOString(),
    totalCount: items.length,
    items,
  };
  await fs.writeFile(OUT, JSON.stringify(out));
  console.log(`Wrote ${items.length} items to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

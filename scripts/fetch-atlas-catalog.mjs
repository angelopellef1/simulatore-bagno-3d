import fs from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function mapColor(text = '') {
  const s = text.toLowerCase();
  if (/white|bianco|statuario|calacatta|ice|crystal|ivory|avorio|vanilla|dolomite|milk|pearl|perla|snow|alaska|light/.test(s)) return 'Bianco';
  if (/beige|sand|sabbia|cream|ecru|kaolin|taj|travertin|desert|warm|dune|corda|navona|halo/.test(s)) return 'Beige';
  if (/taupe|tortora|greige|fango|mud|rope|cashmere|clay|cappuccino|mushroom/.test(s)) return 'Tortora';
  if (/anthracite|antracite|dark|coal|piombo|grafite|graphite|charcoal|iron|tarmac|volcano|basalt|lava/.test(s)) return 'Antracite';
  if (/black|nero|noir|marquin|atlantis|ebano|notte|obsidian|negro/.test(s)) return 'Nero';
  if (/grey|gray|grigio|silver|argento|cenere|ash|smoke|stone|cement|concrete|mineral/.test(s)) return 'Grigio';
  if (/walnut|noce|brown|marrone|tabacco|wood|oak|rovere|terra|moka|cacao|empereur|emperador|bronze/.test(s)) return 'Marrone';
  if (/cotto|rust|terracotta|corallo|brick|sunset|peach|arancio|ruggine|ramato|copper|cort/.test(s)) return 'Terracotta';
  if (/green|verde|sage|salvia|mint|bosco|forest|olive|emerald|smeraldo|jade|giada|alpi|botanic/.test(s)) return 'Verde';
  if (/blue|blu|azzurro|ocean|navy|zaffiro|cobalto|sky|indigo|avio|brasil|azure|lapis/.test(s)) return 'Blu';
  if (/pink|rosa|blush|cipria|viola|bordeaux|rosso|red/.test(s)) return 'Rosa';
  return 'Naturale';
}

function mapEffect(text = '') {
  const s = text.toLowerCase();
  if (/wood|legno|oak|rovere|nid|plank/.test(s)) return 'Legno';
  if (/boost|cement|concret|raw|urban|tarmac|smoke|kaolin|ecru|mineral|clay/.test(s)) return 'Cemento';
  if (/blaze|metal|iron|cort|copper|oxid/.test(s)) return 'Cemento';
  if (/kone|stone|pietra|basalt|lava|cep|porfido|ardesia|slate|quarz|cardoso|limestone/.test(s)) return 'Pietra';
  if (/solid|absolute|monocolor|color/.test(s)) return 'Design e Monocolore';
  return 'Marmo';
}

function inferSeries(slug, title, imgUrl) {
  const s = `${slug} ${title} ${imgUrl}`.toLowerCase();
  if (/marvel/i.test(s) || /calacatta|statuario|marquin|dolomite|onyx|onice|arabescato|breccia|fior-di-bosco|cremo|prestige/i.test(s)) {
    return 'Marvel World';
  }
  if (/boost\s*natural/i.test(s)) return 'Boost Natural';
  if (/boost\s*stone/i.test(s)) return 'Boost Stone';
  if (/boost\s*mineral/i.test(s)) return 'Boost Mineral';
  if (/boost\s*balance/i.test(s)) return 'Boost Balance';
  if (/boost/i.test(s)) return 'Boost World';
  if (/travertin/i.test(s)) return 'Marvel Travertino';
  if (/kone/i.test(s)) return 'Kone';
  if (/blaze/i.test(s)) return 'Blaze';
  if (/nid/i.test(s)) return 'Nid';
  if (/epic|taj-mahal|patagonia/i.test(s)) return 'Marvel Epic';
  if (/caleido/i.test(s)) return 'Caleido';
  if (/basalt|lava|grey-stone|stone/i.test(s)) return 'Atlas Stone';
  return 'Atlas Concorde Studio';
}

async function main() {
  console.log('Fetching Atlas Concorde / Atlas Plan listing...');
  const url = 'https://www.atlasplan.com/it/grandi-lastre-e-piastrelle-in-gres-porcellanato/';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const cardRegex =
    /<div class="CardProduct:\s*CardProduct:full">([\s\S]*?)<div class="CardProduct:minimal"><\/div><\/div>/gi;
  const surfaces = [];
  const seenSlugs = new Set();

  for (const m of html.matchAll(cardRegex)) {
    const block = m[1];
    const slugMatch = block.match(/data-product=['"]([^'"]+)['"]/i);
    const hrefMatch = block.match(/href="(https:\/\/www\.atlasplan\.com\/it\/grandi-lastre-e-piastrelle-in-gres-porcellanato\/[^"]+)"/i);
    const titleMatch = block.match(/class="gtm-prod gtm-prodtitle"[^>]*>([\s\S]*?)<\/a>/i);
    const imgMatch = block.match(/src="(https:\/\/storage\.atlasplan\.com\/public\/assets\/[^"]+\.(?:webp|jpg|jpeg|png))"/i);

    if (!slugMatch || !imgMatch) continue;
    const slug = slugMatch[1].trim();
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const title = (titleMatch ? titleMatch[1] : slug).replace(/\s+/g, ' ').trim();
    const prodUrl = hrefMatch ? hrefMatch[1] : `${url}${slug}/`;
    const thumbFull = imgMatch[1];
    const thumbPic = thumbFull.replace(/^https:\/\/storage\.atlasplan\.com\//i, '');
    // High-res clamp_720_1440_50 or base webp
    const pic = thumbPic;

    surfaces.push({ slug, title, prodUrl, pic, thumbPic });
  }

  console.log(`Found ${surfaces.length} distinct Atlas Concorde / Atlas Plan surfaces.`);

  // Standard architectural formats for Atlas Concorde bathroom & interior collections
  const FORMATS = [
    { w: 60, l: 120, thick: 9, finish: 'Naturale / Matt' },
    { w: 60, l: 120, thick: 9, finish: 'Lappato / Silk' },
    { w: 120, l: 120, thick: 9, finish: 'Naturale / Matt' },
    { w: 120, l: 278, thick: 6, finish: 'Silk / Satin' },
    { w: 162, l: 324, thick: 12, finish: 'Natura-Vein' },
  ];

  const items = [];
  for (const surf of surfaces) {
    const series = inferSeries(surf.slug, surf.title, surf.pic);
    const effect = mapEffect(`${surf.slug} ${surf.title} ${series}`);
    const color = mapColor(`${surf.slug} ${surf.title}`);
    const codeBase = surf.slug
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (surf.slug === 'boost-natural-kaolin') {
      const kaolin3dVariants = [
        {
          sku: 'ATL-BOOST-NATURAL-KAOLIN-3D-WAVE-50X120',
          title: 'Boost Natural — Kaolin 3D Wave (Rilievo 3D Matt) 50×120 cm',
          fullName: 'ATLAS CONCORDE BOOST NATURAL KAOLIN 3D WAVE RILIEVO 3D MATT 50x120 cm',
          w: 50,
          l: 120,
          thick: 8.5,
          finish: '3D Wave Matt',
          relief3d: 'wave',
        },
        {
          sku: 'ATL-BOOST-NATURAL-KAOLIN-3D-TEXTURE-50X120',
          title: 'Boost Natural — Kaolin 3D Texture (Rilievo 3D Matt) 50×120 cm',
          fullName: 'ATLAS CONCORDE BOOST NATURAL KAOLIN 3D TEXTURE RILIEVO 3D MATT 50x120 cm',
          w: 50,
          l: 120,
          thick: 8.5,
          finish: '3D Texture Matt',
          relief3d: 'texture',
        },
        {
          sku: 'ATL-BOOST-NATURAL-KAOLIN-3D-PITCH-50X120',
          title: 'Boost Natural — Kaolin 3D Pitch (Rilievo 3D Cannettato) 50×120 cm',
          fullName: 'ATLAS CONCORDE BOOST NATURAL KAOLIN 3D PITCH RILIEVO 3D CANNETTATO 50x120 cm',
          w: 50,
          l: 120,
          thick: 8.5,
          finish: '3D Pitch Matt',
          relief3d: 'pitch',
        },
        {
          sku: 'ATL-BOOST-NATURAL-KAOLIN-3D-WAVE-60X120',
          title: 'Boost Natural — Kaolin 3D (Strutturato 3D Matt) 60×120 cm',
          fullName: 'ATLAS CONCORDE BOOST NATURAL KAOLIN 3D STRUTTURATO 3D MATT 60x120 cm',
          w: 60,
          l: 120,
          thick: 9,
          finish: '3D Wave Matt',
          relief3d: 'wave',
        },
      ];
      for (const v3d of kaolin3dVariants) {
        items.push({
          brand: 'atlas',
          brandLabel: 'Atlas Concorde',
          sku: v3d.sku,
          series: 'Boost Natural',
          title: v3d.title,
          fullName: v3d.fullName,
          effect: 'Cemento',
          color: 'Bianco',
          w: v3d.w,
          l: v3d.l,
          thick: v3d.thick,
          rect: true,
          finish: v3d.finish,
          relief3d: v3d.relief3d,
          usage: 'Rivestimento 3D',
          pic: surf.pic,
          thumbPic: surf.thumbPic,
          url: surf.prodUrl,
        });
      }
    }

    for (const fmt of FORMATS) {
      const finSlug = fmt.finish.split('/')[0].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sku = `ATL-${codeBase}-${fmt.w}X${fmt.l}-${finSlug}`;
      items.push({
        brand: 'atlas',
        brandLabel: 'Atlas Concorde',
        sku,
        series,
        title: `${series} — ${surf.title} (${fmt.finish}) ${fmt.w}×${fmt.l} cm`,
        fullName: `ATLAS CONCORDE ${series.toUpperCase()} ${surf.title.toUpperCase()} ${fmt.finish.toUpperCase()} ${fmt.w}x${fmt.l} cm`,
        effect,
        color,
        w: fmt.w,
        l: fmt.l,
        thick: fmt.thick,
        rect: true,
        finish: fmt.finish,
        usage: 'Pavimento e Rivestimento',
        pic: surf.pic,
        thumbPic: surf.thumbPic,
        url: surf.prodUrl,
      });
    }
  }

  // Verify sample image returns HTTP 200
  if (items.length > 0) {
    const testUrl = `https://storage.atlasplan.com/${items[0].pic}`;
    const tr = await fetch(testUrl, { method: 'HEAD', headers: { 'User-Agent': UA } });
    console.log('Sample image check:', testUrl, '->', tr.status);
  }

  const out = {
    source: 'Atlas Concorde / Atlas Plan — Gres Porcellanato & Grandi Lastre',
    fetchedAt: new Date().toISOString(),
    totalCount: items.length,
    items,
  };

  const outPath = path.resolve('public/atlas-catalog.json');
  await fs.writeFile(outPath, JSON.stringify(out), 'utf8');
  console.log(`Saved ${items.length} items to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

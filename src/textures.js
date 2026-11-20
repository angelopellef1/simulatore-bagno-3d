import * as THREE from 'three';

// Deterministic pseudo-random helper so textures look consistent across reloads
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvasPair(size = 512) {
  const diff = document.createElement('canvas');
  diff.width = size;
  diff.height = size;
  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  return {
    size,
    diff,
    bump,
    dCtx: diff.getContext('2d'),
    bCtx: bump.getContext('2d'),
  };
}

function drawMarbleVeins(ctx, size, rand, color, lineWidth, count = 7) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    let x = rand() * size;
    let y = rand() * size;
    ctx.moveTo(x, y);
    const angleBase = -0.55 + (rand() - 0.5) * 0.4;
    const steps = 18;
    ctx.lineWidth = lineWidth * (0.5 + rand() * 0.9);
    for (let s = 0; s < steps; s++) {
      const a = angleBase + Math.sin(s * 0.6 + i) * 0.35 + (rand() - 0.5) * 0.4;
      x += Math.cos(a) * (size / 12);
      y += Math.sin(a) * (size / 12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function addSpeckleNoise(ctx, size, rand, count, colors, minR = 0.6, maxR = 2.2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const x = rand() * size;
    const y = rand() * size;
    const r = minR + rand() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGridGrout(dCtx, bCtx, size, cols, rows, groutColor, groutPx = 3, staggered = false) {
  dCtx.strokeStyle = groutColor;
  dCtx.lineWidth = groutPx;
  bCtx.strokeStyle = '#383838';
  bCtx.lineWidth = groutPx + 1.5;

  const cellW = size / cols;
  const cellH = size / rows;

  // Horizontal grout lines
  for (let r = 0; r <= rows; r++) {
    const y = Math.round(r * cellH) + 0.5;
    dCtx.beginPath();
    dCtx.moveTo(0, y);
    dCtx.lineTo(size, y);
    dCtx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(size, y);
    bCtx.stroke();
  }

  // Vertical grout lines
  for (let r = 0; r < rows; r++) {
    const y0 = r * cellH;
    const y1 = (r + 1) * cellH;
    const offset = staggered && r % 2 === 1 ? cellW * 0.5 : 0;
    for (let c = 0; c <= cols; c++) {
      const x = ((c * cellW + offset) % size);
      dCtx.beginPath();
      dCtx.moveTo(x, y0);
      dCtx.lineTo(x, y1);
      dCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(x, y0);
      bCtx.lineTo(x, y1);
      bCtx.stroke();
    }
  }
}

export const FLOOR_PRESETS = [
  {
    id: 'oak-plank',
    name: 'Gres Rovere Miele',
    subtitle: 'Listoni 20×120 posa sfalsata',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.52,
    metalness: 0.04,
    bumpScale: 0.012,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(101);
      bCtx.fillStyle = '#cfcfcf';
      bCtx.fillRect(0, 0, size, size);

      const rows = 6; // 1.2m / 6 = 20cm plank width
      const plankH = size / rows;

      for (let r = 0; r < rows; r++) {
        const y = r * plankH;
        const shift = (r * 0.37) % 1;
        const splits = [0, shift, 1].sort((a, b) => a - b);

        for (let s = 0; s < splits.length - 1; s++) {
          const x0 = splits[s] * size;
          const w = (splits[s + 1] - splits[s]) * size;
          if (w < 2) continue;

          const tone = (rand() - 0.5) * 18;
          const baseR = Math.round(188 + tone);
          const baseG = Math.round(145 + tone * 0.8);
          const baseB = Math.round(98 + tone * 0.55);
          dCtx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
          dCtx.fillRect(x0, y, w + 1, plankH + 1);

          // Wood grain fibers
          for (let g = 0; g < 26; g++) {
            const gy = y + rand() * plankH;
            dCtx.strokeStyle =
              rand() > 0.5 ? 'rgba(120,78,40,0.16)' : 'rgba(228,192,145,0.16)';
            dCtx.lineWidth = 0.8 + rand() * 1.8;
            dCtx.beginPath();
            dCtx.moveTo(x0, gy);
            dCtx.bezierCurveTo(
              x0 + w * 0.33,
              gy + (rand() - 0.5) * 6,
              x0 + w * 0.66,
              gy + (rand() - 0.5) * 6,
              x0 + w,
              gy + (rand() - 0.5) * 3
            );
            dCtx.stroke();
          }

          // Plank vertical seam
          if (splits[s] > 0.01) {
            dCtx.strokeStyle = '#7a5838';
            dCtx.lineWidth = 2.2;
            dCtx.beginPath();
            dCtx.moveTo(x0, y);
            dCtx.lineTo(x0, y + plankH);
            dCtx.stroke();

            bCtx.strokeStyle = '#3c3c3c';
            bCtx.lineWidth = 3;
            bCtx.beginPath();
            bCtx.moveTo(x0, y);
            bCtx.lineTo(x0, y + plankH);
            bCtx.stroke();
          }
        }

        // Plank horizontal seam
        dCtx.strokeStyle = '#7a5838';
        dCtx.lineWidth = 2.4;
        dCtx.beginPath();
        dCtx.moveTo(0, y);
        dCtx.lineTo(size, y);
        dCtx.stroke();

        bCtx.strokeStyle = '#383838';
        bCtx.lineWidth = 3.2;
        bCtx.beginPath();
        bCtx.moveTo(0, y);
        bCtx.lineTo(size, y);
        bCtx.stroke();
      }
      return { diff, bump };
    },
  },
  {
    id: 'calacatta-gold',
    name: 'Marmo Calacatta Oro',
    subtitle: 'Lastre 60×60 levigate lucide',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.16,
    metalness: 0.06,
    bumpScale: 0.006,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(202);
      dCtx.fillStyle = '#f6f4ef';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#e5e5e5';
      bCtx.fillRect(0, 0, size, size);

      // Soft warm clouds
      for (let i = 0; i < 12; i++) {
        const cx = rand() * size;
        const cy = rand() * size;
        const r = 60 + rand() * 110;
        const g = dCtx.createRadialGradient(cx, cy, 4, cx, cy, r);
        g.addColorStop(0, 'rgba(218,210,196,0.28)');
        g.addColorStop(1, 'rgba(246,244,239,0)');
        dCtx.fillStyle = g;
        dCtx.fillRect(0, 0, size, size);
      }

      drawMarbleVeins(dCtx, size, rand, 'rgba(148,144,138,0.34)', 5.5, 9);
      drawMarbleVeins(dCtx, size, rand, 'rgba(186,148,82,0.42)', 2.4, 7);
      drawMarbleVeins(dCtx, size, rand, 'rgba(110,108,104,0.28)', 1.3, 10);

      drawGridGrout(dCtx, bCtx, size, 2, 2, '#d2cec5', 2.5, false);
      return { diff, bump };
    },
  },
  {
    id: 'ceppo-gre',
    name: 'Ceppo di Gré Grigio',
    subtitle: 'Pietra lombarda 60×60 opaca',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.68,
    metalness: 0.03,
    bumpScale: 0.016,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(303);
      dCtx.fillStyle = '#8d9092';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#bcbcbc';
      bCtx.fillRect(0, 0, size, size);

      // Pebbles / clasts typical of Ceppo di Gré
      const pebbleColors = ['#6e7174', '#a7aaac', '#797c7f', '#b8bbbd', '#5d6063'];
      for (let i = 0; i < 650; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const rx = 2 + rand() * 8.5;
        const ry = 1.5 + rand() * 6;
        const rot = rand() * Math.PI;
        dCtx.fillStyle = pebbleColors[Math.floor(rand() * pebbleColors.length)];
        dCtx.beginPath();
        dCtx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        dCtx.fill();

        bCtx.fillStyle = rand() > 0.5 ? '#d0d0d0' : '#a6a6a6';
        bCtx.beginPath();
        bCtx.ellipse(x, y, rx * 0.9, ry * 0.9, rot, 0, Math.PI * 2);
        bCtx.fill();
      }

      addSpeckleNoise(dCtx, size, rand, 900, ['rgba(255,255,255,0.14)', 'rgba(40,42,45,0.16)'], 0.6, 1.8);
      drawGridGrout(dCtx, bCtx, size, 2, 2, '#6d7073', 3, false);
      return { diff, bump };
    },
  },
  {
    id: 'concrete-taupe',
    name: 'Resina Cemento Tortora',
    subtitle: 'Grandi lastre 80×80 minimal',
    scaleU: 1.6,
    scaleV: 1.6,
    roughness: 0.58,
    metalness: 0.02,
    bumpScale: 0.009,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(404);
      dCtx.fillStyle = '#b9b1a6';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#cbcbcb';
      bCtx.fillRect(0, 0, size, size);

      for (let i = 0; i < 28; i++) {
        const cx = rand() * size;
        const cy = rand() * size;
        const r = 50 + rand() * 130;
        const g = dCtx.createRadialGradient(cx, cy, 5, cx, cy, r);
        g.addColorStop(0, rand() > 0.5 ? 'rgba(164,155,143,0.22)' : 'rgba(208,201,191,0.22)');
        g.addColorStop(1, 'rgba(185,177,166,0)');
        dCtx.fillStyle = g;
        dCtx.fillRect(0, 0, size, size);
      }

      addSpeckleNoise(dCtx, size, rand, 650, ['rgba(120,112,102,0.12)', 'rgba(235,230,222,0.14)'], 0.5, 1.6);
      drawGridGrout(dCtx, bCtx, size, 2, 2, '#9e9589', 2, false);
      return { diff, bump };
    },
  },
  {
    id: 'terrazzo-veneziano',
    name: 'Terrazzo Veneziano',
    subtitle: 'Seminato chiaro policromo 60×60',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.28,
    metalness: 0.04,
    bumpScale: 0.008,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(505);
      dCtx.fillStyle = '#ece6dc';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#dedede';
      bCtx.fillRect(0, 0, size, size);

      const chips = ['#c97d60', '#6d8278', '#3c4347', '#d8b47c', '#9da3a4', '#ffffff'];
      for (let i = 0; i < 520; i++) {
        dCtx.fillStyle = chips[Math.floor(rand() * chips.length)];
        const cx = rand() * size;
        const cy = rand() * size;
        const pts = 4 + Math.floor(rand() * 3);
        const rad = 2.5 + rand() * 8.5;
        dCtx.beginPath();
        for (let p = 0; p < pts; p++) {
          const ang = (p / pts) * Math.PI * 2 + rand() * 0.5;
          const rr = rad * (0.6 + rand() * 0.5);
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr;
          if (p === 0) dCtx.moveTo(px, py);
          else dCtx.lineTo(px, py);
        }
        dCtx.closePath();
        dCtx.fill();
      }

      drawGridGrout(dCtx, bCtx, size, 2, 2, '#cfc8bc', 2.4, false);
      return { diff, bump };
    },
  },
  {
    id: 'slate-anthracite',
    name: 'Ardesia Antracite',
    subtitle: 'Pietra nera 60×60 satinata',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.62,
    metalness: 0.08,
    bumpScale: 0.016,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(606);
      dCtx.fillStyle = '#33373b';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#b4b4b4';
      bCtx.fillRect(0, 0, size, size);

      for (let i = 0; i < 40; i++) {
        const y = rand() * size;
        const h = 8 + rand() * 34;
        dCtx.fillStyle = rand() > 0.5 ? 'rgba(68,73,78,0.24)' : 'rgba(24,27,30,0.26)';
        dCtx.fillRect(0, y, size, h);
        bCtx.fillStyle = rand() > 0.5 ? 'rgba(215,215,215,0.22)' : 'rgba(130,130,130,0.22)';
        bCtx.fillRect(0, y, size, h);
      }

      drawMarbleVeins(dCtx, size, rand, 'rgba(210,215,220,0.11)', 1.5, 6);
      drawGridGrout(dCtx, bCtx, size, 2, 2, '#222528', 2.8, false);
      return { diff, bump };
    },
  },
];

export const WALL_PRESETS = [
  {
    id: 'statuario-white',
    name: 'Statuario Bianco Venato',
    subtitle: 'Lastre rettificate 60×120 cm',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.2,
    metalness: 0.04,
    bumpScale: 0.006,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(701);
      dCtx.fillStyle = '#f7f8fa';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#e4e4e4';
      bCtx.fillRect(0, 0, size, size);

      drawMarbleVeins(dCtx, size, rand, 'rgba(145,152,162,0.34)', 5.2, 8);
      drawMarbleVeins(dCtx, size, rand, 'rgba(105,112,122,0.26)', 1.8, 10);
      drawGridGrout(dCtx, bCtx, size, 1, 2, '#dadde2', 2.2, false);
      return { diff, bump };
    },
  },
  {
    id: 'fluted-sage',
    name: 'Cannettato Verde Salvia',
    subtitle: 'Ceramica 3D rigata verticale',
    scaleU: 0.8,
    scaleV: 0.8,
    roughness: 0.36,
    metalness: 0.03,
    bumpScale: 0.024,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const stripes = 32;
      const sw = size / stripes;

      for (let i = 0; i < stripes; i++) {
        const x = i * sw;
        const grad = dCtx.createLinearGradient(x, 0, x + sw, 0);
        grad.addColorStop(0, '#7d9384');
        grad.addColorStop(0.42, '#a8bcae');
        grad.addColorStop(0.5, '#b2c5b7');
        grad.addColorStop(1, '#6f8476');
        dCtx.fillStyle = grad;
        dCtx.fillRect(x, 0, sw + 0.5, size);

        const bGrad = bCtx.createLinearGradient(x, 0, x + sw, 0);
        bGrad.addColorStop(0, '#686868');
        bGrad.addColorStop(0.5, '#f2f2f2');
        bGrad.addColorStop(1, '#686868');
        bCtx.fillStyle = bGrad;
        bCtx.fillRect(x, 0, sw + 0.5, size);
      }

      drawGridGrout(dCtx, bCtx, size, 2, 1, '#687b6f', 2, false);
      return { diff, bump };
    },
  },
  {
    id: 'zellige-ocean',
    name: 'Maiolica Azzurro Mare',
    subtitle: 'Mattoncino lucido 10×30 artigianale',
    scaleU: 0.9,
    scaleV: 0.6,
    roughness: 0.14,
    metalness: 0.05,
    bumpScale: 0.015,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(703);
      const cols = 3;
      const rows = 6;
      const cw = size / cols;
      const ch = size / rows;

      bCtx.fillStyle = '#d4d4d4';
      bCtx.fillRect(0, 0, size, size);

      for (let r = 0; r < rows; r++) {
        const shift = r % 2 === 1 ? cw * 0.5 : 0;
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + shift;
          const y = r * ch;
          const hueShift = (rand() - 0.5) * 14;
          const lightShift = (rand() - 0.5) * 10;
          dCtx.fillStyle = `hsl(${196 + hueShift}, 46%, ${52 + lightShift}%)`;
          dCtx.fillRect(x, y, cw, ch);

          // Glossy glaze variation
          const g = dCtx.createRadialGradient(
            x + cw * (0.3 + rand() * 0.4),
            y + ch * (0.3 + rand() * 0.4),
            4,
            x + cw * 0.5,
            y + ch * 0.5,
            cw * 0.7
          );
          g.addColorStop(0, 'rgba(255,255,255,0.18)');
          g.addColorStop(1, 'rgba(15,55,80,0.12)');
          dCtx.fillStyle = g;
          dCtx.fillRect(x, y, cw, ch);
        }
      }

      drawGridGrout(dCtx, bCtx, size, cols, rows, '#e4e9ec', 3.5, true);
      return { diff, bump };
    },
  },
  {
    id: 'travertino-warm',
    name: 'Travertino Navona Caldo',
    subtitle: 'Pietra romana 60×120 naturale',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.48,
    metalness: 0.02,
    bumpScale: 0.014,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(704);
      dCtx.fillStyle = '#e5dac7';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#d4d4d4';
      bCtx.fillRect(0, 0, size, size);

      // Horizontal sedimentary bands
      for (let i = 0; i < 95; i++) {
        const y = rand() * size;
        const h = 2 + rand() * 12;
        dCtx.fillStyle =
          rand() > 0.45 ? 'rgba(202,184,156,0.32)' : 'rgba(245,239,228,0.34)';
        dCtx.fillRect(0, y, size, h);
        bCtx.fillStyle = rand() > 0.5 ? 'rgba(180,180,180,0.26)' : 'rgba(232,232,232,0.26)';
        bCtx.fillRect(0, y, size, h);
      }

      drawGridGrout(dCtx, bCtx, size, 1, 2, '#cbbba2', 2.4, false);
      return { diff, bump };
    },
  },
  {
    id: 'warm-lime-minimal',
    name: 'Gres Calce Bianca',
    subtitle: 'Lastra 60×60 effetto spatolato',
    scaleU: 1.2,
    scaleV: 1.2,
    roughness: 0.55,
    metalness: 0.01,
    bumpScale: 0.008,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(705);
      dCtx.fillStyle = '#f2efe9';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#dadada';
      bCtx.fillRect(0, 0, size, size);

      for (let i = 0; i < 24; i++) {
        const cx = rand() * size;
        const cy = rand() * size;
        const r = 60 + rand() * 120;
        const g = dCtx.createRadialGradient(cx, cy, 4, cx, cy, r);
        g.addColorStop(0, 'rgba(226,220,210,0.28)');
        g.addColorStop(1, 'rgba(242,239,233,0)');
        dCtx.fillStyle = g;
        dCtx.fillRect(0, 0, size, size);
      }

      drawGridGrout(dCtx, bCtx, size, 2, 2, '#ded9cf', 2, false);
      return { diff, bump };
    },
  },
  {
    id: 'hex-mosaic-pearl',
    name: 'Mosaico Esagonale Perla',
    subtitle: 'Tessere esagonali grigio/bianco',
    scaleU: 0.65,
    scaleV: 0.65,
    roughness: 0.3,
    metalness: 0.04,
    bumpScale: 0.018,
    build() {
      const { size, diff, bump, dCtx, bCtx } = createCanvasPair(512);
      const rand = mulberry32(706);
      dCtx.fillStyle = '#aeb4ba';
      dCtx.fillRect(0, 0, size, size);
      bCtx.fillStyle = '#484848';
      bCtx.fillRect(0, 0, size, size);

      const palette = ['#e9edf0', '#dfe4e8', '#cfd6dc', '#f5f7f8', '#c1c9d0'];
      const cols = 8;
      const dx = size / cols;
      const r = dx / Math.sqrt(3);
      const dy = r * 1.5;
      const rows = Math.ceil(size / dy) + 2;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col <= cols + 1; col++) {
          const cx = col * dx + (row % 2 !== 0 ? dx * 0.5 : 0);
          const cy = row * dy;
          dCtx.fillStyle = palette[Math.floor(rand() * palette.length)];
          bCtx.fillStyle = '#e0e0e0';

          const innerR = r * 0.9;
          dCtx.beginPath();
          bCtx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k + Math.PI / 6;
            const px = cx + Math.cos(a) * innerR;
            const py = cy + Math.sin(a) * innerR;
            if (k === 0) {
              dCtx.moveTo(px, py);
              bCtx.moveTo(px, py);
            } else {
              dCtx.lineTo(px, py);
              bCtx.lineTo(px, py);
            }
          }
          dCtx.closePath();
          bCtx.closePath();
          dCtx.fill();
          bCtx.fill();
        }
      }
      return { diff, bump };
    },
  },
];

export const PAINT_COLORS = [
  { id: 'warm-white', name: 'Bianco Caldo', hex: '#f4f1ea' },
  { id: 'dove-grey', name: 'Tortora Chiaro', hex: '#dfd9cf' },
  { id: 'soft-sage', name: 'Salvia Polvere', hex: '#cfd9d0' },
  { id: 'powder-blue', name: 'Carta da Zucchero', hex: '#cddbe4' },
  { id: 'terracotta-soft', name: 'Cipria Terracotta', hex: '#e5cfc4' },
];

export const VANITY_FINISHES = [
  { id: 'natural-oak', name: 'Rovere Naturale', hex: '#c29666', wood: true },
  { id: 'canaletto-walnut', name: 'Noce Canaletto', hex: '#6c4932', wood: true },
  { id: 'matte-white', name: 'Bianco Seta Opaco', hex: '#f1f0ec', wood: false },
  { id: 'forest-sage', name: 'Verde Bosco Opaco', hex: '#495f52', wood: false },
  { id: 'anthracite', name: 'Antracite Goffrato', hex: '#34383d', wood: false },
  { id: 'dusty-navy', name: 'Blu Notte Opaco', hex: '#35485c', wood: false },
];

function rotateCanvas90(srcCanvas) {
  const out = document.createElement('canvas');
  out.width = srcCanvas.height;
  out.height = srcCanvas.width;
  const ctx = out.getContext('2d');
  ctx.translate(out.width * 0.5, out.height * 0.5);
  ctx.rotate(Math.PI * 0.5);
  ctx.drawImage(srcCanvas, -srcCanvas.width * 0.5, -srcCanvas.height * 0.5);
  return out;
}

const BRAND_MEDIA_PREFIX = {
  tecnomat: '/tecnomat-media',
  baucer: '/baucer-media',
  armonie: '/armonie-media',
  florim: '/florim-media',
  mirage: '/mirage-media',
  caesar: '/caesar-media',
  fap: '/fap-media',
  bardelli: '/bardelli-media',
  serenissima: '/serenissima-media',
  delconca: '/delconca-media',
  demaio: '/demaio-media',
  fioranese: '/fioranese-media',
  tecnolam: '/tecnolam-media',
  atlas: '/atlas-media',
};

export function getCatalogItemKey(item) {
  const brand = item.brand || 'tecnomat';
  if (brand === 'tecnomat') return `tm:${item.sku}`;
  return `${brand}:${item.sku}`;
}

export function getCatalogItemThumbUrl(item) {
  const brand = item.brand || 'tecnomat';
  if (brand === 'tecnomat') {
    return `/tecnomat-media/${item.pic}?width=220&quality=80`;
  }
  const prefix = BRAND_MEDIA_PREFIX[brand] || `/${brand}-media`;
  return `${prefix}/${item.thumbPic || item.pic}`;
}

export class TextureLibrary {
  constructor(renderer) {
    this.maxAnisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    this.cache = new Map();
    this.woodGrainMap = this.createWoodCabinetTexture();
  }

  getPresetBundle(preset) {
    const cacheKey = `preset_${preset.id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const { diff, bump } = preset.build();
    const previewUrl = diff.toDataURL('image/jpeg', 0.86);

    const map = new THREE.CanvasTexture(diff);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / preset.scaleU, 1 / preset.scaleV);
    map.anisotropy = this.maxAnisotropy;

    const bumpMap = new THREE.CanvasTexture(bump);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(1 / preset.scaleU, 1 / preset.scaleV);
    bumpMap.anisotropy = this.maxAnisotropy;

    const bundle = {
      cacheKey,
      preset,
      diff,
      bump,
      scaleU: preset.scaleU,
      scaleV: preset.scaleV,
      map,
      bumpMap,
      previewUrl,
      roughness: preset.roughness,
      metalness: preset.metalness,
      bumpScale: preset.bumpScale,
    };
    this.cache.set(cacheKey, bundle);
    return bundle;
  }

  getOrientedBundle(baseBundle, rotated90 = false) {
    if (!rotated90 || !baseBundle) {
      return baseBundle;
    }
    const rotKey = `${baseBundle.cacheKey}_rot90`;
    if (this.cache.has(rotKey)) {
      return this.cache.get(rotKey);
    }

    const rotDiff = rotateCanvas90(baseBundle.diff);
    const rotBump = rotateCanvas90(baseBundle.bump);
    const rotScaleU = baseBundle.scaleV;
    const rotScaleV = baseBundle.scaleU;

    const map = new THREE.CanvasTexture(rotDiff);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / rotScaleU, 1 / rotScaleV);
    map.anisotropy = this.maxAnisotropy;

    const bumpMap = new THREE.CanvasTexture(rotBump);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(1 / rotScaleU, 1 / rotScaleV);
    bumpMap.anisotropy = this.maxAnisotropy;

    const oriented = {
      ...baseBundle,
      cacheKey: rotKey,
      diff: rotDiff,
      bump: rotBump,
      scaleU: rotScaleU,
      scaleV: rotScaleV,
      map,
      bumpMap,
      rotated90: true,
    };
    this.cache.set(rotKey, oriented);
    return oriented;
  }

  async getCatalogItemBundle(item) {
    const brand = item.brand || 'tecnomat';
    const cacheKey = `cat_${brand}_${item.sku}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const loadUrl = (url) =>
      new Promise((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Impossibile caricare texture ${brand} ${item.sku}`));
        el.src = url;
      });

    let loadedImgs = [];
    if (brand !== 'tecnomat') {
      const prefix = BRAND_MEDIA_PREFIX[brand] || `/${brand}-media`;
      const primaryUrl = `${prefix}/${item.pic}`;
      const fallbackUrl = item.thumbPic ? `${prefix}/${item.thumbPic}` : primaryUrl;
      const img = await loadUrl(primaryUrl).catch(() => loadUrl(fallbackUrl));
      loadedImgs = [img];
    } else {
      const facePaths =
        Array.isArray(item.faces) && item.faces.length > 0 ? item.faces.slice(0, 4) : [item.pic];
      const res = await Promise.all(
        facePaths.map((p, idx) => {
          const u = `/tecnomat-media/${p}?width=640&quality=86`;
          return idx === 0 ? loadUrl(u) : loadUrl(u).catch(() => null);
        })
      );
      loadedImgs = res.filter(Boolean);
    }

    const extracted = loadedImgs.map((im) =>
      this.extractStudioTile(im, item.w || 60, item.l || 60)
    );
    const tileCanvases = extracted.map((e) => e.tileCanvas);
    const avgRgb = extracted[0].avgRgb;

    const { diff, bump, scaleU, scaleV, roughness, bumpScale } = this.composeTecnomatSheet(
      tileCanvases,
      avgRgb,
      item
    );

    const map = new THREE.CanvasTexture(diff);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / scaleU, 1 / scaleV);
    map.anisotropy = this.maxAnisotropy;

    const bumpMap = new THREE.CanvasTexture(bump);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(1 / scaleU, 1 / scaleV);
    bumpMap.anisotropy = this.maxAnisotropy;

    const bundle = {
      cacheKey,
      item,
      diff,
      bump,
      scaleU,
      scaleV,
      map,
      bumpMap,
      roughness,
      metalness: 0.04,
      bumpScale,
      previewUrl: getCatalogItemThumbUrl(item),
    };
    this.cache.set(cacheKey, bundle);
    return bundle;
  }

  async getTecnomatBundle(item) {
    return this.getCatalogItemBundle(item);
  }

  extractStudioTile(img, wCm, lCm) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const src = document.createElement('canvas');
    src.width = iw;
    src.height = ih;
    const sCtx = src.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(img, 0, 0);
    const data = sCtx.getImageData(0, 0, iw, ih).data;

    // Sample studio background color from the 4 corners
    const cornerCoords = [
      [2, 2],
      [iw - 3, 2],
      [2, ih - 3],
      [iw - 3, ih - 3],
    ];
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let bgA = 0;
    for (const [cx, cy] of cornerCoords) {
      const ci = (Math.max(0, cy) * iw + Math.max(0, cx)) * 4;
      bgR += data[ci];
      bgG += data[ci + 1];
      bgB += data[ci + 2];
      bgA += data[ci + 3];
    }
    bgR /= 4;
    bgG /= 4;
    bgB /= 4;
    bgA /= 4;
    const cornersTransparent = bgA < 40;
    const cornersLookLikeStudioBg = !cornersTransparent && bgR > 228 && bgG > 228 && bgB > 228;

    const isNonBg = (x, y) => {
      const idx = (y * iw + x) * 4;
      const a = data[idx + 3];
      if (a < 40) return false;
      if (cornersTransparent) return true;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (cornersLookLikeStudioBg) {
        const diffBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        return diffBg > 18 || r < 244 || g < 244 || b < 244;
      }
      return r < 248 || g < 248 || b < 248;
    };

    let top = 0;
    let bottom = ih - 1;
    let left = 0;
    let right = iw - 1;

    // Use 3% threshold so narrow vertical planks (e.g. 15x120, 20x120, 6x25) are detected cleanly
    const minRowHits = Math.max(4, Math.floor(iw * 0.03));
    const minColHits = Math.max(4, Math.floor(ih * 0.03));

    for (let y = 0; y < ih; y++) {
      let hits = 0;
      for (let x = 0; x < iw; x += 2) {
        if (isNonBg(x, y)) hits += 2;
      }
      if (hits >= minRowHits) {
        top = y;
        break;
      }
    }

    for (let y = ih - 1; y >= top; y--) {
      let hits = 0;
      for (let x = 0; x < iw; x += 2) {
        if (isNonBg(x, y)) hits += 2;
      }
      if (hits >= minRowHits) {
        bottom = y;
        break;
      }
    }

    for (let x = 0; x < iw; x++) {
      let hits = 0;
      for (let y = top; y <= bottom; y += 2) {
        if (isNonBg(x, y)) hits += 2;
      }
      if (hits >= minColHits) {
        left = x;
        break;
      }
    }

    for (let x = iw - 1; x >= left; x--) {
      let hits = 0;
      for (let y = top; y <= bottom; y += 2) {
        if (isNonBg(x, y)) hits += 2;
      }
      if (hits >= minColHits) {
        right = x;
        break;
      }
    }

    let bw = right - left + 1;
    let bh = bottom - top + 1;

    // Fallback only if BOTH long & short axes failed (e.g. pure #FFFFFF glossy tile on #FFFFFF background)
    const longFrac = Math.max(bw / iw, bh / ih);
    const shortFrac = Math.min(bw / iw, bh / ih);
    if (longFrac < 0.32 || shortFrac < 0.04) {
      const ratio = Math.min(wCm, lCm) / Math.max(wCm, lCm);
      bw = Math.round(iw * 0.9);
      bh = Math.round(bw * ratio);
      left = Math.round((iw - bw) * 0.5);
      top = Math.round((ih - bh) * 0.5);
    }

    // Trim 2.5% inside the detected tile edges to remove studio anti-alias/shadow borders
    const insetX = Math.max(2, Math.round(bw * 0.025));
    const insetY = Math.max(2, Math.round(bh * 0.025));
    left += insetX;
    top += insetY;
    bw = Math.max(12, bw - insetX * 2);
    bh = Math.max(12, bh - insetY * 2);

    // Ensure horizontal axis corresponds to the longer dimension lCm
    const rotate90 = bh > bw * 1.12;
    const outW = rotate90 ? bh : bw;
    const outH = rotate90 ? bw : bh;

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = outW;
    tileCanvas.height = outH;
    const tCtx = tileCanvas.getContext('2d', { willReadFrequently: true });

    if (rotate90) {
      tCtx.translate(outW * 0.5, outH * 0.5);
      tCtx.rotate(Math.PI * 0.5);
      tCtx.drawImage(src, left, top, bw, bh, -bw * 0.5, -bh * 0.5, bw, bh);
      tCtx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      tCtx.drawImage(src, left, top, bw, bh, 0, 0, outW, outH);
    }

    // Sample average RGB for tone-matched grout
    const sample = tCtx.getImageData(0, 0, outW, outH).data;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let count = 0;
    const step = Math.max(4, Math.floor((outW * outH) / 600)) * 4;
    for (let i = 0; i < sample.length; i += step) {
      sr += sample[i];
      sg += sample[i + 1];
      sb += sample[i + 2];
      count++;
    }
    const avgRgb = count
      ? [Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)]
      : [190, 188, 184];

    return { tileCanvas, avgRgb };
  }

  composeTecnomatSheet(tileCanvases, avgRgb, item) {
    const canvases = Array.isArray(tileCanvases) ? tileCanvases : [tileCanvases];
    const size = 1024;
    const { diff, bump, dCtx, bCtx } = createCanvasPair(size);

    const wM = Math.max(0.08, (item.w || 60) / 100);
    const lM = Math.max(0.08, (item.l || 60) / 100);
    const aspect = lM / wM;

    const groutR = Math.round(avgRgb[0] * 0.78 + 26);
    const groutG = Math.round(avgRgb[1] * 0.78 + 26);
    const groutB = Math.round(avgRgb[2] * 0.78 + 26);
    const groutColor = `rgb(${groutR},${groutG},${groutB})`;
    const groutPx = item.effect === 'Mosaico' ? 1.4 : item.rect ? 2.4 : 4.2;

    bCtx.fillStyle = '#cfcfcf';
    bCtx.fillRect(0, 0, size, size);

    const drawTileVariant = (ctx, srcCanvas, x, y, w, h, flip180) => {
      ctx.save();
      if (flip180) {
        ctx.translate(x + w * 0.5, y + h * 0.5);
        ctx.rotate(Math.PI);
        ctx.drawImage(srcCanvas, -w * 0.5, -h * 0.5, w, h);
      } else {
        ctx.drawImage(srcCanvas, x, y, w, h);
      }
      ctx.restore();
    };

    let scaleU;
    let scaleV;

    if (aspect >= 2.2) {
      // Staggered running bond for planks & brick tiles (e.g. 20x120, 15x90, 10x30)
      const cols = 2;
      const rows = 5;
      scaleU = cols * lM;
      scaleV = rows * wM;
      const cw = size / cols;
      const ch = size / rows;
      const offsets = [0, 0.5, 0.25, 0.75, 0.35];

      for (let r = 0; r < rows; r++) {
        const y = r * ch;
        const shift = offsets[r % offsets.length] * cw;
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + shift;
          const faceIdx = Math.abs(r * 3 + c + 4) % canvases.length;
          const flip = canvases.length === 1 ? (r + c) % 2 !== 0 : (r + c) % 3 === 0;
          drawTileVariant(dCtx, canvases[faceIdx], x, y, cw + 0.5, ch + 0.5, flip);
        }

        // Horizontal seam
        dCtx.strokeStyle = groutColor;
        dCtx.lineWidth = groutPx;
        dCtx.beginPath();
        dCtx.moveTo(0, y);
        dCtx.lineTo(size, y);
        dCtx.stroke();

        bCtx.strokeStyle = '#3c3c3c';
        bCtx.lineWidth = groutPx + 1.4;
        bCtx.beginPath();
        bCtx.moveTo(0, y);
        bCtx.lineTo(size, y);
        bCtx.stroke();

        // Vertical staggered seams
        for (let c = -1; c <= cols; c++) {
          const sx = c * cw + shift;
          if (sx < 0 || sx > size) continue;
          dCtx.beginPath();
          dCtx.moveTo(sx, y);
          dCtx.lineTo(sx, y + ch);
          dCtx.stroke();

          bCtx.beginPath();
          bCtx.moveTo(sx, y);
          bCtx.moveTo(sx, y);
          bCtx.lineTo(sx, y + ch);
          bCtx.stroke();
        }
      }
    } else {
      // 2x2 slab/square grid using real multi-face scans when available
      const cols = 2;
      const rows = 2;
      scaleU = cols * lM;
      scaleV = rows * wM;
      const cw = size / cols;
      const ch = size / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * 2 + c) % canvases.length;
          const flip =
            item.effect !== 'Mosaico' && canvases.length === 1 && (r + c) % 2 === 1;
          drawTileVariant(dCtx, canvases[idx], c * cw, r * ch, cw + 0.5, ch + 0.5, flip);
        }
      }

      drawGridGrout(dCtx, bCtx, size, cols, rows, groutColor, groutPx, false);
    }

    // Derive surface roughness & micro-relief from Tecnomat finish metadata
    const fin = String(item.finish || '').toLowerCase();
    let roughness = 0.52;
    let bumpScale = 0.011;
    if (fin.includes('levigat') || fin.includes('lucid') || fin.includes('lappat')) {
      roughness = 0.15;
      bumpScale = 0.005;
    } else if (fin.includes('strutturat') || fin.includes('anticat')) {
      roughness = 0.68;
      bumpScale = 0.018;
    } else if (fin.includes('satinat') || fin.includes('smaltat')) {
      roughness = 0.36;
      bumpScale = 0.009;
    }

    return { diff, bump, scaleU, scaleV, roughness, bumpScale };
  }

  createWoodCabinetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const rand = mulberry32(909);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const y = rand() * 256;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(175,155,135,0.28)' : 'rgba(245,240,235,0.32)';
      ctx.lineWidth = 0.8 + rand() * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(85, y + (rand() - 0.5) * 8, 170, y + (rand() - 0.5) * 8, 256, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
}

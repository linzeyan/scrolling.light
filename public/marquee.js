import { boardRuns } from './state.js';

/**
 * One line of text scrolling across a board, as plain text or as an LED dot
 * matrix. Shared by the viewer and the editor preview, so the preview is
 * exactly what plays. Canvas rather than DOM because the LED look samples the
 * text once per dot.
 */

const SYSTEM_FONT = 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
/** LED rows with the pixel font: its 14-pixel line plus a dark row above and below. */
export const PIXEL_ROWS = 16;
// The web fonts download only once a sign uses them. Characters they lack
// fall back to the system font.
const FONTS = {
  system: { family: SYSTEM_FONT },
  // Split into ~100 files by character, fetched as the text needs them.
  noto: { family: `"Noto Sans TC Variable", ${SYSTEM_FONT}`, css: '/fonts/noto-sans-tc/wght.css' },
  // Drawn on a 12px grid. At exactly one font pixel per dot its hand-placed
  // pixels stay legible on 16 rows, where outline fonts turn to mush, so in
  // LED mode it sets the rows. It has no bold, and a synthesized one smears.
  pixel: { family: `"Cubic 11", ${SYSTEM_FONT}`, grid: 12, rows: PIXEL_ROWS, weight: 400 },
};
// Past this the sign opens in the fallback font rather than stay blank.
const FONT_TIMEOUT = 3000;
// Bold reads best as smooth text, but at one pixel per dot its strokes fill
// the one-dot gaps between them and dense characters (歡, 臨) become blobs.
const PLAIN_WEIGHT = 700;
const LED_WEIGHT = 400;
// The board is never taller than this share of its width: on a portrait
// phone, a band showing a few characters beats one glyph filling the screen.
const MAX_BOARD_ASPECT = 0.6;
const PLAIN_INK = 0.8; // share of the board height the plain text's ink fills
const LED_MARGIN = 0.06; // share of the rows kept dark above and below the text
const DOT_RADIUS = 0.4; // of the dot pitch
const OFF_DOT_MIX = 0.14; // unlit dots: this much of the text color over the background
const GLOW_ALPHA = 0.2; // more fills the dark gaps that keep strokes apart
const LIT_ALPHA = 128; // of 255: a text pixel at least this opaque lights its dot
// Browsers refuse canvases with a side much past 32k pixels; a very long LED
// message is cut off there rather than not drawing at all.
const MAX_CANVAS_SIDE = 32000;
// 3× canvases on phones cost memory without visibly sharper dots.
const MAX_DPR = 2;

function canvas(w = 0, h = 0) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function mix(bg, fg, t) {
  const a = parseInt(bg, 16);
  const b = parseInt(fg, 16);
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/**
 * The font that makes the text's ink exactly `inkHeight` tall, filling the
 * board whatever the script. Cap height is the floor, so lowercase-only text
 * isn't blown up past where capitals would reach.
 */
function fitText(ctx, text, inkHeight, weight, family) {
  ctx.font = `${weight} 100px ${family}`;
  const m = ctx.measureText(text);
  const ascent = Math.max(m.actualBoundingBoxAscent, ctx.measureText('H').actualBoundingBoxAscent);
  const descent = Math.max(m.actualBoundingBoxDescent, 0);
  const k = inkHeight / (ascent + descent);
  const font = `${weight} ${100 * k}px ${family}`;
  ctx.font = font;
  return { font, baseline: ascent * k };
}

/** A pixel font at its grid size, one font pixel per dot, its ink centered on whole dots. */
function gridText(ctx, text, inkHeight, { family, grid }) {
  const font = `${grid}px ${family}`;
  ctx.font = font;
  const m = ctx.measureText(text);
  const ascent = Math.ceil(m.actualBoundingBoxAscent);
  const descent = Math.ceil(m.actualBoundingBoxDescent);
  return { font, baseline: Math.round((inkHeight - ascent - descent) / 2) + ascent };
}

const weightOf = (s) => FONTS[s.font].weight ?? (s.led ? LED_WEIGHT : PLAIN_WEIGHT);

const sheets = new Map();

/** Resolves once the sign's font can draw everything it may show; null when there's nothing to wait for. */
function loadFont(s) {
  const f = FONTS[s.font];
  if (f === FONTS.system) return null;
  if (f.css && !sheets.has(f.css)) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: f.css });
    sheets.set(f.css, new Promise((done) => (link.onload = link.onerror = done)));
    document.head.append(link);
  }
  const text = `${s.message}${s.zero ?? ''}0123456789:天`;
  const load = (sheets.get(f.css) ?? Promise.resolve()).then(() => document.fonts.load(`${weightOf(s)} 100px ${f.family}`, text));
  // ponytail: a font that arrives after the timeout shows from the next update
  // or resize; listen for document.fonts `loadingdone` if that's ever too late.
  return Promise.race([load, new Promise((done) => setTimeout(done, FONT_TIMEOUT))]).catch(() => {});
}

/** Width of the widest digit in the current font: every countdown digit gets a cell this wide. */
function digitCell(ctx) {
  return Math.max(...[...'0123456789'].map((d) => ctx.measureText(d).width));
}

/** Lays runs out left to right from `x`, drawing them if `draw`. Returns their width. */
function runText(ctx, runs, x, y, cell, draw) {
  let w = 0;
  for (const run of runs) {
    for (const piece of run.digits ? run.text.match(/\d|\D+/g) : [run.text]) {
      const pw = ctx.measureText(piece).width;
      const box = run.digits && /\d/.test(piece) ? cell : pw;
      if (draw) ctx.fillText(piece, x + w + (box - pw) / 2, y);
      w += box;
    }
  }
  return w;
}

export class Marquee {
  constructor(root) {
    this.root = root;
    this.grid = canvas(); // background and unlit dots, drawn on layout
    this.lit = canvas(); // the moving text, drawn every frame
    this.settings = null;
    this.geo = null;
    // How far into the current pass the text is, in text heights. Kept
    // within one pass, so text that changes length (typing, a countdown)
    // stays where it is instead of jumping, and a resize carries on.
    this.phase = 0;
    this.textKey = null;
    this.deadline = null;
    this.timer = null;
    this.raf = 0;
    this.last = 0;
    root.classList.add('mq');
    root.append(this.grid, this.lit);
    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(root);
  }

  update(settings) {
    this.pending = settings;
    // Held back until the font is in, so a sign doesn't open in a fallback
    // font and then jump to its own, which may have other rows.
    const ready = loadFont(settings);
    if (!ready) return this.apply(settings);
    ready.then(() => {
      if (this.pending === settings) this.apply(settings);
    });
  }

  apply(settings) {
    this.settings = settings;
    // A timer runs from when it is first shown and restarts only when its length changes.
    if (settings.timer === null) this.timer = null;
    else if (this.timer?.seconds !== settings.timer) this.timer = { seconds: settings.timer, start: Date.now() };
    this.deadline = this.timer ? this.timer.start + this.timer.seconds * 1000 : settings.until;
    this.layout();
  }

  destroy() {
    this.pending = null;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.root.replaceChildren();
    this.root.classList.remove('mq');
  }

  layout() {
    const s = this.settings;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = Math.round(this.root.clientWidth * dpr);
    const H = Math.round(this.root.clientHeight * dpr);
    cancelAnimationFrame(this.raf);
    if (!s || !W || !H) return;
    for (const c of [this.grid, this.lit]) {
      // Assigning a size clears the canvas, even the same size.
      if (c.width !== W) c.width = W;
      if (c.height !== H) c.height = H;
    }
    const boardH = Math.min(H, Math.round(W * MAX_BOARD_ASPECT));
    const top = Math.round((H - boardH) / 2);
    const g = this.grid.getContext('2d');
    g.fillStyle = `#${s.bg}`;
    g.fillRect(0, 0, W, H);
    this.geo = s.led ? this.ledLayout(g, W, H, boardH, top) : { W, H, boardH, top, across: W };
    this.textKey = null;
    this.raster();
    // Drawn now, not on the next frame, so editing doesn't flash an empty board.
    this.draw();
    if (!s.message.trim() && this.deadline === null) return;
    this.last = performance.now();
    const tick = (now) => {
      // Capped, so a tab coming back from the background resumes instead of jumping.
      this.phase += (Math.min(100, Math.max(0, now - this.last)) / 1000) * s.speed;
      this.last = now;
      if (this.deadline !== null) this.raster();
      this.wrap();
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  ledLayout(g, W, H, boardH, top) {
    const s = this.settings;
    const rows = FONTS[s.font].rows ?? s.led;
    const pitch = boardH / rows;
    const cols = Math.max(1, Math.floor(W / pitch));
    const left = (W - cols * pitch) / 2;
    const r = pitch * DOT_RADIUS;
    const dots = new Path2D();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = left + (x + 0.5) * pitch;
        const cy = top + (y + 0.5) * pitch;
        dots.moveTo(cx + r, cy);
        dots.arc(cx, cy, r, 0, 2 * Math.PI);
      }
    }
    g.fillStyle = mix(s.bg, s.fg, OFF_DOT_MIX);
    g.fill(dots);
    // Every frame is cut to this, turning lit cells into round LEDs.
    const mask = canvas(W, H);
    mask.getContext('2d').fill(dots);
    return { W, H, rows, cols, pitch, left, top, mask, frame: canvas(cols, rows), across: cols };
  }

  /** Re-renders the text when what the board shows has changed, such as a countdown ticking. */
  raster() {
    const { settings: s, geo: g } = this;
    const runs = boardRuns(s, this.deadline, Date.now());
    const key = runs.map((r) => r.text).join('\n');
    if (key === this.textKey) return;
    this.textKey = key;
    g.blank = !key.trim();
    const joined = runs.map((r) => r.text).join('');
    const f = FONTS[s.font];
    if (!s.led) {
      const ctx = this.lit.getContext('2d');
      const unit = g.boardH * PLAIN_INK;
      const fit = fitText(ctx, joined, unit, weightOf(s), f.family);
      const cell = digitCell(ctx);
      Object.assign(g, { runs, cell, unit, font: fit.font, baseline: g.top + (g.boardH - unit) / 2 + fit.baseline });
      g.width = runText(ctx, runs, 0, 0, cell, false);
    } else {
      // The text at one pixel per dot, thresholded so that at rest each LED
      // is fully on or off. Its own colors are kept, so emoji light up in color.
      const margin = Math.round(g.rows * LED_MARGIN);
      const unit = g.rows - 2 * margin;
      const text = canvas();
      const t = text.getContext('2d', { willReadFrequently: true });
      const fit = f.grid ? gridText(t, joined, unit, f) : fitText(t, joined, unit, weightOf(s), f.family);
      const cell = digitCell(t);
      text.width = Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.ceil(runText(t, runs, 0, 0, cell, false))));
      text.height = g.rows;
      t.font = fit.font; // resizing a canvas resets its context
      t.fillStyle = `#${s.fg}`;
      runText(t, runs, 0, margin + fit.baseline, cell, true);
      const img = t.getImageData(0, 0, text.width, g.rows);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= LIT_ALPHA ? 255 : 0;
      t.putImageData(img, 0, 0);
      Object.assign(g, { text, unit, width: text.width });
    }
    g.span = g.across + g.width;
    this.wrap();
  }

  /** Back to the start of a pass once the text is fully off the board. */
  wrap() {
    const g = this.geo;
    const pass = g.span / g.unit;
    if (this.phase >= pass) this.phase %= pass;
  }

  draw() {
    const { geo: g, settings: s } = this;
    const ctx = this.lit.getContext('2d');
    ctx.clearRect(0, 0, g.W, g.H);
    if (g.blank) return;
    // Enters at one edge and leaves fully past the other before coming round again.
    const p = this.phase * g.unit;
    const x = s.dir === 'right' ? p - g.width : g.across - p;
    if (!s.led) {
      ctx.font = g.font;
      ctx.fillStyle = `#${s.fg}`;
      runText(ctx, g.runs, x, g.baseline, g.cell, true);
      return;
    }
    const f = g.frame.getContext('2d');
    f.clearRect(0, 0, g.cols, g.rows);
    // A fractional offset is filtered across neighbouring dots, so the text
    // glides through fixed LEDs instead of jumping a whole dot at a time. A
    // pixel font steps whole dots, like a real sign: blended across two dots,
    // its glyphs would show as drawn on hardly any frame.
    f.drawImage(g.text, FONTS[s.font].grid ? Math.round(x) : x, 0);
    const w = g.cols * g.pitch;
    const h = g.rows * g.pitch;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(g.frame, g.left, g.top, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(g.mask, 0, 0);
    // Glow: the same frame upscaled smoothly, which blurs it, slipped in behind the dots.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.drawImage(g.frame, g.left, g.top, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

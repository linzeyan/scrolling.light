/**
 * One line of text scrolling right to left across a board, as plain text or
 * as an LED dot matrix. Shared by the viewer and the editor preview, so the
 * preview is exactly what plays. Canvas rather than DOM because the LED look
 * samples the text once per dot.
 */

const FONT_FAMILY = 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
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
function fitText(ctx, text, inkHeight, weight) {
  ctx.font = `${weight} 100px ${FONT_FAMILY}`;
  const m = ctx.measureText(text);
  const ascent = Math.max(m.actualBoundingBoxAscent, ctx.measureText('H').actualBoundingBoxAscent);
  const descent = Math.max(m.actualBoundingBoxDescent, 0);
  const k = inkHeight / (ascent + descent);
  const font = `${weight} ${100 * k}px ${FONT_FAMILY}`;
  ctx.font = font;
  return { font, baseline: ascent * k, width: Math.ceil(ctx.measureText(text).width) };
}

export class Marquee {
  constructor(root) {
    this.root = root;
    this.grid = canvas(); // background and unlit dots, drawn on layout
    this.lit = canvas(); // the moving text, drawn every frame
    this.settings = null;
    this.geo = null;
    // Distance scrolled, in text heights, so a resize carries on instead of restarting.
    this.travel = 0;
    this.raf = 0;
    this.last = 0;
    root.classList.add('mq');
    root.append(this.grid, this.lit);
    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(root);
  }

  update(settings) {
    this.settings = settings;
    this.layout();
  }

  destroy() {
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
    this.geo = s.led ? this.ledLayout(g, W, H, boardH, top) : this.plainLayout(W, H, boardH, top);
    // Drawn now, not on the next frame, so editing doesn't flash an empty board.
    this.draw();
    if (!s.message.trim()) return;
    this.last = performance.now();
    const tick = (now) => {
      // Capped, so a tab coming back from the background resumes instead of jumping.
      this.travel += (Math.min(100, Math.max(0, now - this.last)) / 1000) * s.speed;
      this.last = now;
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  ledLayout(g, W, H, boardH, top) {
    const s = this.settings;
    const rows = s.led;
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

    // The text at one pixel per dot, thresholded so that at rest each LED is
    // fully on or off. Its own colors are kept, so emoji light up in color.
    const margin = Math.round(rows * LED_MARGIN);
    const unit = rows - 2 * margin;
    const text = canvas();
    const t = text.getContext('2d', { willReadFrequently: true });
    const fit = fitText(t, s.message, unit, LED_WEIGHT);
    text.width = Math.max(1, Math.min(MAX_CANVAS_SIDE, fit.width));
    text.height = rows;
    t.font = fit.font; // resizing a canvas resets its context
    t.fillStyle = `#${s.fg}`;
    t.fillText(s.message, 0, margin + fit.baseline);
    const img = t.getImageData(0, 0, text.width, rows);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= LIT_ALPHA ? 255 : 0;
    t.putImageData(img, 0, 0);

    return { W, H, rows, cols, pitch, left, top, mask, text, frame: canvas(cols, rows), unit, across: cols, span: cols + text.width };
  }

  plainLayout(W, H, boardH, top) {
    const unit = boardH * PLAIN_INK;
    const fit = fitText(this.lit.getContext('2d'), this.settings.message, unit, PLAIN_WEIGHT);
    return { W, H, font: fit.font, baseline: top + (boardH - unit) / 2 + fit.baseline, unit, across: W, span: W + fit.width };
  }

  draw() {
    const { geo: g, settings: s } = this;
    const ctx = this.lit.getContext('2d');
    ctx.clearRect(0, 0, g.W, g.H);
    if (!s.message.trim()) return;
    // Enters at the right edge and leaves fully past the left before coming round again.
    const x = g.across - ((this.travel * g.unit) % g.span);
    if (!s.led) {
      ctx.font = g.font;
      ctx.fillStyle = `#${s.fg}`;
      ctx.fillText(s.message, x, g.baseline);
      return;
    }
    const f = g.frame.getContext('2d');
    f.clearRect(0, 0, g.cols, g.rows);
    // A fractional offset is filtered across neighbouring dots, so the text
    // glides through fixed LEDs instead of jumping a whole dot at a time.
    f.drawImage(g.text, x, 0);
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

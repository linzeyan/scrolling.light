/**
 * The URL fragment is the whole display:
 *   #<message>&fg=ffb000&bg=000000&speed=2&led=32&dir=left&font=pixel&timer=5m&zero=…
 * The message is everything before the first unencoded `&`. Browsers never
 * send the fragment to a server, so a message stays between the link and the
 * screen. The format, its encoding and the countdown parameters follow
 * BIGWORDS.PAGE (MIT, see THIRD_PARTY_NOTICES.md), so links read the same way
 * in both.
 */

// 32 rows is about where dense Chinese characters stop merging into blobs.
export const DEFAULTS = Object.freeze({ fg: 'ffb000', bg: '000000', speed: 2, led: 32, dir: 'left', font: 'system' });
// The device's own font, Noto Sans TC (looks the same everywhere), Cubic 11 (a pixel font).
const FONTS = ['system', 'noto', 'pixel'];
export const COUNTDOWN = '{countdown}';
/** Longest `timer`, in seconds (99 days). */
export const MAX_TIMER = 99 * 86400;

/** decodeURIComponent that never throws: malformed sequences are kept as typed. */
export function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        // Decode byte by byte, keeping only the sequences that are valid.
        return run.replace(/%[0-9a-fA-F]{2}/g, (b) => {
          const code = parseInt(b.slice(1), 16);
          return code < 0x80 ? String.fromCharCode(code) : b;
        });
      }
    });
  }
}

/** Parse a fragment, with or without the leading `#`. */
export function parseFragment(hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [first, ...rest] = raw.split('&');
  const params = {};
  for (const seg of rest) {
    const eq = seg.indexOf('=');
    const key = safeDecode(eq === -1 ? seg : seg.slice(0, eq)).trim().toLowerCase();
    if (key) params[key] = eq === -1 ? '' : safeDecode(seg.slice(eq + 1));
  }
  return { message: safeDecode(first), params };
}

const hex = (v) => {
  const s = v?.trim().replace(/^#/, '') ?? '';
  return /^[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
};
const decimal = (v) => (/^\d+(\.\d+)?$/.test(v?.trim() ?? '') ? parseFloat(v) : null);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const pad2 = (n) => String(n).padStart(2, '0');

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/** ISO 8601 date and time, in ms since the epoch. Without a zone it is the viewing device's local time. */
export function parseUntil(v) {
  const m = ISO_RE.exec(v?.trim() ?? '');
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', ms = '0', zone] = m;
  const parts = [+y, +mo - 1, +d, +h, +mi, +s, +ms.padEnd(3, '0')];
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 59) return null;
  let date;
  if (zone) {
    let offset = 0;
    if (zone.toUpperCase() !== 'Z') {
      const z = zone.replace(':', '');
      offset = (z[0] === '-' ? -1 : 1) * (parseInt(z.slice(1, 3), 10) * 60 + parseInt(z.slice(3, 5), 10));
    }
    date = new Date(Date.UTC(...parts) - offset * 60_000);
  } else {
    date = new Date(...parts);
  }
  // Reject impossible dates such as Feb 30.
  const check = zone ? new Date(Date.UTC(...parts)) : date;
  const day = zone ? check.getUTCDate() : check.getDate();
  return Number.isNaN(date.getTime()) || day !== +d ? null : date.getTime();
}

const UNIT_SECONDS = { d: 86400, h: 3600, m: 60, s: 1 };

/**
 * A `timer` length in seconds: whole seconds (`300`), or amounts of d, h, m
 * and s in any order (`4h`, `1h30m`). Units add up and may overflow (`90m`).
 */
export function parseTimer(v) {
  const str = v?.trim().toLowerCase().replace(/\s+/g, '') ?? '';
  let total;
  if (/^\d+$/.test(str)) total = parseInt(str, 10);
  else if (/^(\d+[dhms])+$/.test(str)) {
    total = 0;
    for (const [, n, unit] of str.matchAll(/(\d+)([dhms])/g)) total += parseInt(n, 10) * UNIT_SECONDS[unit];
  } else return null;
  return total > 0 ? Math.min(total, MAX_TIMER) : null;
}

/** Seconds as the shortest `timer` value, largest unit first (`2d4h`, `1h30m`). */
export function formatTimer(total) {
  let rest = Math.max(0, Math.floor(total));
  let out = '';
  for (const [unit, size] of Object.entries(UNIT_SECONDS)) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n) out += `${n}${unit}`;
  }
  return out;
}

/** Settings from a parsed fragment. Invalid values fall back to the default; out-of-range numbers are clamped. */
export function resolveSettings({ message, params: p }) {
  const speed = decimal(p.speed);
  const led = p.led?.trim().toLowerCase();
  const rows = decimal(led);
  // `until` and `timer` exclude each other: whichever comes first in the link wins.
  const source = Object.keys(p).find((k) => (k === 'until' || k === 'timer') && p[k].trim() !== '');
  const zero = p.zero?.trim() ?? '';
  const font = p.font?.trim().toLowerCase();
  return {
    message,
    fg: hex(p.fg) ?? DEFAULTS.fg,
    bg: hex(p.bg) ?? DEFAULTS.bg,
    // Text heights per second, so a phone and a TV scroll at the same reading pace.
    speed: speed === null ? DEFAULTS.speed : clamp(Math.round(speed * 10) / 10, 0.5, 10),
    // `off` is the plain-text look; a number is how many rows of dots the board has.
    led: led === 'off' ? 0 : rows === null ? DEFAULTS.led : clamp(Math.round(rows), 8, 64),
    dir: p.dir?.trim().toLowerCase() === 'right' ? 'right' : 'left',
    font: FONTS.includes(font) ? font : DEFAULTS.font,
    until: source === 'until' ? parseUntil(p.until) : null,
    timer: source === 'timer' ? parseTimer(p.timer) : null,
    // null holds the countdown at zero; anything else replaces the message once it gets there.
    zero: zero === '' || zero.toLowerCase() === 'freeze' ? null : p.zero,
  };
}

/**
 * Percent-encode for the fragment. Everything that could be ambiguous is
 * encoded; characters that are harmless in a fragment stay readable.
 */
function encode(s) {
  return encodeURIComponent(s).replace(/%(3A|2F|3F|40|2C|3B|3D|2B|24|21)/gi, (m) => decodeURIComponent(m));
}

/** The shortest fragment for these settings: values left at their default are dropped. */
export function toFragment(s) {
  const parts = [encode(s.message)];
  const add = (key, value) => parts.push(`${key}=${value}`);
  if (s.fg !== DEFAULTS.fg) add('fg', s.fg);
  if (s.bg !== DEFAULTS.bg) add('bg', s.bg);
  if (s.speed !== DEFAULTS.speed) add('speed', s.speed);
  if (s.led !== DEFAULTS.led) add('led', s.led || 'off');
  if (s.dir !== DEFAULTS.dir) add('dir', s.dir);
  if (s.font !== DEFAULTS.font) add('font', s.font);
  // In UTC, so the countdown ends at the same moment wherever the link is opened.
  if (s.until !== null) add('until', new Date(s.until).toISOString().replace(/\.\d+Z$/, 'Z'));
  if (s.timer !== null) add('timer', formatTimer(s.timer));
  if (s.zero !== null) add('zero', encode(s.zero));
  // Chat apps and linkifiers end a link before trailing punctuation, so a
  // link ending in "!" or "." would lose it. Encode any such tail.
  return parts
    .join('&')
    .replace(/[!'()*,.:;?~]+$/, (tail) => [...tail].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).join(''));
}

/** Time left as the board shows it: `2天 03:04:05`, `3:04:05`, `4:05`. Rounded up, so it reads 0:00 only once time is up. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d) return `${d}天 ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  if (h) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

/**
 * What the board shows at `now`, as runs of text. Countdown runs are flagged
 * so they get fixed-width digits and the text after them doesn't wobble as
 * they tick. With a countdown and no message, the countdown shows on its own.
 */
export function boardRuns(s, deadline, now) {
  if (deadline === null) return [{ text: s.message, digits: false }];
  const left = deadline - now;
  if (left <= 0 && s.zero !== null) return [{ text: s.zero, digits: false }];
  const countdown = formatCountdown(left);
  const message = s.message.trim() ? s.message : COUNTDOWN;
  return message
    .split(COUNTDOWN)
    .flatMap((text, i) => (i ? [{ text: countdown, digits: true }, { text, digits: false }] : [{ text, digits: false }]))
    .filter((r) => r.text);
}

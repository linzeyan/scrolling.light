/**
 * The URL fragment is the whole display:
 *   #<message>&fg=ffb000&bg=000000&speed=2&led=32
 * The message is everything before the first unencoded `&`. Browsers never
 * send the fragment to a server, so a message stays between the link and the
 * screen. The format and its encoding follow BIGWORDS.PAGE (MIT, see
 * THIRD_PARTY_NOTICES.md), so links read the same way in both.
 */

// 32 rows is about where dense Chinese characters stop merging into blobs.
export const DEFAULTS = Object.freeze({ fg: 'ffb000', bg: '000000', speed: 2, led: 32 });

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

/** Settings from a parsed fragment. Invalid values fall back to the default; out-of-range numbers are clamped. */
export function resolveSettings({ message, params: p }) {
  const speed = decimal(p.speed);
  const led = p.led?.trim().toLowerCase();
  const rows = decimal(led);
  return {
    message,
    fg: hex(p.fg) ?? DEFAULTS.fg,
    bg: hex(p.bg) ?? DEFAULTS.bg,
    // Text heights per second, so a phone and a TV scroll at the same reading pace.
    speed: speed === null ? DEFAULTS.speed : clamp(Math.round(speed * 10) / 10, 0.5, 10),
    // `off` is the plain-text look; a number is how many rows of dots the board has.
    led: led === 'off' ? 0 : rows === null ? DEFAULTS.led : clamp(Math.round(rows), 8, 64),
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
  for (const [key, def] of Object.entries(DEFAULTS)) {
    if (s[key] !== def) parts.push(`${key}=${key === 'led' && s.led === 0 ? 'off' : s[key]}`);
  }
  // Chat apps and linkifiers end a link before trailing punctuation, so a
  // link ending in "!" or "." would lose it. Encode any such tail.
  return parts
    .join('&')
    .replace(/[!'()*,.:;?~]+$/, (tail) => [...tail].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).join(''));
}

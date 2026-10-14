import { Marquee, PIXEL_ROWS } from './marquee.js';
import { COUNTDOWN, parseFragment, resolveSettings, toFragment } from './state.js';

// The editor opens on something lit rather than an empty board.
const STARTER = '歡迎光臨 WELCOME';
// The installed app always starts at `/`, with no fragment and no address bar,
// so the editor keeps the last sign on the device to open it again.
const SAVED = 'scrolling-light:fragment';
const BAR_MS = 3000;
const $ = (id) => document.getElementById(id);
const form = $('form');
const fields = {
  message: $('msg'),
  fg: $('fg'),
  bg: $('bg'),
  speed: $('speed'),
  led: $('led'),
  rows: $('rows'),
  until: $('until'),
  zero: $('zero'),
  hms: [$('th'), $('tm'), $('ts')],
};
const swatches = [...document.querySelectorAll('.swatch')];
const pad2 = (n) => String(n).padStart(2, '0');

let settings = null;
let preview = null;
let viewer = null;
let wakeLock = null;
let copiedTimer = 0;
let barTimer = 0;

// `/` with no fragment and `/edit#…` are the editor; any other fragment plays.
// The editor keeps its state at /edit, so Back from a playing display, a
// reload and a shared edit link all land on the same message.
function editing() {
  return location.pathname.replace(/\/+$/, '') === '/edit' || location.hash.length <= 1;
}

function render() {
  const edit = editing();
  $('editor').hidden = !edit;
  $('viewer').hidden = edit;
  document.body.classList.toggle('viewing', !edit);
  if (edit) {
    closeViewer();
    openEditor();
  } else {
    closeEditor();
    openViewer();
  }
}

function saved() {
  try {
    return localStorage.getItem(SAVED);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- editor

/** A time as a datetime-local value, in this device's time zone. */
function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function timerSeconds() {
  const [h, m, s] = fields.hms.map((f) => Math.max(0, Math.floor(Number(f.value) || 0)));
  return h * 3600 + m * 60 + s;
}

function openEditor() {
  preview ??= new Marquee($('preview'));
  settings = resolveSettings(parseFragment(location.hash.length > 1 ? location.hash : (saved() ?? STARTER)));
  fields.message.value = settings.message;
  fields.fg.value = `#${settings.fg}`;
  fields.bg.value = `#${settings.bg}`;
  fields.speed.value = settings.speed;
  fields.led.checked = settings.led > 0;
  if (settings.led) fields.rows.value = settings.led;
  form.elements.dir.value = settings.dir;
  form.elements.font.value = settings.font;
  form.elements.cd.value = settings.until !== null ? 'until' : settings.timer !== null ? 'timer' : 'off';
  fields.until.value = settings.until !== null ? toLocalInput(settings.until) : '';
  const t = settings.timer ?? 0;
  [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].forEach((n, i) => (fields.hms[i].value = settings.timer ? n : ''));
  fields.zero.value = settings.zero ?? '';
  sync();
}

function closeEditor() {
  preview?.destroy();
  preview = null;
}

function readForm() {
  const mode = form.elements.cd.value;
  const until = new Date(fields.until.value).getTime();
  settings = {
    message: fields.message.value,
    fg: fields.fg.value.slice(1),
    bg: fields.bg.value.slice(1),
    speed: Number(fields.speed.value),
    led: fields.led.checked ? Number(fields.rows.value) : 0,
    dir: form.elements.dir.value,
    font: form.elements.font.value,
    until: mode === 'until' && !Number.isNaN(until) ? until : null,
    timer: mode === 'timer' && timerSeconds() > 0 ? timerSeconds() : null,
    zero: mode !== 'off' && fields.zero.value.trim() ? fields.zero.value : null,
  };
  sync();
}

function sync() {
  const fragment = toFragment(settings);
  history.replaceState(history.state, '', `/edit#${fragment}`);
  try {
    localStorage.setItem(SAVED, fragment);
  } catch {
    // Storage off or full: the link still holds everything.
  }
  $('url').value = `${location.origin}/#${fragment}`;
  $('speed-out').value = String(settings.speed);
  // The pixel font sets the rows itself; the slider keeps its value for the other fonts.
  const pixel = settings.font === 'pixel';
  $('rows-out').value = `${settings.led && pixel ? PIXEL_ROWS : fields.rows.value} 點`;
  fields.rows.disabled = !settings.led || pixel;
  const mode = form.elements.cd.value;
  $('until-field').hidden = mode !== 'until';
  $('timer-field').hidden = mode !== 'timer';
  $('zero-field').hidden = $('cd-hint').hidden = mode === 'off';
  $('play').disabled = !settings.message.trim() && settings.until === null && settings.timer === null;
  let preset = false;
  for (const b of swatches) {
    const on = b.dataset.color === settings.fg;
    b.setAttribute('aria-pressed', String(on));
    preset ||= on;
  }
  fields.fg.classList.toggle('picked', !preset);
  preview.update(settings);
}

// Turning a countdown on fills in a starting point and puts the countdown in
// the message, so the board shows it straight away. Runs before the form's
// own listener, which then reads the result.
for (const radio of form.elements.cd) {
  radio.addEventListener('input', () => {
    if (radio.value === 'off') return;
    if (radio.value === 'until' && !fields.until.value) {
      const nextHour = new Date();
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      fields.until.value = toLocalInput(nextHour.getTime());
    }
    if (radio.value === 'timer' && !timerSeconds()) fields.hms[1].value = 5;
    if (!fields.message.value.includes(COUNTDOWN)) fields.message.value = `${fields.message.value.trim()} ${COUNTDOWN}`.trim();
  });
}

for (const type of ['input', 'change']) form.addEventListener(type, readForm);

for (const b of swatches) {
  b.style.background = `#${b.dataset.color}`;
  b.addEventListener('click', () => {
    fields.fg.value = `#${b.dataset.color}`;
    readForm();
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  // Still inside the click, which is what allows a page to go fullscreen.
  enterFullscreen();
  history.pushState({ fromEditor: true }, '', `/#${toFragment(settings)}`);
  render();
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('url').value);
  } catch {
    $('url').select();
    return;
  }
  $('copy').textContent = '已複製';
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => ($('copy').textContent = '複製連結'), 1500);
});

// ---------------------------------------------------------------- viewer

function openViewer() {
  viewer ??= new Marquee($('stage'));
  viewer.update(resolveSettings(parseFragment(location.hash)));
  void keepAwake();
}

function closeViewer() {
  if (!viewer) return;
  viewer.destroy();
  viewer = null;
  hideBar();
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

// Asked again whenever the tab comes back: browsers drop the lock when it's hidden.
async function keepAwake() {
  if (!viewer || wakeLock || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // The viewer closed, or another request won, while this one was pending.
    if (!viewer || wakeLock) return void lock.release();
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch {
    // Unsupported or refused: the screen may sleep, the display still runs.
  }
}
document.addEventListener('visibilitychange', () => void keepAwake());

function enterFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  // Phones only lock orientation while fullscreen; desktops refuse, which is fine.
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

// The display has no controls until it's touched: a sign held up shouldn't
// show buttons, but the installed app has no Back button to leave it with.
function showBar() {
  if (!viewer) return;
  document.body.classList.add('bar');
  clearTimeout(barTimer);
  barTimer = setTimeout(hideBar, BAR_MS);
}
function hideBar() {
  clearTimeout(barTimer);
  document.body.classList.remove('bar');
}

$('stage').addEventListener('click', showBar);
document.addEventListener('keydown', showBar);
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else enterFullscreen();
  showBar();
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').textContent = document.fullscreenElement ? '結束全螢幕' : '全螢幕';
});
$('edit').addEventListener('click', () => {
  // Back to the editor this came from, or open a shared link in a new one.
  if (history.state?.fromEditor) return history.back();
  history.pushState(null, '', `/edit${location.hash}`);
  render();
});

addEventListener('popstate', render);
addEventListener('hashchange', render);
render();

// Keeps a copy of the site for offline use and the installed app (sw.js).
if ('serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

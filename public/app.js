import { Marquee } from './marquee.js';
import { parseFragment, resolveSettings, toFragment } from './state.js';

// The editor opens on something lit rather than an empty board.
const STARTER = '歡迎光臨 WELCOME';
const $ = (id) => document.getElementById(id);
const form = $('form');
const fields = { message: $('msg'), fg: $('fg'), bg: $('bg'), speed: $('speed'), led: $('led'), rows: $('rows') };
const swatches = [...document.querySelectorAll('.swatch')];

let settings = null;
let preview = null;
let viewer = null;
let wakeLock = null;
let copiedTimer = 0;

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

// ---------------------------------------------------------------- editor

function openEditor() {
  preview ??= new Marquee($('preview'));
  settings = resolveSettings(parseFragment(location.hash.length > 1 ? location.hash : STARTER));
  fields.message.value = settings.message;
  fields.fg.value = `#${settings.fg}`;
  fields.bg.value = `#${settings.bg}`;
  fields.speed.value = settings.speed;
  fields.led.checked = settings.led > 0;
  if (settings.led) fields.rows.value = settings.led;
  sync();
}

function closeEditor() {
  preview?.destroy();
  preview = null;
}

function readForm() {
  settings = {
    message: fields.message.value,
    fg: fields.fg.value.slice(1),
    bg: fields.bg.value.slice(1),
    speed: Number(fields.speed.value),
    led: fields.led.checked ? Number(fields.rows.value) : 0,
  };
  sync();
}

function sync() {
  const fragment = toFragment(settings);
  history.replaceState(null, '', `/edit#${fragment}`);
  $('url').value = `${location.origin}/#${fragment}`;
  $('speed-out').value = String(settings.speed);
  $('rows-out').value = `${fields.rows.value} 點`;
  fields.rows.disabled = !settings.led;
  $('play').disabled = !settings.message.trim();
  let preset = false;
  for (const b of swatches) {
    const on = b.dataset.color === settings.fg;
    b.setAttribute('aria-pressed', String(on));
    preset ||= on;
  }
  fields.fg.classList.toggle('picked', !preset);
  preview.update(settings);
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
  history.pushState(null, '', `/#${toFragment(settings)}`);
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
  viewer ??= new Marquee($('viewer'));
  viewer.update(resolveSettings(parseFragment(location.hash)));
  void keepAwake();
}

function closeViewer() {
  if (!viewer) return;
  viewer.destroy();
  viewer = null;
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

$('viewer').addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else enterFullscreen();
});

addEventListener('popstate', render);
addEventListener('hashchange', render);
render();

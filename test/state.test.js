import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardRuns, DEFAULTS, formatCountdown, parseFragment, resolveSettings, toFragment } from '../public/state.js';

const fromLink = (fragment) => resolveSettings(parseFragment(`#${fragment}`));
const plain = (message) => ({ ...DEFAULTS, message, until: null, timer: null, zero: null });
const shown = (runs) => runs.map((r) => r.text).join('');

test('a shared link plays exactly the sign that was made', () => {
  // `&` and `#` would otherwise end the message, `%` would be read as an escape.
  const s = {
    ...plain('買一送一 & 50% off #今天\n🎉  雙空格'),
    fg: 'ff3b30',
    speed: 3.5,
    led: 0,
    dir: 'right',
    font: 'pixel',
    until: Date.UTC(2027, 0, 1, 11, 0),
    zero: '開演！& 歡迎',
  };
  assert.deepEqual(fromLink(toFragment(s)), s);
  const timed = { ...plain('休息 {countdown}'), timer: 5400 };
  assert.equal(toFragment(timed), '%E4%BC%91%E6%81%AF%20%7Bcountdown%7D&timer=1h30m');
  assert.deepEqual(fromLink(toFragment(timed)), timed);
});

test('defaults stay out of the link, so links are short enough to share', () => {
  assert.equal(toFragment(plain('Hi')), 'Hi');
  assert.equal(toFragment({ ...plain('Hi'), led: 0 }), 'Hi&led=off');
});

test('a hand-edited link never breaks the display: bad values fall back, extremes clamp', () => {
  assert.deepEqual(fromLink('Hi&fg=red&bg=12345&speed=fast&led=many&dir=up&font=comic&until=tomorrow&zero=freeze'), plain('Hi'));
  assert.deepEqual(fromLink('Hi&FG=%23FFFFFF&speed=0&led=500&font=Noto'), { ...plain('Hi'), fg: 'ffffff', speed: 0.5, led: 64, font: 'noto' });
  assert.equal(fromLink('Hi&speed=99').speed, 10);
  assert.equal(fromLink('Hi&led=1').led, 8);
  assert.equal(fromLink('Hi&until=2027-02-30T10:00').until, null);
});

test('until and timer exclude each other: the one first in the link wins', () => {
  assert.deepEqual([fromLink('x&timer=10m&until=2027-01-01T00:00Z').timer, fromLink('x&timer=10m&until=2027-01-01T00:00Z').until], [600, null]);
  assert.equal(fromLink('x&until=2027-01-01T00:00Z&timer=10m').timer, null);
});

test('a malformed escape shows as typed instead of throwing', () => {
  assert.equal(fromLink('100%&fg=ffffff').message, '100%');
  assert.equal(fromLink('%E6%AD%A1 %E8').message, '歡 %E8');
});

test('a link ending in punctuation keeps it when a chat app linkifies it', () => {
  assert.equal(toFragment(plain('加油!')), '%E5%8A%A0%E6%B2%B9%21');
  assert.equal(fromLink('%E5%8A%A0%E6%B2%B9%21').message, '加油!');
});

test('the countdown drops units it no longer needs and reads 0:00 only once time is up', () => {
  assert.equal(formatCountdown((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000), '2天 03:04:05');
  assert.equal(formatCountdown((3 * 3600 + 4 * 60 + 5) * 1000), '3:04:05');
  assert.equal(formatCountdown(65_000), '1:05');
  assert.equal(formatCountdown(200), '0:01');
  assert.equal(formatCountdown(-5000), '0:00');
});

test('the board shows the countdown in the message, then what zero says', () => {
  const s = { ...plain('開演倒數 {countdown}！'), zero: '開演！' };
  const runs = boardRuns(s, 90_000, 0);
  assert.equal(shown(runs), '開演倒數 1:30！');
  // Only the countdown gets fixed-width digits; numbers typed in the message keep their own spacing.
  assert.deepEqual(runs.map((r) => r.digits), [false, true, false]);
  assert.equal(shown(boardRuns(s, 90_000, 90_000)), '開演！');
  assert.equal(shown(boardRuns({ ...s, zero: null }, 90_000, 99_000)), '開演倒數 0:00！');
  assert.equal(shown(boardRuns(plain(''), 5000, 0)), '0:05');
  assert.equal(shown(boardRuns(plain('{countdown} 不倒數'), null, 0)), '{countdown} 不倒數');
});

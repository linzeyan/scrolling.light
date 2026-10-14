import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, parseFragment, resolveSettings, toFragment } from '../public/state.js';

const fromLink = (fragment) => resolveSettings(parseFragment(`#${fragment}`));

test('a shared link plays exactly the message that was typed', () => {
  // `&` and `#` would otherwise end the message, `%` would be read as an escape.
  const message = '買一送一 & 50% off #今天\n🎉  雙空格';
  const s = { ...DEFAULTS, message, fg: 'ff3b30', speed: 3.5, led: 0 };
  assert.deepEqual(fromLink(toFragment(s)), s);
});

test('defaults stay out of the link, so links are short enough to share', () => {
  assert.equal(toFragment({ ...DEFAULTS, message: 'Hi' }), 'Hi');
  assert.equal(toFragment({ ...DEFAULTS, message: 'Hi', led: 0 }), 'Hi&led=off');
});

test('a hand-edited link never breaks the display: bad values fall back, extremes clamp', () => {
  assert.deepEqual(fromLink('Hi&fg=red&bg=12345&speed=fast&led=many'), { ...DEFAULTS, message: 'Hi' });
  assert.deepEqual(fromLink('Hi&FG=%23FFFFFF&speed=0&led=500'), { ...DEFAULTS, message: 'Hi', fg: 'ffffff', speed: 0.5, led: 64 });
  assert.equal(fromLink('Hi&speed=99').speed, 10);
  assert.equal(fromLink('Hi&led=1').led, 8);
});

test('a malformed escape shows as typed instead of throwing', () => {
  assert.equal(fromLink('100%&fg=ffffff').message, '100%');
  assert.equal(fromLink('%E6%AD%A1 %E8').message, '歡 %E8');
});

test('a link ending in punctuation keeps it when a chat app linkifies it', () => {
  assert.equal(toFragment({ ...DEFAULTS, message: '加油!' }), '%E5%8A%A0%E6%B2%B9%21');
  assert.equal(fromLink('%E5%8A%A0%E6%B2%B9%21').message, '加油!');
});

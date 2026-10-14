import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Cloudflare Pages reads public/_headers and the Docker image's Caddy reads the
// Caddyfile. A header added to one and not the other would leave self-hosted
// copies quietly less locked down than the real site.
test('the Docker image sends every header Cloudflare Pages sends', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const pages = read('public/_headers')
    .split('\n')
    .filter((line) => /^\s+\S/.test(line))
    .map((line) => line.trim().split(/:\s(.*)/s));
  const caddy = read('Caddyfile').split('\n').map((line) => line.trim());
  assert.ok(pages.length > 0);
  for (const [name, value] of pages) {
    const line = caddy.find((l) => l.startsWith(`${name} `));
    assert.equal(line?.slice(name.length + 1).replace(/^"|"$/g, ''), value, name);
  }
});

# Tasks for working on the site; the tools come from mise.toml. Pushing to main
# deploys public/ to Cloudflare Pages, so none of this is needed to ship.
RUN := mise exec --
WRANGLER := pnpm dlx wrangler@4.151.0
PORT ?= 8080
NOTO := tools/node_modules/@fontsource-variable/noto-sans-tc
CUBIC := https://raw.githubusercontent.com/ACh-K/Cubic-11/v1.500
CUBIC_SHA256 := d28e92846e00c3696b30d950d4eddf445dd90b2a970e67cdb629796c1997ef67

.PHONY: test dev icons fonts up down

# Unit tests.
test:
	$(RUN) node --test

# Serve public/ the way Cloudflare Pages does, with _headers and _redirects.
dev:
	$(RUN) $(WRANGLER) pages dev public

# Render the PNG app icons from their SVGs. The PNGs are committed.
icons:
	$(RUN) resvg -w 192 -h 192 public/favicon.svg public/icon-192.png
	$(RUN) resvg -w 512 -h 512 public/favicon.svg public/icon-512.png
	$(RUN) resvg -w 512 -h 512 assets/icon-full.svg public/icon-maskable-512.png
	$(RUN) resvg -w 180 -h 180 assets/icon-full.svg public/apple-touch-icon.png

# Copy the web fonts into public/fonts/; the copies are committed. Noto Sans TC
# is pinned in tools/pnpm-lock.yaml, away from the repo root: Pages installs
# dependencies when it finds a lockfile there. Cubic 11 isn't on npm, so it is
# pinned to a release tag and checked against its hash.
fonts:
	$(RUN) pnpm --dir tools install --frozen-lockfile
	rm -rf public/fonts
	mkdir -p public/fonts/noto-sans-tc public/fonts/cubic-11
	cp -R $(NOTO)/files $(NOTO)/wght.css $(NOTO)/LICENSE public/fonts/noto-sans-tc/
	curl -fsSL -o public/fonts/cubic-11/Cubic_11.woff2 $(CUBIC)/fonts/web/Cubic_11.woff2
	curl -fsSL -o public/fonts/cubic-11/OFL.txt $(CUBIC)/OFL.txt
	echo "$(CUBIC_SHA256)  public/fonts/cubic-11/Cubic_11.woff2" | shasum -a 256 -c

# Build and run the self-hosting image on http://localhost:$(PORT).
up:
	PORT=$(PORT) docker compose up -d --build

down:
	docker compose down

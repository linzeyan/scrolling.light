# Self-hosting: Caddy serving public/ the way Cloudflare Pages does. Pages
# itself doesn't use this.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY public /usr/share/caddy
# Pages reads these instead of serving them; the Caddyfile does their job here.
RUN rm /usr/share/caddy/_headers /usr/share/caddy/_redirects

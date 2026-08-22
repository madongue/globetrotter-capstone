# =============================================================================
# trip_io — production image
#
# Builds the Vite app and serves the static output through nginx.
#
# The previous GlobeTrotter image (Flask + gunicorn) is kept in git history at
# tag/commit 580897b if it is ever needed again.
# =============================================================================

FROM node:20-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer is cached between builds that
# only change source.
COPY trip_io/package.json trip_io/package-lock.json* ./
RUN npm ci

COPY trip_io/ ./
RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

# The app uses client-side routing, so any unknown path has to fall through to
# index.html -- otherwise a refresh on /app/destinations returns 404 from nginx
# before React ever sees the URL.
RUN printf '%s\n' \
  'server {' \
  '  listen       80;' \
  '  server_name  _;' \
  '  root         /usr/share/nginx/html;' \
  '  index        index.html;' \
  '' \
  '  gzip on;' \
  '  gzip_types text/css application/javascript image/svg+xml application/json;' \
  '  gzip_min_length 1024;' \
  '' \
  '  # Hashed assets never change under the same name, so cache them hard.' \
  '  location /assets/ {' \
  '    expires 1y;' \
  '    add_header Cache-Control "public, immutable";' \
  '  }' \
  '' \
  '  location /images/ {' \
  '    expires 30d;' \
  '    add_header Cache-Control "public";' \
  '  }' \
  '' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

# Render supplies the port at runtime, so the listen directive is rewritten on
# start rather than baked in.
COPY <<'EOF' /docker-entrypoint.d/40-render-port.sh
#!/bin/sh
set -e
PORT="${PORT:-80}"
sed -i "s/listen       80;/listen       ${PORT};/" /etc/nginx/conf.d/default.conf
EOF
RUN chmod +x /docker-entrypoint.d/40-render-port.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

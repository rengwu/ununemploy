FROM debian:bookworm-slim AS tex
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gcc libc6-dev linux-libc-dev \
    && rm -rf /var/lib/apt/lists/*
RUN case "$TARGETARCH" in amd64) arch=x86_64 ;; arm64) arch=aarch64 ;; *) exit 1 ;; esac \
    && curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-${arch}-unknown-linux-musl.tar.gz" | tar xz -C /usr/local/bin tectonic
COPY deploy/latex/sandbox.c /tmp/sandbox.c
RUN gcc -O2 -Wall -Wextra /tmp/sandbox.c -o /usr/local/bin/ununemploy-tex-sandbox
COPY core/latex/starter.tex /tmp/latex/starter.tex
ENV TECTONIC_CACHE_DIR=/opt/ununemploy-tex-cache
RUN cd /tmp/latex && for size in 10 11 12; do sed "s/\[11pt,a4paper\]/[${size}pt,a4paper]/" starter.tex > warm.tex; tectonic --untrusted warm.tex || exit 1; done \
    && chmod -R a+rX /opt/ununemploy-tex-cache
# Tectonic 0.15 keeps format files in XDG_CACHE_HOME separately from its bundle cache.
RUN mkdir -p /opt/ununemploy-tex-cache/Tectonic \
    && cp -a /root/.cache/Tectonic/formats /opt/ununemploy-tex-cache/Tectonic/ \
    && chmod -R a+rX /opt/ununemploy-tex-cache

FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-core supervisor gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=tex /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=tex /usr/local/bin/ununemploy-tex-sandbox /usr/local/bin/ununemploy-tex-sandbox
COPY --from=tex /opt/ununemploy-tex-cache /opt/ununemploy-tex-cache
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY core ./core
COPY server ./server
COPY worker ./worker
COPY scripts/setup-latex.ts ./scripts/setup-latex.ts
COPY scripts/backup.ts ./scripts/backup.ts
COPY scripts/recover-cached-descriptions.ts ./scripts/recover-cached-descriptions.ts
COPY scripts/add-discovery-sources.ts ./scripts/add-discovery-sources.ts
COPY data ./data
COPY deploy/container/entrypoint.sh /usr/local/bin/ununemploy-entrypoint
COPY deploy/container/run.sh /usr/local/bin/ununemploy-run
COPY deploy/container/supervisord.conf /etc/ununemploy-supervisord.conf
RUN chmod +x /usr/local/bin/ununemploy-entrypoint /usr/local/bin/ununemploy-run
ENV NODE_ENV=production JH_HOST=0.0.0.0 JH_PORT=3000 JH_DATA_DIR=/config JH_CHROMIUM_PATH=/usr/bin/chromium PUID=99 PGID=100
ENV JH_LATEX_CACHE=/opt/ununemploy-tex-cache
EXPOSE 3000
VOLUME ["/config"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/ununemploy-entrypoint"]

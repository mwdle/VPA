FROM node:24.16.0-trixie-slim@sha256:05c08ce4291e9a58f59456a7985176defb12cdd42271f35ff81a3e167ea61d4c AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

RUN mkdir -p -m 700 /var/lib/vpa

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:4c11c00f9d72bbe5d42fbcab421229b3c046d949f4e0a8e2d50e88a9b319a9e2

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=65532:65532 /var/lib/vpa /var/lib/vpa
COPY --from=builder /app/node_modules ./node_modules
COPY server.mjs .
COPY healthcheck.mjs .
COPY public ./public
COPY views ./views

EXPOSE 3000

HEALTHCHECK --interval=1m --timeout=5s --retries=3 --start-period=30s CMD ["/nodejs/bin/node", "/app/healthcheck.mjs"]

CMD ["server.mjs"]

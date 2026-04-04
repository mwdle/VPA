FROM node:24.14.1-trixie-slim@sha256:c319bb4fac67c01ced508b67193a0397e02d37555d8f9b72958649efd302b7f8 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

RUN mkdir -p -m 700 /var/lib/vpa

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:924918584d0e6793e578fc0e98b8b8026ae4ac2ccf2fea283bc54a7165441ccd

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

FROM node:24.19.0-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

RUN mkdir -p -m 700 /var/lib/vpa

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:774b7d020b24214835769e24c3544835526cd0288f0b094eae48e8b2c2429a79

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

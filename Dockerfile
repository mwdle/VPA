FROM node:24.14.1-trixie-slim@sha256:9707cd4542f400df5078df04f9652a272429112f15202d22b5b8bdd148df494f AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

RUN mkdir -p -m 700 /var/lib/vpa

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:1e2c4183b84122745dc2236b9b43bee09c54db091044d593eb8f755a954ad22a

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

FROM node:24.14.1-trixie-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

RUN mkdir -p -m 700 /var/lib/vpa

FROM gcr.io/distroless/nodejs24-debian13:nonroot

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=65532:65532 /var/lib/vpa /var/lib/vpa
COPY --from=builder /app/node_modules ./node_modules
COPY server.mjs .
COPY public ./public
COPY views ./views

EXPOSE 3000

CMD ["server.mjs"]

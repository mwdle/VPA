FROM node:25.8.2-alpine3.22@sha256:5f969e64a872f551a8c8835992c6fe898a2bf40dd814e0fec7c1a098bd2b5859 AS builder

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev --silent

FROM node:25.8.2-alpine3.22@sha256:5f969e64a872f551a8c8835992c6fe898a2bf40dd814e0fec7c1a098bd2b5859

ENV NODE_ENV=production
WORKDIR /usr/src/app

RUN mkdir -p -m 700 /var/lib/vpa && chown node:node /var/lib/vpa

COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node server.mjs ./
COPY --chown=node:node public/ ./public/
COPY --chown=node:node views/ ./views/

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.mjs"]

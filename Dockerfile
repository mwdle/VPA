FROM node:25.8.2-alpine3.22@sha256:5f969e64a872f551a8c8835992c6fe898a2bf40dd814e0fec7c1a098bd2b5859

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

RUN mkdir -p -m 700 /var/lib/vpa && chown node:node /var/lib/vpa
USER node

COPY server.mjs .
COPY public ./public
COPY views ./views

EXPOSE 3000

CMD ["node", "server.mjs"]

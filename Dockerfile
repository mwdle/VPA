FROM node:25.8.1-alpine3.22@sha256:d09f26c5f8b25a3286de1a7121a0d7bb3f85ec9191931dd4917b702d74dc70c5
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 80
RUN chown -R node /usr/src/app
USER node
CMD ["node", "server.mjs"]

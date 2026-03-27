FROM node:25.8.2-alpine3.22@sha256:5f969e64a872f551a8c8835992c6fe898a2bf40dd814e0fec7c1a098bd2b5859
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 80
RUN chown -R node /usr/src/app
USER node
CMD ["node", "server.mjs"]

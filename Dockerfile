FROM node:20
WORKDIR /app
COPY server/package.json ./
RUN npm install
COPY server/ ./
CMD ["node", "index.js"]

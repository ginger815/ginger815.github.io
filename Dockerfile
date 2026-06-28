FROM node:20
WORKDIR /app
# 创建持久化数据目录（Railway 卷挂载点）
RUN mkdir -p /data
COPY server/package.json ./
RUN npm install
COPY server/ ./
CMD ["node", "index.js"]

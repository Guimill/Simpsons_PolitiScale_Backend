# Debian 13 image: the prebuilt sqlite3 binary needs glibc >= 2.38
FROM node:24-trixie-slim
ENV NODE_ENV=production DB_STORAGE=/data/politiscale.sqlite
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY src ./src
RUN install -d -o node -g node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]

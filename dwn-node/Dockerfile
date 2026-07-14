# MILAN standalone DWN node — small, production image.
FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching). Only production deps.
COPY package.json ./
RUN npm install --omit=dev --no-fund --no-audit --loglevel=error

# App source.
COPY server.js ./

# Data lives on a mounted volume so it survives container rebuilds.
ENV DWN_DATA_DIR=/data
ENV PORT=3100
VOLUME ["/data"]
EXPOSE 3100

# Basic container healthcheck against the public status route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm i --omit=dev || true
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "src/index.js"]

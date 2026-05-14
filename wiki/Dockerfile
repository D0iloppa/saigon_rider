# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────
FROM nginx:alpine

# Docusaurus build/ 출력을 /wiki/ 경로로 배치
# (baseUrl: '/wiki/' 이므로 내부 참조가 /wiki/로 시작)
COPY --from=build /app/build /usr/share/nginx/html/wiki

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

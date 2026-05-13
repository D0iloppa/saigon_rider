# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# package*.json — lock 파일 있으면 포함, 없으면 package.json만
COPY package*.json ./
RUN npm install --prefer-offline

# 소스코드 복사 후 프로덕션 빌드
COPY . .
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:alpine AS runner

# 빌드 결과물 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA 라우팅용 nginx 설정
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

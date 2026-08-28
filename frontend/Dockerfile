# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 워키토키 SDK(d_modules) 를 package.json 의 file: 경로와 **같은 상대 위치**에 두고 여기서 빌드한다.
# 빌드 컨텍스트가 레포 루트인 이유가 이것 — 컨텍스트를 frontend/ 로 두면 이 경로가 밖이라 해결되지 않는다.
# 로컬 dist 를 복사하지 않고 컨테이너 안에서 빌드해, 개발자의 빌드 상태에 결과가 좌우되지 않게 한다.
COPY d_modules/WalkieTalkie/packages/client /d_modules/WalkieTalkie/packages/client
RUN cd /d_modules/WalkieTalkie/packages/client && npm install --prefer-offline && npm run build

# package*.json — lock 파일 있으면 포함, 없으면 package.json만
COPY frontend/package*.json ./
RUN npm install --prefer-offline

# 소스코드 복사 후 프로덕션 빌드
COPY frontend/ .
ARG VITE_USE_MOCK=false
ENV VITE_USE_MOCK=$VITE_USE_MOCK
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:alpine AS runner

# 빌드 결과물 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA 라우팅용 nginx 설정
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

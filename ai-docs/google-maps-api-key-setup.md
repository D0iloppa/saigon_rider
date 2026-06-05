# Google Maps Directions API 키 발급 가이드 (SGR-269)

주유소/정비소 [경로] 미리보기의 실경로(거리·ETA·턴 단계·경로선)를 켜는 키.
**키 없으면 자동으로 "준비 중" 안내 폴백** — 코드 변경 없이 키 입력만으로 활성화된다.

## 1. Google Cloud 프로젝트 + 결제

1. https://console.cloud.google.com/ 접속 (Google 계정).
2. 상단 프로젝트 선택 → **새 프로젝트** (또는 기존 프로젝트 사용). 예: `saigon-rider`.
3. **결제 사용 설정 필수** — Directions API는 결제 계정 연결이 없으면 호출이 거부된다.
   - 좌측 메뉴 **결제(Billing)** → 결제 계정 연결.
   - 신규 가입 시 무료 크레딧 제공. Directions는 월 일정량 무료 후 종량제.

## 2. Directions API 활성화

1. 좌측 메뉴 **API 및 서비스 → 라이브러리**.
2. `Directions API` 검색 → **사용 설정(Enable)**.
   - ⚠️ "Maps JavaScript API"가 아니라 **Directions API** 다.

## 3. API 키 생성

1. **API 및 서비스 → 사용자 인증 정보(Credentials)**.
2. **사용자 인증 정보 만들기 → API 키**.
3. 생성된 키 복사 (형식: `AIza...`).

## 4. 키 제한 (권장 — 비용/오용 방지)

이 키는 **서버(BFF)에서만** 호출된다(브라우저 직접 호출 아님).
→ HTTP 리퍼러 제한은 작동하지 않으니 쓰지 말 것.

- **API 제한**: "키 제한" → API 제한 → **Directions API** 만 선택.
- **애플리케이션 제한** (선택):
  - 운영 서버 고정 IP가 있으면 **IP 주소** 제한에 서버 IP 추가 (예: `218.234.18.148`).
  - 개발 중이거나 IP가 유동이면 일단 "없음"으로 두고, 운영 안정화 후 IP 제한 추가.

## 5. .env에 입력 (이 한 줄만 채우면 됨)

`/mnt/c/DEV/saigon_rider/.env`:

```
GOOGLE_MAPS_API_KEY=AIza여기에_복사한_키
```

> `.env.example`에도 같은 키가 빈 값으로 들어가 있다(키셋 동기화 규약). 실제 값은 `.env`에만.

## 6. 적용 (BFF 재시작)

- 로컬/개발:
  ```
  docker compose restart bff
  ```
- 운영 서버(SGR-220):
  ```
  ssh saigon-prod
  cd /app/SaigonRider && git pull
  # .env의 GOOGLE_MAPS_API_KEY 입력 후
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d bff
  ```

## 7. 동작 확인

주유소/정비소 카드 [경로] → 진입 시:
- **키 정상**: 실제 거리·예상시간·턴 단계 목록 + 경로선 표시, 하단 "Google 지도로 이동" 버튼.
- **키 미설정/오류**: 기존 "준비 중" 안내 다이얼로그(폴백) — 잘못 입력해도 앱은 안 깨진다.

빠른 점검(터미널, 유효 세션 헤더 필요):
```
curl -s -H "X-User-Id: <세션UUID>" \
  "http://localhost:18090/api/bff/info/route?origin_lat=10.77&origin_lng=106.70&dest_lat=10.78&dest_lng=106.71"
```
`{"configured":true, "distance_text":"...", ...}` 면 정상. `{"configured":false}` 면 키 미인식(재시작/오타 확인).

## 참고 / 제약

- 레거시 Directions API라 라우팅 모드는 `driving`(오토바이 전용 `two_wheeler` 미지원).
  Google 지도 **핸드오프 URL**은 `travelmode=two_wheeler` 그대로라, 실제 길안내는 오토바이 기준.
- 앱-내 라이브 턴바이턴(실시간 네비)은 Directions로 불가 — 미리보기(정적)까지가 범위.
  진짜 라이브 네비가 필요해지면 Mapbox Navigation SDK 별도 과제(네이티브·비용).
- 호출 비용 절감이 필요하면 OpenWeather처럼 결과 캐싱을 추가할 수 있다(현재 미적용 — 단순화 우선).

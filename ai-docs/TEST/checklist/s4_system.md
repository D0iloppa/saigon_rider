# §4 시스템 전반 점검 체크리스트

> 진척도: [../progress.md](../progress.md) · 이슈 로그: [../issues.md](../issues.md)

## 4.1 인프라 / 컨테이너

- [ ] `docker compose --env-file .env --profile backend up -d` 정상 기동
- [ ] `saigon_nginx`, `saigon_frontend`, `saigon_bff`, `saigon_engine`, `saigon_db`, `saigon_imgproxy` 모두 `Up`
- [ ] 포트: `NGINX_PORT=18090`, `BACKEND_PORT=18080`(예시), `ENGINE_PORT=8090`, `DB_PORT=15432` 등 충돌 없음
- [ ] `docker logs saigon_bff` 기동 직후 에러 없음, `docker logs saigon_engine` Alembic head 적용 완료 로그

## 4.2 인증 플로우 (E2E)

- [ ] `/splash` 진입 → 시작하기 → 번호 입력 → register → OTP/passcode → login → profile-setup → `/home` 정상 흐름
- [ ] localStorage `user` 객체 존재 시 `/splash` 진입이 `/home` 으로 자동 이동
- [ ] `PrivateRoute` 가드 — 미로그인 상태에서 `/home`, `/quests`, `/profile`, `/settings` 등 모두 `/splash` 리다이렉트

## 4.3 화면 라우팅 / 디자인

- [ ] §1 의 모든 URL 접근 시 404 없이 화면 렌더
- [ ] scene.html 기준 색상/컴포넌트 일치(`--brand-*`, `--ink-*`)
- [ ] 하단 탭바: WorldMap / QuestList / FAB / FeedList / ProfileMain 5개 라우트 동작

## 4.4 BFF API 호출 (네트워크 점검)

- [ ] §2.x 각 화면의 BFF 엔드포인트가 Network 탭에서 200/4xx로 정상 응답
- [ ] 401/403 등 인증 오류는 적절한 안내(로그아웃 또는 재로그인 유도)
- [x] mock 표시 항목은 `VITE_USE_MOCK=false` 빌드 후 실 API 전환 점검 가능 ✅ 2026-05-14 Dockerfile 수정 완료

## 4.5 BFF ↔ Engine 연계

- [ ] RIDE-RESULT-S 진입 시 BFF 로그에 `engine_client.post_event RIDE_KM` 호출 + Engine 로그에 200 응답
- [ ] FEED-001 게시물 작성 시 `SHARE_SNS` 이벤트 발행
- [ ] PROFILE-001 진입 시 `engine_client.get_balance` 호출 → 응답 표시
- [ ] `ENGINE_SERVICE_KEY` 미설정/오설정 시 BFF가 4xx 받고 적절한 fallback (또는 명시 실패)

## 4.6 Engine 독립 점검

- [ ] §3.2 모든 엔드포인트 200 응답
- [ ] §3.3 anti-abuse 시나리오: 신규계정/일일캡/속도이상 트래픽에서 적립 변동 확인
- [ ] §3.4 배치 잡 4종 정상 동작 (수동 실행으로 검증)
- [ ] §3.5 메트릭/로그/헬스체크 노출
- [ ] §3.6 SQL 4종 모두 0행 (정합성 OK)

## 4.7 미구현/Mock 잔여 항목 (점검 보류, 별도 트래킹)

> ✅ **2026-05-14 BFF 완수 Task 완료** — 아래 항목은 모두 BFF API로 구현되었습니다.  
> 프론트엔드 연동(mock → 실 API 교체)은 별도 프론트 Task로 분리합니다.

| 함수 | 구현된 엔드포인트 | 상태 |
|---|---|---|
| `getNotifications()` | `GET /api/bff/notifications` | ✅ BFF 구현 완료 |
| `getMonthlyStats()` | `GET /api/bff/users/me/stats` | ✅ BFF 구현 완료 |
| `getBadgeDetail(id)` | `GET /api/bff/badges/{id}` | ✅ BFF 구현 완료 |
| `saveNotificationSettings()` | `PUT /api/bff/notifications/settings` | ✅ BFF 구현 완료 |
| `requestDataExport()` | `POST /api/bff/users/export` | ✅ BFF 구현 완료 |
| `deleteAccount()` | `DELETE /api/bff/users/me` | ✅ BFF 구현 완료 |
| `getStories()` 실 API | `GET /api/bff/feed/stories` | ✅ BFF 구현 완료 |
| 친구 초대 / `REFERRAL` | — | ⛔ Engine 매핑은 있으나 BFF 트리거 미구현 (후속 과제) |

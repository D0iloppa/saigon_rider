# 트러블슈팅 인덱스

> 작업 태스크는 [`../task/archive.md`](../task/archive.md). 결함 상세는 [`../TEST/issues.md`](../TEST/issues.md).

## 260513

- [Auth/Imgproxy 트러블슈팅](260513/260513_auth_imgproxy_troubleshooting.md) — passcode_hash 누락, Zustand persist로 인한 home 진입, nginx slash merge, `.env` LAN IP 문제 및 조치
- [SRE 엔진 통합 지침서 v1 ~~DEPRECATED~~](../_deprecated/engine_intg_deprecated.md) — 모놀리식 통합 방식(폐기). 2026-05-14 아키텍처 재검토로 [`../context/architecture.md`](../context/architecture.md) 로 대체

## 260515

- [Toast 시스템 트러블슈팅](260515/260515_toast_troubleshooting.md) — ProfileMain 인라인 에러 `<p>` → toast 교체, Sonner CSS 오버라이드 무효화 원인(inline style 우선순위), TabBar 겹침 해소(플랫폼별 bottom calc)
- [Nginx 413 업로드 오류](260515/260515_nginx_413_troubleshooting.md) — `client_max_body_size` 미설정(기본 1MB)으로 아바타 업로드 413, `client_max_body_size 0` 추가 후 reload로 해소
- [Home 진입 UX — Splash 오버레이](260515/260515_home_splash_ux_troubleshooting.md) — 콘텐츠 미로딩 상태 노출 UX 문제, API 완료 기준 최소 600ms 스플래시 + 350ms fade-out으로 해소

## 260518

- [Overscroll Bounce (고무줄 효과)](260518/260518_overscroll_bounce.md) — iOS에서 여백 터치 시 전체 viewport 바운스, `overscroll-behavior: none` 추가로 해소 ✅
- [Profile Draggable Sheet 스크롤 Block](260518/260518_profile_sheet_scroll_block.md) — snap 완료 직후 내부 스크롤 수 초간 block, `snapped` ref + `transitionend` 기반 overflow 전환으로 해소 ✅
- [팔로우 Session Expired 토스트](260518/260518_follow_session_expired.md) — 팔로우 시 "Session expired" 토스트만 표시되고 /splash 리다이렉트 미동작 → 419 세션 만료 프로토콜 도입으로 해소 ✅
- [AppImage 폴백 실패 시 무한 Shimmer](260518/260518_appimage_fallback_shimmer.md) — mock-img 최종 폴백 URL 로드 실패 시 onError 미처리로 shimmer 영구 표시 → 체인 배열 + 재시도 + 로컬 에러 이미지로 해소 ✅

## 260602

- [프로필 '내 바이크' 장착 아이콘 깨짐](260602/260602_profile_mybike_broken_icons_troubleshooting.md) — stale SLOT_EMOJI(구 슬롯 체계)→폴백 `1f4e6` 이모지 CDN 404 + onError 부재로 broken-image, `ItemSvgRenderer`로 교체해 해소 ✅
- [가차 hang — 재진입 시 신규 화면 미연결 (SGR-205)](260602/260602_gacha_hang_reentry_troubleshooting.md) — "다시 뽑기"/재진입 시 빈-deps effect 재실행 불가로 `SUMMONING…` 영구 정지, 뽑기 로직 `runPull()` 추출 + param-key 가드로 해소 ✅ (후속 시네마틱 연출 SGR-211)

## 260522

- [피드/고객센터 입력 영역 카드 배경 누락](260522/260522_input_section_no_card_bg_troubleshooting.md) — FeedCreate, CustomerSupport 입력 섹션에 카드 컨테이너 없어 회색 배경 위 텍스트만 노출, 카드 스타일 추가로 해소

## 260514

- [댓글 UX 3종 트러블슈팅](260514/260514_comment_ux_troubleshooting.md) — 댓글 닉네임 user_id 노출(BFF JOIN 누락), 댓글 아바타 미표시, 댓글 좋아요 미작동(핸들러+엔드포인트 신설) 원인 및 전체 수정 내역

# 트러블슈팅 인덱스

> 작업 태스크는 [`../task/archive.md`](../task/archive.md). 결함 상세는 [`../TEST/issues.md`](../TEST/issues.md).

## 260513

- [Auth/Imgproxy 트러블슈팅](260513/260513_auth_imgproxy_troubleshooting.md) — passcode_hash 누락, Zustand persist로 인한 home 진입, nginx slash merge, `.env` LAN IP 문제 및 조치
- [SRE 엔진 통합 지침서 v1 ~~DEPRECATED~~](../_deprecated/engine_intg_deprecated.md) — 모놀리식 통합 방식(폐기). 2026-05-14 아키텍처 재검토로 [`../context/architecture.md`](../context/architecture.md) 로 대체

## 260515

- [Toast 시스템 트러블슈팅](260515/260515_toast_troubleshooting.md) — ProfileMain 인라인 에러 `<p>` → toast 교체, Sonner CSS 오버라이드 무효화 원인(inline style 우선순위), TabBar 겹침 해소(플랫폼별 bottom calc)
- [Nginx 413 업로드 오류](260515/260515_nginx_413_troubleshooting.md) — `client_max_body_size` 미설정(기본 1MB)으로 아바타 업로드 413, `client_max_body_size 0` 추가 후 reload로 해소
- [Home 진입 UX — Splash 오버레이](260515/260515_home_splash_ux_troubleshooting.md) — 콘텐츠 미로딩 상태 노출 UX 문제, API 완료 기준 최소 600ms 스플래시 + 350ms fade-out으로 해소

## 260514

- [댓글 UX 3종 트러블슈팅](260514/260514_comment_ux_troubleshooting.md) — 댓글 닉네임 user_id 노출(BFF JOIN 누락), 댓글 아바타 미표시, 댓글 좋아요 미작동(핸들러+엔드포인트 신설) 원인 및 전체 수정 내역

-- ================================================================
-- 224_location_channel_proposals_unique.sql
-- 목적지 변경 제안 동시생성 경합(TOCTOU) 방지 — 채널당 pending 제안은 최대 1개를
-- DB 제약으로 강제한다.
-- SoT: ai-docs/task/active/260829_live_location_channel_task.md §3-3 불변식.
-- 독립 리뷰(W7) P1 지적 — 애플리케이션 레벨의 "pending 존재 확인 후 insert" 만으로는
-- 두 POST 가 동시에 들어오면 둘 다 통과할 수 있다. `routers/location_channels.py` 의
-- `propose_destination()` 이 이 유니크 인덱스 위반(IntegrityError)을 잡아 409 로 변환한다.
--
-- 재실행 멱등: CREATE UNIQUE INDEX IF NOT EXISTS 만 사용. 기존 223 은 수정하지 않는다.
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_lc_dest_proposals_pending
    ON location_channel_dest_proposals (channel_id) WHERE status = 'pending';

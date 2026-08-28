-- ================================================================
-- 214_dm_conversation_merge_direct.sql
-- 채팅 리스트 중복 채팅방 제거 — 상대 1명당 direct 대화는 항상 1개.
--
-- 배경: init/132 + init/203 이 (participant쌍 + context_type/context_id) 로 unique 를 걸어
--       같은 상대라도 매물마다 별도 conversation row 가 생겼고, 채팅 리스트에 같은 사람이
--       여러 줄로 중복 표시됐다.
--
-- 이 파일이 하는 일:
--   1) 기존 중복 direct 대화 병합 (FK 재지정 → 흡수행 삭제).
--   2) uq_dm_conversation_listing 삭제 + uq_dm_conversation_direct 를
--      (participant_1, participant_2) 전역 unique (conversation_type='direct') 로 교체.
--
-- dm_conversations.context_type/context_id 는 **드롭하지 않는다(deprecate)** —
-- "대화방 불변 컨텍스트"가 아니라 "가장 최근 문의한 매물" 기록으로 의미가 바뀐 것이다.
-- 진행 중 거래의 SoT 는 marketplace_appointments(conversation_id FK) 다.
--
-- 멱등(중복이 없으면 no-op). fresh volume(docker-entrypoint-initdb.d) 자동적용 +
-- 기존 volume 수동 psql 적용 둘 다 안전.
-- ================================================================

-- ── 1) 기존 중복 병합 ────────────────────────────────────────────
DO $$
DECLARE
    g               RECORD;
    survivor_id     UUID;
    absorbed_id     UUID;
    merged_groups   INT := 0;
    merged_convs    INT := 0;
    divider_at      TIMESTAMPTZ;
    ctx_listing_id  UUID;
    ctx_title       TEXT;
BEGIN
    FOR g IN
        SELECT participant_1, participant_2
          FROM dm_conversations
         WHERE conversation_type = 'direct'
         GROUP BY participant_1, participant_2
        HAVING count(*) > 1
    LOOP
        -- survivor: context_id IS NULL 인 것 우선, 없으면 가장 오래된 행
        SELECT id INTO survivor_id
          FROM dm_conversations
         WHERE conversation_type = 'direct'
           AND participant_1 = g.participant_1
           AND participant_2 = g.participant_2
         ORDER BY (context_id IS NULL) DESC, created_at ASC
         LIMIT 1;

        merged_groups := merged_groups + 1;

        FOR absorbed_id IN
            SELECT id
              FROM dm_conversations
             WHERE conversation_type = 'direct'
               AND participant_1 = g.participant_1
               AND participant_2 = g.participant_2
               AND id <> survivor_id
             ORDER BY created_at ASC
        LOOP
            -- 병합 경계 구분 시스템 메시지 1건 (흡수되는 대화의 매물 컨텍스트).
            -- dm_messages 스키마는 손대지 않는다 — 기존 자유문자열 message_type + meta JSONB 재사용
            -- (init/210 의 'voice' 와 같은 패턴). 표시 문구는 프론트가 meta 로 조립한다(i18n).
            ctx_listing_id := NULL;
            ctx_title := NULL;
            SELECT c.context_id, l.title
              INTO ctx_listing_id, ctx_title
              FROM dm_conversations c
              LEFT JOIN marketplace_listings l ON l.id = c.context_id
             WHERE c.id = absorbed_id
               AND c.context_type = 'listing'
               AND c.context_id IS NOT NULL;

            IF ctx_listing_id IS NOT NULL THEN
                -- 흡수 대화의 첫 메시지 직전에 꽂아 타임라인 순서를 지킨다.
                SELECT COALESCE(MIN(m.created_at) - INTERVAL '1 microsecond', c.created_at)
                  INTO divider_at
                  FROM dm_conversations c
                  LEFT JOIN dm_messages m ON m.conversation_id = c.id
                 WHERE c.id = absorbed_id
                 GROUP BY c.created_at;

                INSERT INTO dm_messages
                    (conversation_id, sender_id, content, message_type, meta, created_at, read_at)
                VALUES (
                    survivor_id,
                    g.participant_1,
                    ctx_title,
                    'system',
                    jsonb_build_object(
                        'kind', 'listing_divider',
                        'listingId', ctx_listing_id,
                        'listingTitle', ctx_title
                    ),
                    divider_at,
                    divider_at   -- 과거 시점 삽입이라 안읽음으로 잡히지 않게 읽음 처리
                );
            END IF;

            -- FK 재지정 (반드시 삭제보다 먼저 — 전부 ON DELETE CASCADE 라 순서가 뒤집히면 유실된다)
            UPDATE dm_messages              SET conversation_id = survivor_id WHERE conversation_id = absorbed_id;
            UPDATE marketplace_appointments SET conversation_id = survivor_id WHERE conversation_id = absorbed_id;
            UPDATE marketplace_price_offers SET conversation_id = survivor_id WHERE conversation_id = absorbed_id;
            UPDATE reports                  SET conversation_id = survivor_id WHERE conversation_id = absorbed_id;

            -- 밴/멤버는 (conversation_id, user_id) PK 라 충돌분을 걸러 옮긴 뒤 나머지를 지운다.
            UPDATE dm_conversation_bans SET conversation_id = survivor_id
             WHERE conversation_id = absorbed_id
               AND user_id NOT IN (SELECT user_id FROM dm_conversation_bans WHERE conversation_id = survivor_id);
            DELETE FROM dm_conversation_bans WHERE conversation_id = absorbed_id;

            -- last_read_at 은 더 늦은(최근) 값 채택 — 안읽음 과다집계 방지
            UPDATE dm_conversation_members s
               SET last_read_at = GREATEST(s.last_read_at, a.last_read_at)
              FROM dm_conversation_members a
             WHERE s.conversation_id = survivor_id
               AND a.conversation_id = absorbed_id
               AND a.user_id = s.user_id;
            UPDATE dm_conversation_members SET conversation_id = survivor_id
             WHERE conversation_id = absorbed_id
               AND user_id NOT IN (SELECT user_id FROM dm_conversation_members WHERE conversation_id = survivor_id);
            DELETE FROM dm_conversation_members WHERE conversation_id = absorbed_id;

            -- survivor.last_message_at = 병합 그룹 중 최댓값
            UPDATE dm_conversations s
               SET last_message_at = GREATEST(s.last_message_at, a.last_message_at)
              FROM dm_conversations a
             WHERE s.id = survivor_id AND a.id = absorbed_id;

            DELETE FROM dm_conversations WHERE id = absorbed_id;
            merged_convs := merged_convs + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '[214] dm_conversations merge — groups=%, absorbed_conversations=%', merged_groups, merged_convs;
END $$;

-- ── 2) 제약 교체 ────────────────────────────────────────────────
DROP INDEX IF EXISTS uq_dm_conversation_listing;
DROP INDEX IF EXISTS uq_dm_conversation_direct;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversation_direct
    ON dm_conversations (participant_1, participant_2)
    WHERE conversation_type = 'direct';

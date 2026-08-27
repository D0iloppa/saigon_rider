# 커뮤니티 강화 — SNS 피드 → 그룹 커뮤니티 전환 (2026-08-27)

> **SoT** — 이 문서가 상세 내용의 단일 출처. 구현 착수 스레드는 이 파일 하나만 읽고 시작할 수 있어야 한다.
> **상태**: 설계 완료 / **구현 미착수**. 이 문서는 설계서이며 코드 변경은 0건이다.
> **티켓**: `doil-context` `2026-08-27-community-enhancement` (발행은 감독이 별도로 수행 — §8 서브티켓 초안 참조)
> **착수 방법**: `/doil-supervise`
> **소유 범위 주의** — **그룹채팅 데이터모델(§3)은 이 티켓이 소유한다.** `260827_walkie_talkie_task.md`(음성메시지·위치공유)가 이 스키마 위에 얹히므로, §3 의 인터페이스를 바꾸려면 워키토키 티켓과 함께 판단해야 한다.

---

## 1. 목적 / 배경

현재 커뮤니티(`/feed`)는 **개인 타임라인 나열형 SNS 피드**다 — 전체 유저의 글이 하나의 글로벌 리스트에 최신순으로 쌓이고, 필터는 `전체 / 내 동네(반경) / 친구(팔로잉) / 핫(좋아요순)` 네 가지 뷰일 뿐이며, 게시물이 **어디에 속하는지**를 표현하는 개념(카테고리·해시태그·그룹)이 스키마 수준에서 전혀 없다. 그 결과 (a) 글을 쓸 동기가 "불특정 다수에게 던지기"뿐이라 생산이 얕고, (b) 읽는 쪽도 자기 관심사를 고를 수 없어 소비가 흩어지며, (c) 소통 창구인 메시징은 **순수 1:1 DM 뿐**이라 다자간 대화가 아예 불가능하다. 이 티켓은 앱의 커뮤니티를 **네이버 밴드 / Facebook 그룹 스타일의 "그룹·관심사 단위로 모이는 구조"** 로 확장한다. 그 선행 서브시스템으로 **그룹 메시지(순수 그룹톡방 + 커뮤니티 기반 오픈톡방)** 를 신설하고, 이어서 커뮤니티 그룹 엔티티 → 콘텐츠 생산 유도 → 소비/발견 유도 → 운영·안전 마감(라운지 잔여 4건)의 순서로 쌓는다.

---

## 2. 확정 요구사항 (대표 인터뷰 2026-08-27 — 재질문 없이 그대로 반영)

| ID | 확정 내용 |
|---|---|
| **R-1** | **대상 영역은 피드 + 라운지 둘 다.** 피드(`frontend/src/pages/feed/*` — 게시물·댓글·응원)와 라운지(파트너 후기·리뷰, 2026-08-19 통합관리 완료분) 종합 강화. |
| **R-2** | **비전 = 그룹 기반 커뮤니티.** "개인 타임라인 나열형" → "그룹/관심사 단위로 모이는 구조". 레퍼런스는 Naver Band / Facebook Group. |
| **R-3** | **강화 방향 4축, 전부 스코프 포함** (나열 순서대로): ① 관계 기능(팔로우·친구·활동알림) ② 운영/안전 마감(O-1~O-4) ③ 콘텐츠 생산 유도(글쓰기 진입장벽·주제/카테고리·해시태그) ④ 소비/발견 유도(추천·인기글·알림). 우선순위는 명시되지 않았다 — Phase 배치는 **기술적 선행관계**로 정한다(§5). |
| **R-4** | **그룹메시지 신설** — 현재 1:1 DM 뿐. 두 종류로 나뉜다: ① **순수 그룹톡방**(사적 다자간 대화, 카카오톡 단톡방 개념) ② **커뮤니티 기반 오픈톡방**(동네별/관심사별 공개 채널 = 커뮤니티 그룹의 소통 창구). |
| **R-5** | **그룹채팅 데이터모델은 이 티켓이 소유**하고 워키토키 티켓이 의존한다. 여기서 확정하는 인터페이스/스키마가 워키토키 설계와 호환돼야 한다. (워키토키 자체 요구사항은 이 문서에서 다루지 않는다.) |
| **R-6** | **운영/안전 마감** — `2026-08-19-partner-lounge-and-report-feedback-loop` 티켓의 대표판단 미결 4건(O-1~O-4)을 이 티켓 스코프로 흡수한다. |

### 가정 (카파시 #1 — 명시)

| ID | 가정 | 틀리면 |
|---|---|---|
| A-1 | 그룹은 **유저가 개설**할 수 있다(밴드/FB그룹은 유저 개설이 기본). 운영자 승인제가 필요하면 §7 Q-1 로 판단. | 그룹 생성 API 게이트가 달라진다 |
| A-2 | **오픈톡방은 커뮤니티 그룹에 종속**한다 — 그룹 없이 떠 있는 오픈채팅은 만들지 않는다(카카오 오픈채팅과 다른 선택). 그룹 = 게시판 + 오픈톡방 한 세트. | §3 의 `community_group_id` 관계와 §4 가 바뀐다 |
| A-3 | 기존 1:1 DM 의 **동작·응답 계약은 무변경**이다. 그룹은 같은 테이블을 확장해 얹되, 마켓 도메인(약속·가격제안)은 **direct 대화에서만** 동작한다. | market.py 전면 재작업이 필요해진다(Phase 1 이 3배가 된다) |
| A-4 | 실시간성은 현행 **5초 폴링**을 그대로 쓴다. WebSocket 전환은 이 티켓 밖. | Phase 1 에 인프라 작업이 추가된다 |

---

## 3. 그룹채팅 데이터모델 설계 **(핵심 섹션 — 이 티켓이 소유)**

### 3.1 현재 구조가 왜 그대로는 안 되는가

`dm_conversations` 는 **2인 고정**이 테이블·제약·서비스·라우터 4층에 박혀 있다.

```
database/init/022_dm_conversations.sql
  participant_1 UUID NOT NULL   ← 고정 2컬럼
  participant_2 UUID NOT NULL
  CHECK (participant_1 < participant_2)   ← 살아 있다 (132 는 UNIQUE 만 DROP 했다)

database/init/132_dm_conversation_context_unique.sql
  uq_dm_conversation_direct   (participant_1, participant_2) WHERE context_id IS NULL
  uq_dm_conversation_listing  (participant_1, participant_2, context_type, context_id) WHERE ...

backend/app/services/dm_policy.py:10
  def require_participant(conv, session_uid) -> uuid.UUID:   ← 반환값이 "상대방 1명"
```

`require_participant()` 가 **상대방 UUID 를 반환**한다는 게 가장 깊은 결합이다. 호출부는 전부 그 반환값을 "대화 상대"로 쓴다 — `backend/app/routers/dm.py`(167·282·378·449행), `backend/app/routers/market.py`(1686·1763·2012·2091행). 그룹에는 "상대방 1명"이 존재하지 않는다.

읽음 처리도 `dm_messages.read_at` **단일 컬럼**이라 "메시지 1건 = 읽은 사람 1명"만 표현할 수 있다. 그룹에서는 멤버마다 읽은 시점이 다르다.

### 3.2 설계 원칙 — 테이블을 새로 만들지 않고 확장한다

**`dm_conversations` / `dm_messages` 테이블명을 바꾸지 않는다.** 다음이 이미 이 이름에 FK 로 묶여 있기 때문이다:

- `MarketplaceAppointment.conversation_id` → `dm_conversations.id`
- `MarketplacePriceOffer`(market.py 경유), `Report.conversation_id`
- 관리자 신고 조회 `GET /admin/api/reports/{id}/dm-messages`
- `backend/app/jobs/title_transfer_reminders.py:38`

테이블을 새로 만들면(`group_conversations` 등) **메시지 도메인이 둘로 갈라져** 신고·어드민·알림·프론트가 전부 2벌이 된다. 카파시 #2(Simplicity First) 위반이다. → **한 테이블에 `conversation_type` 을 두고 참가자만 조인 테이블로 뽑는다.**

### 3.3 스키마안

#### (a) `dm_conversations` 확장 — `database/init/203_group_conversation.sql`

```sql
-- 대화 종류. 기존 행은 전부 'direct'.
ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS conversation_type VARCHAR(20) NOT NULL DEFAULT 'direct';
    --  'direct' : 기존 1:1 DM (마켓 약속·가격제안이 붙는 유일한 종류)
    --  'group'  : 순수 그룹톡방 (사적 다자간, 초대로만 입장)
    --  'open'   : 커뮤니티 오픈톡방 (community_group_id 필수, 그룹 멤버면 입장)

ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS community_group_id UUID
        REFERENCES community_groups(id) ON DELETE CASCADE,   -- 'open' 전용
    ADD COLUMN IF NOT EXISTS title            VARCHAR(60),   -- group/open 방 제목
    ADD COLUMN IF NOT EXISTS photo_content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS member_count     INTEGER NOT NULL DEFAULT 2,  -- 비정규화 카운터
    ADD COLUMN IF NOT EXISTS archived_at      TIMESTAMPTZ;

-- participant_1/2 를 nullable 로 완화 (group/open 은 조인 테이블만 쓴다)
ALTER TABLE dm_conversations ALTER COLUMN participant_1 DROP NOT NULL;
ALTER TABLE dm_conversations ALTER COLUMN participant_2 DROP NOT NULL;

-- 022 의 무명 CHECK(participant_1 < participant_2) 를 종류별 조건부로 교체
ALTER TABLE dm_conversations DROP CONSTRAINT IF EXISTS dm_conversations_check;
ALTER TABLE dm_conversations
    ADD CONSTRAINT dm_conversations_direct_pair_check CHECK (
        conversation_type <> 'direct'
        OR (participant_1 IS NOT NULL AND participant_2 IS NOT NULL AND participant_1 < participant_2)
    );
ALTER TABLE dm_conversations
    ADD CONSTRAINT dm_conversations_open_group_check CHECK (
        (conversation_type = 'open') = (community_group_id IS NOT NULL)
    );

-- 132 의 부분 유니크 인덱스는 direct 한정으로 재선언 (group/open 은 쌍 유일성 개념이 없다)
DROP INDEX IF EXISTS uq_dm_conversation_direct;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversation_direct
    ON dm_conversations (participant_1, participant_2)
    WHERE conversation_type = 'direct' AND context_id IS NULL;
-- uq_dm_conversation_listing 도 동일하게 conversation_type='direct' 조건 추가
```

> **⚠ 마이그레이션 재실행 안전성** (`agent-guidelines.md` §10) — `022` 는 `CREATE TABLE IF NOT EXISTS` 라 재실행 시 no-op 이므로 인라인 CHECK 가 되살아나지 않는다. 즉 **CHECK 소유권 체인 문제(144→198→199 사고 유형)가 발생하지 않으며, `203` 이 유일한 최종 소유자다.** `NOT VALID` 는 불필요하다. 단 `ALTER ... DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT` 는 재실행마다 돌므로 **명명된 제약**을 써야 하고(무명이면 이름이 매번 달라진다), 위 SQL 은 그렇게 짜여 있다. 구현 시 `backend/app/tests/test_migration_check_revalidation.py` 를 **호스트에서** 1회 실행해 확인할 것(컨테이너에서는 마운트 부채로 ERROR 난다 — §10 참조).

#### (b) 참가자 조인 테이블 (신설) — 같은 파일

```sql
CREATE TABLE IF NOT EXISTS dm_conversation_members (
    conversation_id UUID        NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(12) NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member'
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- ← 읽음 SoT (그룹)
    muted_at        TIMESTAMPTZ,                             -- 방별 알림 끄기
    left_at         TIMESTAMPTZ,                             -- 나감(행은 남긴다 — 과거 메시지 귀속·신고 추적)
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conv_members_user
    ON dm_conversation_members (user_id, left_at);          -- 내 대화방 목록
CREATE INDEX IF NOT EXISTS idx_dm_conv_members_conv
    ON dm_conversation_members (conversation_id) WHERE left_at IS NULL;

-- 기존 1:1 대화 백필 (멱등)
INSERT INTO dm_conversation_members (conversation_id, user_id, role, joined_at, last_read_at)
SELECT c.id, p.uid, 'member', c.created_at, COALESCE(
        (SELECT MAX(m.read_at) FROM dm_messages m
          WHERE m.conversation_id = c.id AND m.sender_id <> p.uid AND m.read_at IS NOT NULL),
        c.created_at)
  FROM dm_conversations c
 CROSS JOIN LATERAL (VALUES (c.participant_1), (c.participant_2)) AS p(uid)
 WHERE c.conversation_type = 'direct' AND p.uid IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;
```

#### (c) `dm_messages` — **스키마 변경 없음**

`message_type VARCHAR(20)` 에 **CHECK 제약이 없다**(`086_dm_marketplace_context.sql` 확인). 새 타입은 값만 추가하면 되고 마이그레이션이 필요 없다. `meta JSONB` + `image_content_id` 도 그대로 쓴다. → **워키토키의 `voice` / `location` 타입은 스키마 변경 0건으로 얹힌다** (§3.6).

`read_at` 컬럼은 **direct 전용 레거시로 유지**하고 그룹에서는 쓰지 않는다(삭제하지 않는다 — 카파시 #3). 읽음 판정은 `dm_conversation_members.last_read_at` 이 SoT 가 된다.

```
unread_count(conv, me) =
  SELECT count(*) FROM dm_messages m
   WHERE m.conversation_id = conv
     AND m.sender_id <> me
     AND m.created_at > (SELECT last_read_at FROM dm_conversation_members
                          WHERE conversation_id = conv AND user_id = me)
```

Phase 1 에서 **direct 도 이 계산식으로 통일**한다(백필로 `last_read_at` 이 채워지므로 동등). `read_at` 갱신은 direct 에 한해 그대로 병행해 어드민 신고 조회 화면의 기존 표시를 깨지 않는다.

### 3.4 정책 가드 재설계 — `backend/app/services/dm_policy.py`

기존 `require_participant()` 는 **시그니처를 바꾸지 않고 그대로 둔다**(direct 전용, market.py 4개 호출부 무변경). 그룹용을 **추가**한다.

```python
# 기존 — direct 전용. 그대로 유지. 그룹 대화에 호출하면 403(participant_1/2 가 NULL).
def require_participant(conv, session_uid) -> uuid.UUID: ...

# 신설 — 종류 무관. 반환값이 없다("상대방" 개념을 없앤다).
async def require_member(db, conv, session_uid) -> DmConversationMember:
    """dm_conversation_members 에서 left_at IS NULL 인 행을 찾고 없으면 403."""

# 신설 — 그룹 입장 시 1회만 실행하는 N-1 쌍 차단 검사.
async def require_unblocked_for_join(db, conv_id, joining_uid) -> None:
    """기존 멤버 중 joining_uid 와 양방향 차단 관계인 사람이 있으면 403."""
```

**차단(block) 정책 — 그룹에서의 해석** (§7 Q-4 로 대표 확인 필요, 기본안은 아래):
- **입장 시점 검사**(위 `require_unblocked_for_join`) — 이미 차단 관계인 멤버가 있는 방에는 들어갈 수 없다.
- **입장 후 차단**은 방을 깨지 않는다 — 대신 **차단한 쪽의 화면에서 상대 메시지를 클라이언트/서버 필터로 가린다**(`[차단한 사용자의 메시지]` 플레이스홀더). 다자간 대화를 1:1 규칙으로 강제 종료시키면 무고한 나머지 멤버가 피해를 본다.
- 오픈톡방은 인원이 많아 입장 시 N-1 검사가 비싸다 → **오픈톡방은 입장 검사를 생략하고 표시 필터만 적용**한다(대표 판단 대상).

### 3.5 API 인터페이스안 — `backend/app/routers/dm.py`

기존 7개 엔드포인트는 **응답 계약 무변경**(direct 에 대해). 아래를 추가한다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/dm/conversations/group` | 순수 그룹톡방 개설 — `{ title, member_ids[], photo_content_id? }`. 개설자는 `role='owner'`. |
| POST | `/dm/conversations/{id}/members` | 초대 — `{ user_ids[] }`. `group` 은 멤버 누구나(정책 Q-2), `open` 은 불가(스스로 join). |
| DELETE | `/dm/conversations/{id}/members/{user_id}` | 나가기(자신) / 강퇴(owner·admin). `left_at` 세팅, 행은 남긴다. |
| POST | `/dm/conversations/{id}/join` | **오픈톡방 입장** — `conversation_type='open'` 이고 커뮤니티 그룹 멤버일 때만 200. |
| PATCH | `/dm/conversations/{id}` | 방 제목·사진 변경(owner·admin). |
| POST | `/dm/conversations/{id}/mute` | 방별 알림 토글(`muted_at`). |

`GET /dm/conversations` 응답(`DmConversationOut`)에 **필드를 추가**한다(기존 필드 제거·의미변경 금지):

```
+ conversation_type: 'direct' | 'group' | 'open'
+ title:             str | None      # group/open
+ photo_url:         str | None      # build_imgproxy_url 변환
+ member_count:      int
+ community_group_id: UUID | None
  other_user_id / other_nickname / other_avatar_url   # direct 에서만 non-null (기존 그대로)
```

프론트 `DmList.tsx` 는 `conversation_type` 으로 렌더를 분기한다(direct=상대 아바타, group/open=방 사진 또는 멤버 아바타 스택).

### 3.6 워키토키 티켓과의 인터페이스 호환성 — **깨면 안 되는 계약**

`ai-docs/research/260827_walkie_talkie_location_privacy/SYNTHESIS.md` 기준, 워키토키는 **음성메시지 + 위치공유(unicast)** 를 메시지로 전송한다. 아래 4가지가 이 티켓이 워키토키에게 보장하는 계약이다.

| # | 계약 | 근거 |
|---|---|---|
| **W-1** | `dm_messages.message_type` 은 **CHECK 제약 없는 VARCHAR(20)** 로 유지된다. `voice` / `location` 을 마이그레이션 없이 추가할 수 있다. **이 티켓은 message_type 에 CHECK 를 절대 걸지 않는다.** | `086` 확인 |
| **W-2** | 첨부는 `image_content_id`(단일 contents FK) + `meta JSONB` 조합을 쓴다. 음성 파일은 **`contents` 테이블 중개**(CLAUDE.md 핵심 제약)로 올라가며, 오디오용 별도 컬럼이 필요하면 워키토키 티켓이 `voice_content_id` 를 additive 로 추가한다 — 이 티켓은 `dm_messages` 컬럼을 삭제·이름변경하지 않는다. | CLAUDE.md 컨텐츠 규칙 |
| **W-3** | **수신자 집합은 `dm_conversation_members` 가 유일한 SoT** 다. 워키토키가 "이 방의 누구에게 보낼지"를 물을 때 `participant_1/2` 를 읽으면 안 된다 — `left_at IS NULL` 인 멤버 행을 읽는다. 음성 브로드캐스트가 그룹으로 확장돼도 코드가 그대로다. | §3.3(b) |
| **W-4** | 알림은 `noti_events.enqueue(db, "dm.message_sent", {...})` 의 **payload 형태가 바뀐다** — 기존 `recipient_id`(단수)가 **`recipient_ids`(배열)** 로 확장된다. 워키토키가 음성 알림을 붙일 때 이 배열형을 전제로 짜야 한다. 마이그레이션 기간에는 워커(`backend/app/noti_worker/__main__.py:_handle_dm_message`)가 두 형태를 모두 받는다. | §3.7 |

> 위치공유(`location` 타입)의 **민감정보 취급 요건**(목적고지·동의·옵트아웃)은 워키토키 티켓이 소유한다. 이 티켓은 그 데이터를 담을 그릇만 보장한다. 다만 **오픈톡방에 위치를 브로드캐스트하는 것은 1:1 unicast 와 위험도가 다르다** — §7 Q-5.

### 3.7 알림 경로 변경

`dm.py:412` 의 `noti_events.enqueue(db, "dm.message_sent", {... "recipient_id": other_id ...})` 가 **단수 수신자**를 전제한다. 그룹은 멤버 N-1 명에게 가야 한다.

- **payload 를 `recipient_ids: [uuid, ...]` 로 확장**하고, 워커 `_handle_dm_message`(`backend/app/noti_worker/__main__.py:152`)가 배열을 순회해 `Notification` 을 N건 insert 한다. 중복 방지 unique index 가 `(source_event_id, user_id)` 이므로 **한 이벤트에서 N 유저 insert 는 이미 안전하다** — 인덱스 변경 불필요.
- `muted_at` 이 걸린 멤버는 `recipient_ids` 에서 제외한다(발행 시점 필터 — 워커가 설정을 다시 읽지 않게).
- 전역 `notification_settings.chat` 토글은 그대로 적용된다(`173_notification_settings_chat.sql`).
- **오픈톡방은 기본 muted 로 가입시킨다** — 동네 오픈채팅이 켜져 있으면 푸시 폭탄이 된다(§7 Q-6).

### 3.8 영향범위 — 건드리면 회귀가 나는 지점

| 파일 | 위험 | 조치 |
|---|---|---|
| `backend/app/routers/market.py` (1686·1763·2012·2091행 외 `participant_1/2` 튜플 검사 10곳) | 약속·가격제안이 2인 전제 | **무변경.** 마켓 경로는 `conversation_type='direct'` 를 추가 검증만 하고 로직은 그대로 둔다 |
| `backend/app/jobs/title_transfer_reminders.py:38` | `SELECT participant_1, participant_2` | direct 만 대상이므로 `WHERE conversation_type='direct'` 추가 |
| `Report.conversation_id` / 어드민 `GET /admin/api/reports/{id}/dm-messages` | 그룹 대화 신고 시 "누구를 신고했는지" 불명 | `reports.reported_user_id` 를 그룹에서는 **필수**로 요구(§7 Q-3) |
| `frontend/src/pages/dm/DmDetail.tsx` (865줄, 5초 폴링) | 방 종류 분기 없음 | `conversation_type` 분기 추가. 약속·가격제안 UI 는 `direct` 에서만 렌더 |
| `frontend/src/store/useDmStore.ts` | unread 집계 | 계산식 변경(§3.3c)에 맞춰 갱신 |

---

## 4. 커뮤니티 그룹 엔티티 설계 초안 (Band / FB Group 스타일)

### 4.1 현재 실태 — **"그룹"은 존재하지 않는다**

DB 전체에서 그룹에 해당하는 것은 `business_group`(`BusinessProfile.group_id`, 프랜차이즈/브랜드 묶음, 관리 UI 없음) 하나뿐이며 커뮤니티와 무관하다. **이름 충돌 주의** — 신규 테이블은 `community_groups` 로 명명한다.

또한 **`users` 테이블에 귀속 동네 필드가 없다**(`home_ward_id` 등 부재 — 실측 확인). 현재 `내 동네` 필터는 매 요청 클라이언트 좌표로 `ST_DWithin` 반경검색을 한다. 즉 "내 동네 그룹"을 만들려면 **유저의 동네 귀속을 새로 정의**해야 한다(§7 Q-7).

### 4.2 스키마안 — `database/init/204_community_group.sql`

```sql
CREATE TABLE IF NOT EXISTS community_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(40) UNIQUE,                 -- 딥링크용
    name            VARCHAR(60)  NOT NULL,
    description     TEXT,
    cover_content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    group_type      VARCHAR(20) NOT NULL DEFAULT 'interest',  -- 'interest' | 'neighborhood'
    ward_id         SMALLINT REFERENCES wards(id) ON DELETE SET NULL,      -- neighborhood 전용
    district_id     SMALLINT REFERENCES districts(id) ON DELETE SET NULL,
    join_policy     VARCHAR(20) NOT NULL DEFAULT 'open',      -- 'open' | 'approval' | 'invite'
    visibility      VARCHAR(20) NOT NULL DEFAULT 'public',    -- 'public' | 'private'
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    member_count    INTEGER NOT NULL DEFAULT 0,
    post_count      INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE | SUSPENDED | ARCHIVED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT community_groups_neighborhood_check CHECK (
        group_type <> 'neighborhood' OR ward_id IS NOT NULL OR district_id IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS community_group_members (
    group_id   UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(12) NOT NULL DEFAULT 'member',   -- 'owner' | 'manager' | 'member'
    status     VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',   -- 'PENDING'(승인제) | 'ACTIVE' | 'BANNED'
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cgm_user ON community_group_members (user_id, status);

-- 피드 게시물 ↔ 그룹 (additive, nullable — 기존 글은 전부 NULL = 전체 공개 피드)
ALTER TABLE feed_posts
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES community_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_feed_posts_group
    ON feed_posts (group_id, created_at DESC) WHERE group_id IS NOT NULL;
```

**그룹 ↔ 오픈톡방 연계**: 그룹 개설 시 `dm_conversations` 에 `conversation_type='open'`, `community_group_id=<group.id>` 인 행을 **1개 자동 생성**한다(그룹당 기본 채팅방 1개). 방 추가 개설은 Phase 2 범위 밖.

### 4.3 화면 구조 초안

```
/community/groups          그룹 탐색 (내 그룹 / 추천 / 동네 / 인기)
/community/groups/new      그룹 개설
/group/:slug               그룹 홈 — 커버·소개·멤버수 · [게시판 | 채팅 | 멤버] 3탭
  · 게시판  = feed_posts WHERE group_id = :id  (FeedList 카드 문법 재사용, 신규 디자인 0건)
  · 채팅    = /dm/:conversationId 로 이동 (오픈톡방, §3)
  · 멤버    = community_group_members 목록 (owner/manager 는 승인·강퇴)
/feed                      기존 전체 피드 — 필터칩에 `내 그룹` 추가
```

**기존 화면 재사용 원칙**(카파시 #2·#3): 그룹 게시판은 `FeedList.module.css` 의 `.feedGrid`/`.feedCard` 를 그대로 쓰고, 글쓰기는 `FeedCreate.tsx` 에 `groupId` 파라미터만 얹는다. **신규 카드 디자인을 만들지 않는다** — `260813_user_profile_page_task.md` 의 D-2 선례와 동일한 판단.

---

## 5. Phase 분리안

Phase 순서는 **기술적 선행관계**로 정했다(R-3 은 우선순위를 명시하지 않았다): 그룹채팅 스키마가 그룹 엔티티의 오픈톡방을 떠받치고, 그룹 엔티티가 카테고리/발견의 축이 된다. **O-1~O-4(Phase 5)는 앞 Phase 와 의존관계가 없어 언제든 병렬 착수 가능하다** — 감독이 워커 여유에 따라 앞당겨도 된다.

### Phase 1 — 그룹채팅 기반 (§3)

| ID | 작업 | 완료 기준 (verifiable) |
|---|---|---|
| P1-1 | `203_group_conversation.sql` — 컬럼·CHECK·조인테이블·백필 | 마이그레이션 **2회 연속 실행** 후 exit 0 (재실행 안전성). 백필 후 `dm_conversation_members` 행 수 = 기존 direct 대화 수 × 2 |
| P1-2 | `dm_policy.require_member` / `require_unblocked_for_join` 신설 (기존 `require_participant` 무변경) | 기존 DM 테스트 전건 통과 + 비멤버 403 신규 테스트 |
| P1-3 | 그룹방 개설·초대·나가기·강퇴 API (§3.5) | 3인 방 개설 → 메시지 → 1명 나감 → 남은 2명만 수신되는 e2e 테스트 |
| P1-4 | unread 계산을 `last_read_at` 기준으로 통일 | direct 의 unread 값이 변경 전후 동일함을 계약 테스트로 고정 |
| P1-5 | `recipient_ids` 배열 알림 + `muted_at` 제외 (§3.7) | 3인 방 1발신 → `notifications` 2건 생성. muted 멤버 0건 |
| P1-6 | 프론트 `DmList`/`DmDetail` 방 종류 분기, 그룹방 생성 UI | 그룹방에서 약속·가격제안 UI 가 **렌더되지 않음**을 계약 테스트로 고정 |
| P1-7 | 마켓 경로 회귀 방지 | `market.py` 무변경 확인(diff 0) + 마켓 약속/가격제안 기존 테스트 전건 통과 |

**Phase 1 완료 판정**: 3인 그룹톡방에서 텍스트·이미지 송수신, 멤버별 unread 정확, 1:1 DM·마켓 거래 기능 **회귀 0건**.

### Phase 2 — 커뮤니티 그룹 엔티티 (§4)

| ID | 작업 | 완료 기준 |
|---|---|---|
| P2-1 | `204_community_group.sql` — 그룹·멤버 테이블 + `feed_posts.group_id` | 재실행 2회 exit 0. 기존 게시물 `group_id` 전부 NULL |
| P2-2 | 그룹 CRUD·가입·승인·탈퇴 API | 승인제 그룹에서 `PENDING` → 관리자 승인 → `ACTIVE` 왕복 테스트 |
| P2-3 | 그룹 개설 시 오픈톡방 자동 생성 (`conversation_type='open'`) | 그룹 생성 응답에 `conversationId` 포함, 비멤버 입장 403 |
| P2-4 | `/group/:slug` 3탭 화면 + 그룹 게시판(FeedList 문법 재사용) | 신규 CSS 파일 **0개**(기존 module.css 재사용) |
| P2-5 | `/feed` 필터칩 `내 그룹` 추가, `GET /feed?filter=groups` | 내 그룹 글만 나오는지 + 비멤버에게 private 그룹 글이 안 나오는지 |
| P2-6 | i18n 3로케일(vi/ko/en) | 키 패리티 3벌 동수, 누락·잉여 0 |

**Phase 2 완료 판정**: 유저가 그룹을 만들고 → 남이 가입하고 → 그룹 게시판에 글을 쓰고 → 오픈톡방에서 대화하는 **1회 왕복이 실기기에서 성립**.

### Phase 3 — 콘텐츠 생산 유도 (R-3 ③)

| ID | 작업 | 완료 기준 |
|---|---|---|
| P3-1 | 주제/카테고리 — `feed_posts.topic` 또는 그룹 내 말머리. **그룹이 이미 분류축이므로 전역 카테고리를 또 만들지 않는다**(Q-8) | 대표 판단 후 착수 |
| P3-2 | 해시태그 — `post_hashtags(post_id, tag)` 정규화 테이블 + 본문 파싱 | `#태그` 입력 → 태그 목록 조회 → 태그별 피드 3단 왕복 |
| P3-3 | 글쓰기 진입장벽 낮추기 — `FeedCreate` 를 그룹 컨텍스트 인지형으로 + 프롬프트("오늘 동네 소식 있나요?") | 글쓰기 진입 → 발행까지 탭 수가 현행 대비 감소함을 화면흐름으로 확인 |
| P3-4 | 그룹 게시판 글쓰기 FAB | 그룹 홈에서 글쓰기 → `group_id` 가 채워진 게시물 생성 |

### Phase 4 — 소비/발견 유도 (R-3 ④)

| ID | 작업 | 완료 기준 |
|---|---|---|
| P4-1 | 그룹 추천 — 동네(ward) + 팔로우한 사람이 속한 그룹 기반 | 신규 유저에게 추천 그룹 5개 이상 노출 |
| P4-2 | 인기글 랭킹 개선 — 현행 `filter=hot` 은 **`like_count DESC` 단순 정렬**(시간감쇠 없음)이라 오래된 글이 영구 상위. 시간감쇠 score 도입 | 24h 내 글이 상위 10 중 과반 |
| P4-3 | 활동 알림 (R-3 ①) — 내 글 댓글·응원, 팔로우한 사람의 새 글, 그룹 새 글 | `notification_settings` 에 그룹 토글 추가, 알림 3종 발화 확인 |
| P4-4 | 팔로우 관계 강화 — 맞팔=친구 표기, 프로필 상호작용 (`UserFollow` 는 이미 완비) | 기존 `follows.py` 재사용, 신규 테이블 0개 |

### Phase 5 — 운영/안전 마감 (O-1~O-4, §6·§7)

| ID | 작업 | 완료 기준 |
|---|---|---|
| P5-1 | **O-3** 프로필 진입 카드 스켈레톤 — `ProfileMain.tsx` 라운지 카드 로딩 중 위치 깜빡 | 카드 로딩 중 `SkeletonRows` 렌더, 레이아웃 시프트 0 |
| P5-2 | **O-4** 신고 이력 카드 부모 맥락 — `ReportOut` 에 `parent_context`(예: "○○업체의 후기") 추가 | REVIEW/COMMENT 신고에서 부모 맥락 문자열이 내려오고 화면에 표시 |
| P5-3 | **O-2** 다중 업체 미답변 배지 합산 | 대표 판단 후. 2업체 보유 계정에서 배지 = 합산값 |
| P5-4 | **O-1** `hidden_reason` 사장님 노출 | 대표 판단 후. 노출 결정 시 신고자 특정 단서 제거 규칙 동반 |
| P5-5 | 그룹 신고·모더레이션 — 그룹/오픈톡방 신고 대상 종류 추가 | `reports.target_type` 에 값 추가 시 **§10 CHECK 체인 규약 준수**(새 파일이 최종 소유자, `199`/직전 소유자에 `NOT VALID`) |

---

## 6. 현재 코드베이스 실태 요약 (실측 2026-08-27)

### 6.1 메시징 (1:1 DM)

| 항목 | 실태 | 경로 |
|---|---|---|
| 모델 | `DmConversation`(participant_1/2 고정), `DmMessage`(read_at 단일) | `backend/app/models.py:1334-1368` |
| 마이그레이션 | `022`(테이블+CHECK), `023`(메시지), `031`(폴 간격 시드), `086`(context/message_type/meta), `132`(부분 유니크) | `database/init/` |
| 라우터 | 7개 엔드포인트 | `backend/app/routers/dm.py` (510줄) |
| 정책 가드 | `require_participant`(상대 1명 반환), `require_unblocked`(쌍) | `backend/app/services/dm_policy.py` (28줄) |
| 스키마 | `DmConversationOut`(other_user_* 단수), `DmMessageOut` | `backend/app/schemas.py:1108-1229` |
| 읽음 | 별도 테이블 없음. `dm_messages.read_at` + 매 요청 count 집계 | `dm.py:114-124, 441-470` |
| 알림 | `noti_events.enqueue("dm.message_sent", {recipient_id})` → outbox → Redis Stream → 워커 | `dm.py:412`, `noti_worker/__main__.py:152` |
| 실시간 | **폴링 5초 하드코딩**. WebSocket 없음. `031` 의 `unread_poll_interval` 시드는 **아무도 읽지 않는다**(설정-실동작 불일치, 기존 부채) | `frontend/src/pages/dm/DmDetail.tsx:121` |
| 프론트 | `DmList.tsx`, `DmDetail.tsx`(865줄), `AppointmentLocationPicker.tsx`, `mockStickers.ts` | `frontend/src/pages/dm/` |
| 차단 | `UserBlock(blocker_id, blocked_id)` 복합 PK, 양방향 OR 검사 | `models.py:679-688` |
| 결합 | `MarketplaceAppointment.conversation_id`, `Report.conversation_id`, `title_transfer_reminders.py:38`, `market.py` 2인 튜플 검사 10곳 | — |

### 6.2 피드 (커뮤니티)

| 항목 | 실태 | 경로 |
|---|---|---|
| 프론트 | `FeedList.tsx`(328줄, 2열 그리드·필터칩 4종), `FeedCreate.tsx`, `FeedDetail.tsx`, `FeedEdit.tsx` | `frontend/src/pages/feed/` |
| 모델 | `FeedPost`(user_id·content·image·lat/lng·ward_id·district_id·like_count·comment_count·is_story·search_blob), `FeedPostImage`, `PostLike`, `PostComment`(parent_id 대댓글), `PostCommentLike` | `models.py:392,435,1150,1162,1182` |
| **카테고리·해시태그·그룹 필드** | **전무.** `FeedPost` 에 category/tag/hashtag/group_id 컬럼 없음 | — |
| 라우터 | `GET /feed`(filter=all/hot/friends/neighborhood), stories, CRUD, like, comments, comment like, report ×2 | `backend/app/routers/feed.py` (623줄) |
| 랭킹 | `all/friends/neighborhood` = `created_at DESC` 고정. `hot` = **`like_count DESC` 단순 정렬(시간감쇠 없음)** | `feed.py:134-` |
| 팔로우 | **`UserFollow` 완비·실배선** — 라우터·친구 피드 필터·마켓 판매자 표시까지 사용 중 | `models.py:1322`, `routers/follows.py`(207줄) |
| 신고 | 통합 `Report` 테이블(LISTING/USER/DM/POST/COMMENT/REVIEW/BIZ), `ReportOut` 은 원본 status/resolution_note 미노출, 중복가드 `_report_guard.guard_duplicate_report` | `models.py:1859-`, `schemas.py:1332-1352`, `routers/_report_guard.py` |

### 6.3 라운지 (파트너 후기) — 2026-08-19 통합관리 완료분

| 항목 | 실태 | 경로 |
|---|---|---|
| **"라운지"의 정체** | 별도 디렉토리가 아니다 — `/biz/manage` 화면의 **헤더 명칭**(2026-07-26 "파트너 라운지"로 개칭, i18n `biz.manageTitle`) | `frontend/src/pages/biz/BizManage.tsx` + `BizDashboard.tsx` |
| 리뷰 모델 | `BusinessReview` — `UNIQUE(profile_id, user_id)` upsert. 사장님 답글은 **별도 테이블 없이 컬럼 2개**(`owner_reply`, `owner_replied_at`). 숨김은 `hidden_at`/`hidden_reason`/`hidden_by` | `models.py:840-865` |
| 오너 전용 목록 | `GET /biz/reviews` — 공개 조회와 **의도적으로 라우트 분리**(숨김 후기·오너 전용 필드 누출 방지). 숨김 후기는 포함하되 `body=None, hidden=true` 블라인드 | `backend/app/routers/biz.py:1578-1668` |
| `unanswered_count` | `count(*) WHERE profile_id=? AND owner_reply IS NULL` — `unanswered_only` 필터와 **무관하게 항상 전체값** | `biz.py:1605-1611` |
| `hidden_reason` 노출 | 소비자 `BusinessReviewOut` = 본인 후기 조회에서만 non-null / **오너 `BusinessOwnerReviewOut` 에는 필드 자체가 없음**(신고자 익명성·보복 위험, 코드 주석에 "대표 미결 보고" 명시) / 어드민은 전체 노출·편집 가능 | `schemas.py:1679-1691, 1715-1729`, `admin_api/reviews.py` |
| 공용 컴포넌트 | `ReviewActionRow.tsx`, `ReviewModerationSheets.tsx`, `useReviewModeration.ts` — `BizPublic` 과 라운지 대시보드 공용 | `frontend/src/components/biz/`, `frontend/src/hooks/` |
| 프로필 진입 카드 | `ProfileMain.tsx:476-497` — `activeBizProfile` 있을 때만 조건부 렌더 + `bizUnansweredCount` 배지. **스켈레톤 미적용**(O-3 의 실체) | `frontend/src/pages/profile/ProfileMain.tsx` |

### 6.4 그룹 / 동네 / 태그

| 항목 | 실태 |
|---|---|
| 커뮤니티 그룹 | **전무.** DB 전체에서 "그룹"은 `business_group`(프랜차이즈 묶음, `BusinessProfile.group_id`, 관리 UI 없음) 하나뿐 — 커뮤니티와 무관. **신규 도메인 신설 필요.** 이름 충돌 회피 위해 `community_groups` 명명 |
| 동네 | `districts`(id·code·name_ko/vi/en·center_lat/lng), `wards`(2025-07-01 행정 통폐합 이후 최하위 단위) 이미 정교하게 모델링됨 |
| **유저 동네 귀속** | **없음.** `users` 테이블에 `home_ward_id` 류 필드 부재(실측). `내 동네` 필터는 매 요청 클라이언트 좌표로 `ST_DWithin` 반경검색 |
| 태그/관심사 | 마켓·업체·POI 에는 카테고리 존재(`MarketplaceCategory`/`BusinessCategory`/`PoiCategory`), 마켓에 `manner_tags` JSONB. **피드/커뮤니티에는 태그·해시태그·관심사 개념 전무** |

### 6.5 규약 — 구현 시 반드시 지킬 것

- **마이그레이션은 매 배포마다 전량 재실행된다**(`agent-guidelines.md` §10). 모든 SQL 을 멱등으로 짜고, **CHECK 제약을 여러 파일이 좁혀나가면 최종 소유자만 `NOT VALID` 없이** 선언한다. 2026-08-19 에 이 규약을 어겨 BFF 전면 502 사고가 났다(`63a4733`).
- 회귀 테스트 `test_migration_check_revalidation.py` 는 **컨테이너에서 ERROR** 난다(마운트 부채) — 호스트에서 수동 실행.
- `test_market_listing_owner_access.py` 와 위 테스트를 **같은 프로세스에서 함께 돌리면 실패**한다(기존 격리 결함). 모듈 단위로 실행.
- 이미지는 전부 `contents` 테이블 중개 + `build_imgproxy_url()`. 프론트 동적 이미지는 `<AppImage>`.
- i18n 3로케일(vi/ko/en) 키 패리티 필수.
- 재빌드: `docker compose --env-file .env up --build -d frontend` / `... -d bff`.

---

## 7. 대표 판단이 필요한 미결 사항

### 7.1 2026-08-19 티켓에서 흡수한 4건 (재확인)

| ID | 내용 | 설계자 권고 |
|---|---|---|
| **O-1** | `hidden_reason` 원문을 사장님에게 노출할지 | **권고: 원문 대신 사유 코드(i18n 문구)만 노출.** 원문에는 신고자를 특정할 단서가 섞일 수 있다(현행 보수적 결정의 근거). 코드화하면 "왜 숨겨졌는지"는 알리고 익명성은 지킨다 |
| **O-2** | 다중 업체 보유 시 미답변 배지 합산 여부 (현재 첫 업체만) | **권고: 합산.** 배지의 의미가 "내가 할 일"이라면 업체 단위로 쪼갤 이유가 없다. 단 카드 탭 후 어느 업체인지 고르는 단계가 필요 |
| **O-3** | 프로필 진입 카드 로딩 중 위치 깜빡 (스켈레톤 미적용) | **권고: 즉시 수정.** 판단이 갈릴 여지가 없는 순수 결함이다. Phase 5 최우선 |
| **O-4** | 신고 이력 카드의 부모 맥락('○○업체의 후기') — `ReportOut` 백엔드 확장 필요 | **권고: 추가.** 다만 부모 맥락에 업체명이 들어가므로 **숨김/삭제된 부모**의 처리 규칙을 함께 정해야 한다 |

### 7.2 이 설계에서 새로 발굴된 미결

| ID | 내용 | 왜 대표 판단인가 |
|---|---|---|
| **Q-1** | **그룹을 유저가 자유 개설**하게 할 것인가, 운영자 승인제인가 | 자유 개설은 성장이 빠르지만 스팸·불법 그룹 모더레이션 부담이 즉시 생긴다. 베트남 시장 T&S 리스크 판단 필요 |
| **Q-2** | 순수 그룹톡방 **초대 권한** — 멤버 누구나 vs owner/admin 만 | 카톡은 누구나, 밴드는 관리자. 스팸 초대 vs 성장 트레이드오프 |
| **Q-3** | **그룹 대화 신고 대상** — 방 전체 vs 특정 멤버 vs 특정 메시지 | 현행 `Report.conversation_id` 는 방 단위라 그룹에선 "누구를 신고했는지"가 사라진다. 어드민 처리 절차가 달라진다 |
| **Q-4** | **입장 후 차단 정책** — §3.4 기본안(방 유지 + 표시 필터) 승인 여부 | 1:1 규칙(대화 403)을 그대로 적용하면 무고한 나머지 멤버가 방을 잃는다 |
| **Q-5** | **오픈톡방 위치공유 허용 여부**(워키토키 연계) | 1:1 unicast 위치공유와 **다수 공개 채널 브로드캐스트**는 위험도가 다르다. PDPL 2025 민감정보 취급 — 현지 변호사 확인 대상(`260827_walkie_talkie_location_privacy/SYNTHESIS.md` §1~2) |
| **Q-6** | **오픈톡방 기본 알림 상태** — 기본 muted 권고 | 동네 오픈채팅이 기본 ON 이면 푸시 폭탄으로 앱 알림 전체를 꺼버리게 만든다 |
| **Q-7** | **유저의 동네 귀속을 새로 만들 것인가** (`users.home_ward_id`) | 현재는 매 요청 GPS 반경검색이라 "동네 그룹"의 소속 판정 기준이 없다. 다만 **GPS 자동실행 금지 제약**(service-rules)이 있어 동네를 어떻게 확정할지가 정책 문제 |
| **Q-8** | **전역 카테고리를 만들 것인가** — 그룹이 이미 분류축인데 카테고리를 또 두면 축이 둘 | 권고: **그룹만.** 해시태그는 자유 분류로 보완. 다만 R-3 ③ 이 "주제/카테고리"를 명시했으므로 대표 확인 필요 |
| **Q-9** | **그룹 인원 상한** (오픈톡방 특히) | 상한이 없으면 폴링 5초 × N명이 곧 부하가 된다. WebSocket 전환 시점을 결정하는 숫자 |
| **Q-10** | 그룹 프라이버시 — `visibility='private'` 그룹의 글이 **전체 피드·검색·인기글에 노출되지 않음**을 어디까지 보장할지 | 누락 시 사적 그룹 글이 전체 피드로 새는 심각 사고. Phase 2 착수 전 확정 필요 |

---

## 8. Phase 별 서브티켓 초안 (제목만 — 발행은 감독이 별도로 수행)

**메인 티켓**: `2026-08-27-community-enhancement`

| `sub_id` | 제목 | 권장 모델 · 근거 (CLAUDE.md §5) |
|---|---|---|
| `p1-schema` | 그룹채팅 스키마 마이그레이션 + 백필 (`203`) | **Fable** — 재실행 안전성·CHECK 체인이 과거 502 사고 영역. 설계 판단 필요 |
| `p1-policy` | `dm_policy` 그룹 가드 신설 + 1:1 계약 보존 | **Fable** — 인증/권한 경로. 회귀 시 정보 누출 |
| `p1-api` | 그룹방 개설·초대·나가기·강퇴·mute API | Sonnet — 기존 라우터 패턴 미러링 |
| `p1-unread` | unread 계산 `last_read_at` 통일 + 계약 테스트 | Sonnet — 계산식 교체, 검증 기준 명확 |
| `p1-noti` | `recipient_ids` 배열 알림 + 워커 순회 | Sonnet — outbox 패턴 기존 자산 확장 |
| `p1-front` | `DmList`/`DmDetail` 방 종류 분기 + 그룹방 생성 UI | **Fable** — UI/디자인 고퀄 작업 |
| `p2-schema` | `community_groups` 도메인 스키마 (`204`) | **Fable** — 신규 도메인 설계 |
| `p2-api` | 그룹 CRUD·가입·승인·탈퇴 + 오픈톡방 자동생성 | Sonnet |
| `p2-front` | `/group/:slug` 3탭 + 그룹 탐색·개설 화면 | **Fable** — 신규 화면 시각 설계 |
| `p2-feed` | `feed_posts.group_id` 배선 + `내 그룹` 필터 + private 누출 차단 | **Fable** — Q-10 프라이버시 경계 |
| `p3-hashtag` | 해시태그 파싱·저장·태그별 피드 | Sonnet |
| `p3-write` | 글쓰기 진입장벽 완화 + 그룹 컨텍스트 작성 | **Fable** — UX 판단 |
| `p4-rank` | 인기글 시간감쇠 랭킹 | **Fable** — 랭킹 공식 설계 |
| `p4-discover` | 그룹 추천 + 활동 알림 3종 | Sonnet |
| `p5-o3-skeleton` | O-3 프로필 라운지 카드 스켈레톤 | Haiku — 기계적 수정, 패턴 존재 |
| `p5-o4-context` | O-4 `ReportOut` 부모 맥락 확장 | Sonnet |
| `p5-o2-badge` | O-2 다중 업체 미답변 배지 합산 | Sonnet (대표 판단 후) |
| `p5-o1-reason` | O-1 `hidden_reason` 노출 정책 반영 | **Fable** (대표 판단 후) — 신고자 익명성 경계 |
| `p5-moderation` | 그룹·오픈톡방 신고/모더레이션 (`target_type` 확장) | **Fable** — §10 CHECK 체인 규약 준수 필수 |

---

## 부록 — 참고 문서

| 문서 | 왜 보나 |
|---|---|
| [`ai-docs/agent-guidelines.md`](../../agent-guidelines.md) §10 | DB 마이그레이션 재실행 규약 (어기면 배포 502) |
| [`ai-docs/context/frontend-page-map.md`](../../context/frontend-page-map.md) §3.4 / §3.7 | 커뮤니티·라운지 화면 상세 |
| [`ai-docs/task/active/260813_user_profile_page_task.md`](260813_user_profile_page_task.md) | "시트는 잎, 페이지는 탐색" 원칙 + 기존 카드 문법 재사용 선례 |
| [`ai-docs/research/260827_walkie_talkie_location_privacy/SYNTHESIS.md`](../../research/260827_walkie_talkie_location_privacy/SYNTHESIS.md) | 음성·위치 민감정보 법적 리스크 (Q-5 근거) |
| `doil-context` `2026-08-19-partner-lounge-and-report-feedback-loop` | O-1~O-4 원본 맥락 + 마이그레이션 사고 기록 |

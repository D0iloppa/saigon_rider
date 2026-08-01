# Saigon Rider — API 계약 명세 v1.0

> 발행일: 2026-05-18
> 전제: 결정서 D의 추천안 (Supabase + PostgREST + Hono)
> 형식: OpenAPI 3.0 호환 사양 + TypeScript 타입 + 클라이언트 호출 예시

---

## 0. 인증 + 공통

### 0.1 인증 방식

모든 요청은 `Authorization: Bearer <jwt>` 헤더 필수.
JWT는 Supabase Auth에서 발급. payload에 `auth.uid`가 들어있고, PostgreSQL RLS가 `auth.uid()`로 권한 체크.

```typescript
// 클라이언트 (Expo + supabase-js)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

### 0.2 베이스 URL

```
Supabase REST:    https://{project}.supabase.co/rest/v1
Supabase Auth:    https://{project}.supabase.co/auth/v1
Supabase Realtime: wss://{project}.supabase.co/realtime/v1
Hono 보조 API:    https://api.saigonrider.app/v1
```

### 0.3 공통 에러 형식

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "insufficient GP balance: have 100, need 200",
    "details": { "have": 100, "need": 200, "currency": "GP" }
  }
}
```

PostgREST는 PL/pgSQL의 `RAISE EXCEPTION` 메시지를 그대로 4xx로 반환.

### 0.4 sre_user / auth.users 매핑 트리거

```sql
-- 사용자 가입 시 sre_user 자동 생성
CREATE OR REPLACE FUNCTION on_auth_user_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id BIGINT;
BEGIN
  INSERT INTO sre_user (external_user_uuid, phone, account_type, status)
  VALUES (NEW.id, NEW.phone, 'STANDARD', 'ACTIVE')
  RETURNING user_id INTO v_user_id;

  INSERT INTO rp_balance (user_id) VALUES (v_user_id);

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION on_auth_user_created();
```

### 0.5 sre_user.user_id 조회 헬퍼 (RLS용)

```sql
CREATE OR REPLACE FUNCTION current_sre_user_id()
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT user_id FROM sre_user
   WHERE external_user_uuid = auth.uid()
$$;
```

모든 RLS 정책이 이걸로 본인 row만 접근.

---

## 1. AUTH 도메인 (5 엔드포인트)

### 1.1 `POST /auth/v1/otp` — Phone OTP 발송
```typescript
// 요청
{ phone: "+84901234567" }

// 응답
{ messageId: "...", phone: "+84..." }

// 클라이언트
const { data, error } = await supabase.auth.signInWithOtp({
  phone: '+84901234567',
});
```

### 1.2 `POST /auth/v1/verify` — OTP 인증 + JWT 발급
```typescript
// 요청
{ phone: "+84901234567", token: "123456", type: "sms" }

// 응답
{
  access_token: "eyJ...",
  refresh_token: "...",
  user: { id: "uuid", phone: "...", ... }
}

// 클라이언트
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+84901234567',
  token: '123456',
  type: 'sms',
});
```

### 1.3 `POST /auth/v1/token?grant_type=refresh_token` — 토큰 갱신
```typescript
// 자동 처리 (supabase-js)
```

### 1.4 `GET /auth/v1/user` — 현재 사용자
```typescript
const { data: { user } } = await supabase.auth.getUser();
```

### 1.5 `POST /auth/v1/logout` — 로그아웃
```typescript
await supabase.auth.signOut();
```

---

## 2. PROFILE 도메인 (4 엔드포인트)

### 2.1 `GET /rest/v1/sre_user_view?select=*` — 내 프로필
```sql
-- 뷰 정의
CREATE VIEW sre_user_view AS
SELECT
  u.user_id, u.phone, u.nickname, u.profile_image_url,
  u.account_type, u.status, u.created_at,
  b.current_balance AS gp,
  b.gc_balance AS gc,
  b.lifetime_earned AS lifetime_gp,
  b.lifetime_gc_earned AS lifetime_gc,
  u.tier
FROM sre_user u
LEFT JOIN rp_balance b ON b.user_id = u.user_id;

-- RLS: 본인만
CREATE POLICY "own_profile" ON sre_user
  FOR ALL USING (user_id = current_sre_user_id());
```

```typescript
// 클라이언트
const { data, error } = await supabase
  .from('sre_user_view')
  .select('*')
  .single();

// 응답 타입
type Profile = {
  user_id: number;
  phone: string;
  nickname: string | null;
  profile_image_url: string | null;
  gp: number;
  gc: number;
  lifetime_gp: number;
  lifetime_gc: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  created_at: string;
};
```

### 2.2 `PATCH /rest/v1/sre_user` — 프로필 업데이트
```typescript
await supabase
  .from('sre_user')
  .update({ nickname: 'nguyen_rider', rider_style: 'NIGHT' })
  .eq('user_id', myUserId);
```

### 2.3 `POST /rest/v1/rpc/get_active_season` — 활성 시즌 조회
```sql
CREATE OR REPLACE FUNCTION get_active_season_info()
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'season_code', season_code,
    'display_name', display_name,
    'collection_code', collection_code,
    'starts_at', starts_at,
    'ends_at', ends_at,
    'days_remaining',
      EXTRACT(DAY FROM ends_at - NOW())::INT
  ) INTO v_result
  FROM season WHERE status = 'ACTIVE'
  ORDER BY starts_at DESC LIMIT 1;

  RETURN COALESCE(v_result, 'null'::jsonb);
END $$;
```

### 2.4 `POST /rest/v1/rpc/get_user_summary` — 홈 화면 데이터 1콜
```sql
CREATE OR REPLACE FUNCTION get_user_summary()
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user_id BIGINT := current_sre_user_id();
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'profile', (SELECT row_to_json(p) FROM sre_user_view p
                 WHERE p.user_id = v_user_id),
    'active_season', get_active_season_info(),
    'season_pass', (
      SELECT row_to_json(s) FROM user_season_pass s
       WHERE s.user_id = v_user_id
       AND s.season_code = (SELECT season_code FROM season
                            WHERE status = 'ACTIVE' LIMIT 1)
    ),
    'today_missions_count', (
      SELECT COUNT(*) FROM user_mission_progress p
       JOIN mission_definition m USING (mission_id)
       WHERE p.user_id = v_user_id
       AND m.window_type = 'calendar_day'
       AND p.status = 'COMPLETED'
       AND DATE(p.completed_at) = CURRENT_DATE
    ),
    'lifetime_km', (
      SELECT COALESCE(SUM(distance_km), 0)
       FROM riding_session
       WHERE user_id = v_user_id AND status = 'COMPLETED'
    )
  ) INTO v_result;

  RETURN v_result;
END $$;
```

---

## 3. RIDING 도메인 (5 엔드포인트) — Hono 사이드카

라이딩은 GPS 스트림 + 실시간 거리 계산 때문에 PostgREST가 아닌 Hono로 처리.

### 3.1 `POST /v1/ride/start` — 라이딩 시작
```typescript
// 요청
{
  mission_id: 142,        // 시작할 미션
  initial_position: { lat: 10.776, lng: 106.700, accuracy: 10 }
}

// 응답
{
  ride_id: 88421,
  started_at: "2026-05-18T15:30:00Z",
  mission: {
    code: "S-TET-04",
    name: "Bến Thành Midnight Loop",
    target_value: 8.0,
    target_unit: "km"
  }
}

// 서버 처리
1. user_id 토큰에서 추출
2. mission_id 유효성 + 진행중 미션 확인
3. riding_session 테이블에 INSERT
4. ride_id 반환
```

### 3.2 `PATCH /v1/ride/:rideId/progress` — GPS 좌표 스트림 (매 5초)
```typescript
// 요청
{
  positions: [                            // 배치로 5개씩
    { lat: 10.7765, lng: 106.7012, t: "2026-05-18T15:30:05Z", speed_kmh: 32 },
    { lat: 10.7770, lng: 106.7015, t: "2026-05-18T15:30:10Z", speed_kmh: 35 },
    ...
  ]
}

// 응답
{
  current_distance_km: 1.24,
  current_progress_pct: 15.5,
  avg_speed_kmh: 33.2,
  safety_score: "A",            // GPS 변동/속도 기반 anti-abuse 점수
  current_value: 1.24,           // mission progress용
}

// 서버 처리
1. GPS 좌표 anti-abuse 검사 (속도 비현실적 / 텔레포트)
2. 누적 거리 계산 (Haversine)
3. riding_session.distance_km 업데이트
4. user_mission_progress.current_value 업데이트
5. 진행률 응답
```

### 3.3 `POST /v1/ride/:rideId/complete` — 라이딩 종료
```typescript
// 요청
{
  end_position: { lat: 10.780, lng: 106.703 },
  photo_url: "https://cdn.../.../selfie.jpg"  // 옵션
}

// 응답
{
  ride: {
    ride_id: 88421,
    total_distance_km: 8.2,
    duration_seconds: 1694,    // 28:14
    avg_speed_kmh: 32,
    safety_score: "A",
    completed_at: "...",
  },
  mission_result: {
    progress_id: 9001,
    status: "COMPLETED",       // or "FAILED"
    target_value: 8.0,
    current_value: 8.2,
  },
  reward_dispatch: {
    // dispatch_mission_reward() 결과 그대로
    gp: 3000, gc: 40, sxp: 350,
    items: [
      { item_code: "HELMET_TET_FESTIVAL_L_01", status: "GRANTED" }
    ],
    boxes: []
  }
}

// 서버 처리
1. riding_session.status = 'COMPLETED', 종료 시각 기록
2. 미션 달성 여부 판단 (current_value >= target_value?)
3. mission_progress.status 업데이트
4. SELECT dispatch_mission_reward(progress_id) 호출
5. 결과 합쳐서 응답
```

### 3.4 `POST /v1/ride/:rideId/cancel` — 라이딩 포기
```typescript
// 요청: 본문 없음
// 응답: { ride_id, cancelled_at }
// 미션은 IN_PROGRESS 상태 유지 (다시 도전 가능)
```

### 3.5 `GET /rest/v1/riding_session?order=started_at.desc&limit=20` — 라이딩 기록
```typescript
const { data } = await supabase
  .from('riding_session')
  .select(`
    ride_id, started_at, completed_at,
    distance_km, duration_seconds, safety_score,
    mission:mission_definition(mission_code, name)
  `)
  .order('started_at', { ascending: false })
  .limit(20);
```

---

## 4. MISSION 도메인 (5 엔드포인트)

### 4.1 `POST /rest/v1/rpc/list_active_missions` — 활성 미션 목록
```sql
CREATE OR REPLACE FUNCTION list_active_missions(
  p_window_type VARCHAR DEFAULT NULL,
  p_category VARCHAR DEFAULT NULL,
  p_min_level INT DEFAULT NULL
) RETURNS SETOF JSONB LANGUAGE plpgsql AS $$
DECLARE v_user_id BIGINT := current_sre_user_id();
BEGIN
  RETURN QUERY
  SELECT to_jsonb(m) || jsonb_build_object(
    'my_progress', (
      SELECT row_to_json(p) FROM user_mission_progress p
       WHERE p.user_id = v_user_id AND p.mission_id = m.mission_id
       ORDER BY p.created_at DESC LIMIT 1
    )
  )
  FROM mission_definition m
  WHERE m.is_active = TRUE
    AND (p_window_type IS NULL OR m.window_type = p_window_type::window_type_enum)
    AND (p_category IS NULL OR m.category = p_category::mission_category_enum)
    AND (p_min_level IS NULL OR m.required_level <= p_min_level)
  ORDER BY m.priority DESC;
END $$;
```

```typescript
const { data } = await supabase.rpc('list_active_missions', {
  p_window_type: 'calendar_day',  // 또는 null
  p_category: null,
});
```

### 4.2 `GET /rest/v1/user_mission_progress?status=eq.IN_PROGRESS` — 진행중 미션
```typescript
const { data } = await supabase
  .from('user_mission_progress')
  .select(`
    progress_id, current_value, target_value, status, started_at,
    mission:mission_definition(*)
  `)
  .eq('status', 'IN_PROGRESS');
```

### 4.3 `POST /rest/v1/rpc/start_mission` — 미션 시작
```sql
CREATE OR REPLACE FUNCTION start_mission(p_mission_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user_id BIGINT := current_sre_user_id();
  v_progress_id BIGINT;
  v_target_value NUMERIC;
BEGIN
  SELECT target_value INTO v_target_value
    FROM mission_definition WHERE mission_id = p_mission_id;

  INSERT INTO user_mission_progress (
    user_id, mission_id, current_value, target_value, status, started_at
  ) VALUES (
    v_user_id, p_mission_id, 0, v_target_value, 'IN_PROGRESS', NOW()
  ) RETURNING progress_id INTO v_progress_id;

  RETURN jsonb_build_object('progress_id', v_progress_id);
END $$;
```

### 4.4 `POST /rest/v1/rpc/claim_mission_reward` — dispatch_mission_reward 래퍼
```sql
-- 기존 dispatch_mission_reward를 그대로 사용
-- progress_id만 받아서 호출
CREATE OR REPLACE FUNCTION claim_mission_reward(p_progress_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_user_id BIGINT := current_sre_user_id();
BEGIN
  -- 본인 progress인지 검증
  IF NOT EXISTS (
    SELECT 1 FROM user_mission_progress
     WHERE progress_id = p_progress_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'progress not owned by current user';
  END IF;

  RETURN dispatch_mission_reward(p_progress_id);
END $$;
```

### 4.5 `GET /rest/v1/user_mission_progress?order=completed_at.desc` — 미션 기록
```typescript
const { data } = await supabase
  .from('user_mission_progress')
  .select('*, mission:mission_definition(*)')
  .order('completed_at', { ascending: false, nullsFirst: false })
  .limit(50);
```

---

## 5. ITEM / INVENTORY 도메인 (6 엔드포인트)

### 5.1 `GET /rest/v1/user_inventory_view` — 인벤토리 (도감 형태)
```sql
CREATE VIEW user_inventory_view AS
SELECT
  ui.user_item_id, ui.acquired_at,
  d.item_code, d.item_name, d.slot, d.rarity, d.collection_code,
  c.display_name AS collection_name,
  d.shop_price_gp, d.shop_price_gc,
  d.is_shop_visible, d.season_lock, d.required_season_code,
  ue.user_item_id IS NOT NULL AS is_equipped,
  ue.slot AS equipped_slot
FROM user_item ui
JOIN item_definition d USING (item_code)
JOIN item_collection c USING (collection_code)
LEFT JOIN user_equipment ue ON ue.user_item_id = ui.user_item_id;
```

```typescript
const { data } = await supabase
  .from('user_inventory_view')
  .select('*')
  .order('acquired_at', { ascending: false });
```

### 5.2 `POST /rest/v1/rpc/equip_item` — 아이템 장착
```sql
CREATE OR REPLACE FUNCTION equip_item(p_user_item_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user_id BIGINT := current_sre_user_id();
  v_slot equipment_slot_enum;
  v_item_code VARCHAR;
BEGIN
  SELECT d.slot, ui.item_code INTO v_slot, v_item_code
    FROM user_item ui
    JOIN item_definition d USING (item_code)
   WHERE ui.user_item_id = p_user_item_id
     AND ui.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_item not owned: %', p_user_item_id;
  END IF;

  -- 같은 슬롯 기존 장착 해제 (UPSERT)
  INSERT INTO user_equipment (user_id, slot, user_item_id, equipped_at)
  VALUES (v_user_id, v_slot, p_user_item_id, NOW())
  ON CONFLICT (user_id, slot)
  DO UPDATE SET user_item_id = EXCLUDED.user_item_id,
                equipped_at = NOW();

  RETURN jsonb_build_object('slot', v_slot, 'item_code', v_item_code);
END $$;
```

### 5.3 `POST /rest/v1/rpc/unequip_item` — 장착 해제
```sql
CREATE OR REPLACE FUNCTION unequip_slot(p_slot VARCHAR)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_user_id BIGINT := current_sre_user_id();
BEGIN
  DELETE FROM user_equipment
   WHERE user_id = v_user_id AND slot = p_slot::equipment_slot_enum;

  RETURN jsonb_build_object('slot', p_slot);
END $$;
```

### 5.4 `GET /rest/v1/user_equipment_view` — 현재 장착 (게러지/아바타용)
```sql
CREATE VIEW user_equipment_view AS
SELECT
  ue.user_id, ue.slot, ue.equipped_at,
  ui.user_item_id, ui.item_code,
  d.item_name, d.rarity, d.collection_code
FROM user_equipment ue
JOIN user_item ui USING (user_item_id)
JOIN item_definition d ON d.item_code = ui.item_code;
```

### 5.5 `GET /rest/v1/item_collection_progress_view` — 컬렉션 완성도
```sql
CREATE VIEW item_collection_progress_view AS
SELECT
  c.collection_code, c.display_name,
  COUNT(DISTINCT d.item_code) AS total_items,
  COUNT(DISTINCT ui.user_item_id) FILTER (
    WHERE ui.user_id = current_sre_user_id()
  ) AS owned_items,
  ROUND(100.0 * COUNT(DISTINCT ui.user_item_id) FILTER (
    WHERE ui.user_id = current_sre_user_id()
  ) / NULLIF(COUNT(DISTINCT d.item_code), 0), 1) AS progress_pct
FROM item_collection c
LEFT JOIN item_definition d USING (collection_code)
LEFT JOIN user_item ui ON ui.item_code = d.item_code
GROUP BY c.collection_code, c.display_name;
```

### 5.6 `GET /rest/v1/item_definition?item_code=eq.{code}` — 아이템 상세
```typescript
const { data } = await supabase
  .from('item_definition')
  .select(`*, collection:item_collection(*)`)
  .eq('item_code', 'HELMET_NEON_SAIGON_R_03')
  .single();
```

---

## 6. SHOP 도메인 (3 엔드포인트)

### 6.1 `GET /rest/v1/shop_catalog_view` — 상점 카탈로그
```sql
CREATE VIEW shop_catalog_view AS
SELECT
  d.*,
  c.display_name AS collection_name,
  -- 일일 추천 할인 정보
  f.discount_pct AS featured_discount_pct,
  f.featured_date,
  CASE WHEN f.discount_pct IS NOT NULL
       THEN d.shop_price_gp - (d.shop_price_gp * f.discount_pct / 100)
       ELSE d.shop_price_gp
  END AS final_price_gp,
  CASE WHEN f.discount_pct IS NOT NULL
       THEN d.shop_price_gc - (d.shop_price_gc * f.discount_pct / 100)
       ELSE d.shop_price_gc
  END AS final_price_gc,
  -- 본인 보유 여부
  EXISTS (
    SELECT 1 FROM user_item ui
     WHERE ui.user_id = current_sre_user_id()
       AND ui.item_code = d.item_code
  ) AS is_owned
FROM item_definition d
JOIN item_collection c USING (collection_code)
LEFT JOIN daily_featured_item f
       ON f.item_code = d.item_code
      AND f.featured_date = CURRENT_DATE
WHERE d.is_shop_visible = TRUE;
```

```typescript
// 카테고리 필터링
const { data } = await supabase
  .from('shop_catalog_view')
  .select('*')
  .eq('slot', 'HELMET')
  .order('rarity', { ascending: false });
```

### 6.2 `GET /rest/v1/daily_featured_item?featured_date=eq.{today}` — 오늘의 추천
```typescript
const today = new Date().toISOString().slice(0, 10);
const { data } = await supabase
  .from('shop_catalog_view')
  .select('*')
  .eq('featured_date', today)
  .order('sort_order');
```

### 6.3 `POST /rest/v1/rpc/purchase_shop_item` — 구매 (기존 함수 그대로)
```typescript
const { data, error } = await supabase.rpc('purchase_shop_item', {
  p_user_id: myUserId,            // 또는 함수 내부에서 current_sre_user_id()
  p_item_code: 'HELMET_NEON_SAIGON_R_03',
  p_currency: 'GP',
});

// 응답
type PurchaseResult = {
  item_code: string;
  cost_currency: 'GP' | 'GC';
  base_price: number;
  discount_pct: number;
  cost_amount: number;
  was_featured: boolean;
  user_item_id: number;
  spend_tx_id: number;
  purchase_log_id: number;
};

// 에러 케이스:
// - 'item already owned' → ALREADY_OWNED
// - 'insufficient GP balance' → INSUFFICIENT_BALANCE
// - 'item not available in shop' → ITEM_HIDDEN
// - 'item requires active season' → SEASON_MISMATCH
```

---

## 7. GACHA 도메인 (5 엔드포인트)

### 7.1 `GET /rest/v1/gacha_definition_view` — 가챠 목록 (천장 포함)
```sql
CREATE VIEW gacha_definition_view AS
SELECT
  g.*,
  c.display_name AS collection_name,
  -- 본인 천장 정보
  p.pity_count AS my_pity_count,
  p.total_pulls AS my_total_pulls,
  CASE WHEN g.pity_threshold IS NOT NULL
       THEN g.pity_threshold - COALESCE(p.pity_count, 0)
       ELSE NULL
  END AS pulls_until_pity
FROM gacha_definition g
LEFT JOIN item_collection c ON c.collection_code = g.collection_filter
LEFT JOIN user_gacha_pity p
       ON p.gacha_code = g.gacha_code
      AND p.user_id = current_sre_user_id()
WHERE g.status = 'ACTIVE' AND g.is_listed = TRUE
ORDER BY g.sort_order;
```

### 7.2 `GET /rest/v1/user_gacha_pity?gacha_code=eq.{code}` — 내 천장 상세
```typescript
const { data } = await supabase
  .from('user_gacha_pity')
  .select('*')
  .eq('gacha_code', 'PREMIUM_PULL')
  .single();
```

### 7.3 `POST /rest/v1/rpc/pull_gacha` — 가챠 뽑기 (기존 함수)
```typescript
const { data, error } = await supabase.rpc('pull_gacha', {
  p_user_id: myUserId,
  p_gacha_code: 'PREMIUM_PULL',
  p_do_10_pull: true,
});

// 응답 (TypeScript 타입)
type GachaResult = {
  gacha_code: string;
  is_10_pull: boolean;
  batch_id: number;
  cost_currency: 'GP' | 'GC';
  cost_amount: number;
  spend_tx_id: number;
  results: Array<{
    pull_index: number;
    rarity: 'C' | 'R' | 'E' | 'L' | 'M';
    item_code: string;
    was_pity_hit: boolean;
    was_guarantee: boolean;
    grant_status: 'GRANTED' | 'REFUND_GP' | 'REFUND_GC';
    refund_currency?: 'GP' | 'GC';
    refund_amount?: number;
  }>;
  pity_count_after: number;
  total_pulls_after: number;
};

// 에러 케이스:
// - 'insufficient GP balance' → INSUFFICIENT_BALANCE
// - 'gacha not active' → GACHA_INACTIVE
// - 'gacha period ended' → GACHA_ENDED
// - 'gacha requires active season' → SEASON_MISMATCH
```

### 7.4 `GET /rest/v1/gacha_pull_log?order=pulled_at.desc&limit=50` — 가챠 이력
```typescript
const { data } = await supabase
  .from('gacha_pull_log')
  .select('*, item:item_definition(item_name, slot)')
  .order('pulled_at', { ascending: false })
  .limit(50);
```

### 7.5 `POST /rest/v1/rpc/check_gacha_eligibility` — 뽑기 가능 여부 사전 체크
```sql
CREATE OR REPLACE FUNCTION check_gacha_eligibility(
  p_gacha_code VARCHAR, p_do_10_pull BOOLEAN
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user_id BIGINT := current_sre_user_id();
  v_cost INT;
  v_currency VARCHAR;
  v_balance BIGINT;
BEGIN
  SELECT
    CASE WHEN p_do_10_pull THEN cost_per_10_pull ELSE cost_per_pull END,
    cost_currency
    INTO v_cost, v_currency
  FROM gacha_definition WHERE gacha_code = p_gacha_code;

  IF v_currency = 'GP' THEN
    SELECT current_balance INTO v_balance FROM rp_balance WHERE user_id = v_user_id;
  ELSE
    SELECT gc_balance INTO v_balance FROM rp_balance WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'cost', v_cost,
    'currency', v_currency,
    'balance', v_balance,
    'eligible', v_balance >= v_cost,
    'shortage', GREATEST(0, v_cost - v_balance)
  );
END $$;
```

---

## 8. SEASON 도메인 (3 엔드포인트)

### 8.1 `GET /rest/v1/rpc/get_season_pass` — 현재 시즌 패스
```sql
CREATE OR REPLACE FUNCTION get_season_pass()
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user_id BIGINT := current_sre_user_id();
  v_season_code VARCHAR;
  v_result JSONB;
BEGIN
  SELECT season_code INTO v_season_code
    FROM season WHERE status = 'ACTIVE' LIMIT 1;

  IF v_season_code IS NULL THEN
    RETURN 'null'::jsonb;
  END IF;

  -- 패스 없으면 자동 생성
  INSERT INTO user_season_pass (user_id, season_code, sxp, level, is_premium)
  VALUES (v_user_id, v_season_code, 0, 0, FALSE)
  ON CONFLICT (user_id, season_code) DO NOTHING;

  SELECT to_jsonb(p) || jsonb_build_object(
    'season', (SELECT to_jsonb(s) FROM season s WHERE s.season_code = v_season_code),
    'sxp_to_next_level', (
      SELECT s.sxp_per_level FROM season s WHERE s.season_code = v_season_code
    ) - (p.sxp % (SELECT sxp_per_level FROM season WHERE season_code = v_season_code))
  ) INTO v_result
  FROM user_season_pass p
  WHERE p.user_id = v_user_id AND p.season_code = v_season_code;

  RETURN v_result;
END $$;
```

### 8.2 `GET /rest/v1/season_level_view` — 시즌 30레벨 보상 트랙
```sql
CREATE VIEW season_level_view AS
SELECT
  sr.season_code, sr.level, sr.track_type, sr.reward_bundle,
  -- 본인 수령 여부
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.claimed_rewards) AS r
     WHERE (r->>'level')::INT = sr.level
       AND r->>'track' = sr.track_type::TEXT
  ) AS is_claimed_by_me,
  -- 잠금 여부
  sr.level > p.level AS is_locked
FROM season_reward sr
LEFT JOIN user_season_pass p
       ON p.season_code = sr.season_code
      AND p.user_id = current_sre_user_id()
ORDER BY sr.level, sr.track_type;
```

### 8.3 `POST /rest/v1/rpc/claim_season_reward` — 시즌 보상 수령
```sql
CREATE OR REPLACE FUNCTION claim_season_reward(
  p_level INT, p_track VARCHAR
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user_id BIGINT := current_sre_user_id();
  v_season_code VARCHAR;
  v_my_level INT;
  v_is_premium BOOLEAN;
  v_bundle JSONB;
  v_result JSONB;
BEGIN
  -- 활성 시즌
  SELECT season_code INTO v_season_code
    FROM season WHERE status = 'ACTIVE' LIMIT 1;

  -- 본인 패스 확인
  SELECT level, is_premium INTO v_my_level, v_is_premium
    FROM user_season_pass
   WHERE user_id = v_user_id AND season_code = v_season_code;

  IF p_level > v_my_level THEN
    RAISE EXCEPTION 'level locked: my %, required %', v_my_level, p_level;
  END IF;

  IF p_track = 'PREMIUM' AND NOT v_is_premium THEN
    RAISE EXCEPTION 'premium pass not owned';
  END IF;

  -- 보상 번들 조회 + 디스패치 (mission reward와 같은 메커니즘)
  SELECT reward_bundle INTO v_bundle
    FROM season_reward
   WHERE season_code = v_season_code
     AND level = p_level
     AND track_type = p_track::season_track_enum;

  -- 보상 지급 (별도 함수)
  v_result := dispatch_reward_bundle(v_user_id, v_bundle,
                'SEASON_REWARD',
                jsonb_build_object('level', p_level, 'track', p_track));

  -- claimed_rewards에 기록
  UPDATE user_season_pass
     SET claimed_rewards = claimed_rewards || jsonb_build_object(
           'level', p_level, 'track', p_track, 'claimed_at', NOW()
         )
   WHERE user_id = v_user_id AND season_code = v_season_code;

  RETURN v_result;
END $$;
```

---

## 9. SOCIAL 도메인 (Phase 2+, 참고)

피드/배지/응원/댓글은 MVP 제외. 명세만:

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/rest/v1/feed_view` | GET | 피드 (라이딩 인증) |
| `/rest/v1/rpc/post_feed` | POST | 인증 작성 |
| `/rest/v1/rpc/cheer_feed` | POST | 응원 ❤ |
| `/rest/v1/rpc/comment_feed` | POST | 댓글 |
| `/rest/v1/user_badge_view` | GET | 내 배지 |

---

## 10. REALTIME (Supabase Realtime)

### 10.1 라이딩 진행 (Phase 3+) — 클라이언트끼리 GPS 공유 (친구 라이딩 보기)
```typescript
const channel = supabase.channel(`ride:${rideId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'riding_session',
    filter: `ride_id=eq.${rideId}`,
  }, (payload) => {
    // payload.new.distance_km 업데이트
  })
  .subscribe();
```

### 10.2 푸시 알림 → 가챠 결과 / 미션 완료
- Expo Push 또는 FCM/APNs로 디바이스 토큰 받아서 서버에서 발송

---

## 11. 보조 API (Hono) — 모든 엔드포인트

PostgREST로 못 하는 4가지:

| 엔드포인트 | 설명 |
|---|---|
| `POST /v1/ride/start` | 라이딩 시작 (위 3.1) |
| `PATCH /v1/ride/:id/progress` | GPS 좌표 스트림 (3.2) |
| `POST /v1/ride/:id/complete` | 라이딩 완료 + dispatch (3.3) |
| `POST /v1/ride/:id/cancel` | 취소 (3.4) |
| `POST /v1/upload/photo` | 이미지 업로드 (피드/프로필) |
| `POST /v1/push/register` | 디바이스 토큰 등록 |
| `POST /v1/iap/verify` | Apple/Google 영수증 검증 → GC 적립 |
| `POST /v1/admin/season-end` | 시즌 종료 배치 (expire_season_boxes + reset_season_gacha_pity) |
| `POST /v1/admin/daily-refresh` | 일일 추천 갱신 (refresh_daily_featured) |

Hono 기본 구조:
```typescript
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { createClient } from '@supabase/supabase-js';

const app = new Hono();

// JWT 검증 (Supabase JWT secret과 동일)
app.use('/v1/*', jwt({ secret: process.env.SUPABASE_JWT_SECRET! }));

app.post('/v1/ride/start', async (c) => {
  const { mission_id, initial_position } = await c.req.json();
  const userId = c.get('jwtPayload').sub;
  // ... 로직
  return c.json({ ride_id: 88421, ... });
});

export default app;
```

---

## 12. RLS 정책 모음 (보안 핵심)

```sql
-- 1. sre_user: 본인만
ALTER TABLE sre_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON sre_user
  FOR ALL USING (user_id = current_sre_user_id());

-- 2. rp_balance: 본인만 SELECT, 시스템만 UPDATE
ALTER TABLE rp_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON rp_balance
  FOR SELECT USING (user_id = current_sre_user_id());
CREATE POLICY "update_system" ON rp_balance
  FOR UPDATE USING (FALSE);   -- API 함수 SECURITY DEFINER로만 변경

-- 3. user_item: 본인만 SELECT, 시스템만 INSERT/DELETE
ALTER TABLE user_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON user_item
  FOR SELECT USING (user_id = current_sre_user_id());

-- 4. user_equipment: 본인만 ALL
ALTER TABLE user_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_own" ON user_equipment
  FOR ALL USING (user_id = current_sre_user_id());

-- 5. user_mission_progress: 본인만 SELECT
ALTER TABLE user_mission_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON user_mission_progress
  FOR SELECT USING (user_id = current_sre_user_id());

-- 6. gacha_pull_log, shop_purchase_log: 본인 SELECT
ALTER TABLE gacha_pull_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON gacha_pull_log
  FOR SELECT USING (user_id = current_sre_user_id());

-- 7. user_gacha_pity: 본인 SELECT
ALTER TABLE user_gacha_pity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON user_gacha_pity
  FOR SELECT USING (user_id = current_sre_user_id());

-- 8. user_season_pass: 본인 ALL
ALTER TABLE user_season_pass ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_own" ON user_season_pass
  FOR ALL USING (user_id = current_sre_user_id());

-- 9. 공개 데이터 (mission_definition, item_definition, gacha_definition 등):
--    RLS 비활성 (anon read OK) 또는 SELECT 정책만
```

---

## 13. 클라이언트 호출 (TypeScript) 통합 예시

```typescript
// packages/api/src/index.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/supabase';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

export const honoApi = {
  baseUrl: process.env.EXPO_PUBLIC_API_URL!,
  async fetch(path: string, init?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        ...init?.headers,
      },
    });
  },
};

// 도메인별 함수
export const profileApi = {
  getMe: () => supabase.from('sre_user_view').select('*').single(),
  getSummary: () => supabase.rpc('get_user_summary'),
};

export const missionApi = {
  listActive: (windowType?: string) =>
    supabase.rpc('list_active_missions', { p_window_type: windowType }),
  start: (missionId: number) =>
    supabase.rpc('start_mission', { p_mission_id: missionId }),
  claim: (progressId: number) =>
    supabase.rpc('claim_mission_reward', { p_progress_id: progressId }),
};

export const rideApi = {
  start: (missionId: number, pos: Position) =>
    honoApi.fetch('/v1/ride/start', {
      method: 'POST',
      body: JSON.stringify({ mission_id: missionId, initial_position: pos }),
    }).then(r => r.json()),

  updateProgress: (rideId: number, positions: Position[]) =>
    honoApi.fetch(`/v1/ride/${rideId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ positions }),
    }).then(r => r.json()),

  complete: (rideId: number, endPos: Position, photoUrl?: string) =>
    honoApi.fetch(`/v1/ride/${rideId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ end_position: endPos, photo_url: photoUrl }),
    }).then(r => r.json()),
};

export const shopApi = {
  catalog: (filters: { slot?: string; rarity?: string }) =>
    supabase.from('shop_catalog_view').select('*').match(filters),

  featured: () =>
    supabase.from('shop_catalog_view').select('*')
      .eq('featured_date', new Date().toISOString().slice(0, 10)),

  purchase: (itemCode: string, currency: 'GP' | 'GC') =>
    supabase.rpc('purchase_shop_item', {
      p_item_code: itemCode,
      p_currency: currency,
    }),
};

export const gachaApi = {
  list: () => supabase.from('gacha_definition_view').select('*'),

  checkEligibility: (gachaCode: string, is10Pull: boolean) =>
    supabase.rpc('check_gacha_eligibility', {
      p_gacha_code: gachaCode,
      p_do_10_pull: is10Pull,
    }),

  pull: (gachaCode: string, is10Pull: boolean) =>
    supabase.rpc('pull_gacha', {
      p_gacha_code: gachaCode,
      p_do_10_pull: is10Pull,
    }),

  history: (limit = 50) =>
    supabase.from('gacha_pull_log')
      .select('*, item:item_definition(item_name, slot)')
      .order('pulled_at', { ascending: false })
      .limit(limit),
};

export const inventoryApi = {
  list: () => supabase.from('user_inventory_view').select('*'),
  equip: (userItemId: number) =>
    supabase.rpc('equip_item', { p_user_item_id: userItemId }),
  unequip: (slot: string) =>
    supabase.rpc('unequip_slot', { p_slot: slot }),
  collectionProgress: () =>
    supabase.from('item_collection_progress_view').select('*'),
};
```

---

## 14. 엔드포인트 총 정리표

| # | 도메인 | 메서드 | 경로 | 사용처 |
|---|---|---|---|---|
| 1 | AUTH | POST | `/auth/v1/otp` | AUTH-001 |
| 2 | AUTH | POST | `/auth/v1/verify` | AUTH-002 |
| 3 | AUTH | GET | `/auth/v1/user` | 부팅 |
| 4 | AUTH | POST | `/auth/v1/logout` | 설정 |
| 5 | PROFILE | RPC | `get_user_summary` | HOME-001 |
| 6 | PROFILE | RPC | `get_active_season` | 부팅 |
| 7 | PROFILE | PATCH | `/sre_user` | PROFILE-SETUP |
| 8 | RIDING | POST | `/v1/ride/start` | RIDE-ACTIVE |
| 9 | RIDING | PATCH | `/v1/ride/:id/progress` | RIDE-ACTIVE |
| 10 | RIDING | POST | `/v1/ride/:id/complete` | RIDE-RESULT-S |
| 11 | RIDING | POST | `/v1/ride/:id/cancel` | RIDE-PAUSE |
| 12 | MISSION | RPC | `list_active_missions` | QUEST-LIST |
| 13 | MISSION | RPC | `start_mission` | QUEST-DETAIL |
| 14 | MISSION | RPC | `claim_mission_reward` | (자동, complete 내부) |
| 15 | ITEM | GET | `user_inventory_view` | INVENTORY-001 |
| 16 | ITEM | RPC | `equip_item` | GARAGE/AVATAR |
| 17 | ITEM | RPC | `unequip_slot` | GARAGE/AVATAR |
| 18 | ITEM | GET | `user_equipment_view` | GARAGE/AVATAR |
| 19 | ITEM | GET | `item_collection_progress_view` | INVENTORY |
| 20 | SHOP | GET | `shop_catalog_view` | SHOP-001 |
| 21 | SHOP | GET | `daily_featured_item` | SHOP-001 |
| 22 | SHOP | RPC | `purchase_shop_item` | SHOP-002 |
| 23 | GACHA | GET | `gacha_definition_view` | GACHA-HUB |
| 24 | GACHA | RPC | `check_gacha_eligibility` | GACHA-HUB (사전체크) |
| 25 | GACHA | RPC | `pull_gacha` | GACHA-PULL-RESULT |
| 26 | GACHA | GET | `gacha_pull_log` | (이력) |
| 27 | SEASON | RPC | `get_season_pass` | SEASON-PASS |
| 28 | SEASON | GET | `season_level_view` | SEASON-PASS |
| 29 | SEASON | RPC | `claim_season_reward` | SEASON-PASS |
| 30 | UPLOAD | POST | `/v1/upload/photo` | FEED, PROFILE |
| 31 | PUSH | POST | `/v1/push/register` | 부팅 |
| 32 | ADMIN | POST | `/v1/iap/verify` | (GC 충전) |
| 33 | ADMIN | POST | `/v1/admin/season-end` | (운영 배치) |
| 34 | ADMIN | POST | `/v1/admin/daily-refresh` | (운영 배치) |

**MVP 12화면에서 사용할 엔드포인트: 1~26번** (29개 중 4개 빼고 다)

---

(끝)

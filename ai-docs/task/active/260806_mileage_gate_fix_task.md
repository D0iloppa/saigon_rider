# 마일리지 거리 게이트 결함 수정 — 작업지시서

> 작성: 2026-08-06 · **다른 스레드에서 단독 실행 가능하도록 자기완결로 작성됨**
> 발견 경로: 대표 지적 2026-08-06 20:36~20:45 — 누적 주행거리 **1,075km** 표시("난 집에만 있어")
> 성격: **머니 경로 결함** (표시 버그가 아님) · 우선순위 **높음**
> 관련: [`context/service-rules.md`](../../context/service-rules.md) · [`TEST/issues.md`](../../TEST/issues.md)

---

## 1. 결함 — 속도 게이트가 공백 길이에 비례해 무력해진다

`engine/app/services/mileage.py::_apply_event_time_policy` (유일한 거리 검증 지점):

```python
def _apply_event_time_policy(distance_m: float, previous_at: datetime | None, measured_at: datetime) -> tuple[bool, float]:
    """역순은 진행도 미반영, 정상 순서는 측정시각 간 속도 범위로 거리 판정."""
    ordered = previous_at is None or measured_at > previous_at
    accepted_distance = distance_m if ordered and distance_m > 0 else 0.0
    if accepted_distance > 0 and previous_at is not None:
        speed_ms = accepted_distance / (measured_at - previous_at).total_seconds()
        if speed_ms < 3 * 1000 / 3600 or speed_ms > 150 * 1000 / 3600:
            accepted_distance = 0.0
    return ordered, accepted_distance
```

`previous_at` 은 **마지막으로 기록된 이벤트 시각**이다 (`process_gps_event` 내부):

```python
previous_at = (await db.execute(
    select(func.max(UserMileageLog.recorded_at)).where(UserMileageLog.device_uuid == device_uuid)
)).scalar_one_or_none()
```

### 1-1. 왜 뚫리나

`@capacitor/geolocation` 의 `watchPosition` 은 **포그라운드 전용**이라 앱이 닫힌 동안 샘플이 없다. 따라서 앱을 닫았다 열면 `Δt = (닫혀 있던 시간)` 이 되고, 그 사이의 좌표 점프가 **한 덩어리 거리**로 들어온다.

게이트는 `3 ≤ 속도 ≤ 150 km/h` 만 본다. 즉 **통과 가능한 최대 거리 = 150km/h × Δt** 로 공백에 정비례한다.

| 공백 Δt | 통과 가능한 최대 거리 |
|---|---|
| 5분 | 12.5 km |
| 1시간 | 150 km |
| **7.2시간** | **1,075 km** ← 관측값 |
| 3일 | 10,800 km |

**하룻밤 앱을 닫아두면 1,000km 점프가 "50km/h 정상 주행"으로 통과한다.**

### 1-2. 대표 지적의 기제 정정

> "앱을 닫고도 알아서 측정하는게 말이되는소리냐"

**현상 판정은 맞고 기제는 다르다.** 닫힌 동안 측정하지 않는다(포그라운드 전용). 닫혀 있던 **구간이 재실행 시 한 번에 계상**되므로 결과적으로 닫고도 측정한 것처럼 보인다. 수정은 "백그라운드 수집 중단"이 아니라 **"공백 구간 미계상"** 이다.

### 1-3. 두 번째 구멍 — 첫 이벤트 무제한

`previous_at is None` 이면 속도 검사를 **아예 건너뛴다**. 신규 기기, 로그 없는 기기, 그리고 **탈퇴 후 부활 계정**의 첫 이벤트는 거리 상한이 없다.

---

## 2. 왜 표시만 빼면 안 되는가 — 머니 경로다

`total_distance_m` 은 표시용 숫자가 아니다.

```
engine/app/services/policy_engine.py:28-29   if metric == "total_distance_m": return user.total_distance_m
engine/app/services/policy_engine.py:99      "total_distance_m": user.total_distance_m
engine/app/services/policy_engine.py:214     is_mileage_policy = policy.repeat_metric == "total_distance_m"
```

**마일리지 정책의 반복 달성 조건이다.** 유령 거리 → 마일리지 정책 반복 달성 → RP(gc) 적립(`alembic 038_action_rp_grant`, `054_mileage_rewards_rp_gold`) → **쿠폰·기프티콘 환금.**

즉 표시를 제거해도 지급 경로는 그대로 남는다. **게이트 수정은 표시 제거 여부와 독립적으로 필수다.**

---

## 3. 수정안

### 3-1. 상수 추가

```python
# 앱이 닫혀 있던 공백은 이동 구간으로 계상할 수 없다(포그라운드 전용 워처).
# 이 값을 넘는 공백 뒤 첫 샘플은 "구간 미상" 으로 보고 거리를 버린다.
MAX_GAP_S = 300                    # 5분

# 단일 이벤트 거리 절대 상한 — MAX_GAP_S × 150km/h.
# previous_at 이 없는 첫 이벤트에도 적용해 상한 없는 경로를 없앤다.
MAX_EVENT_DISTANCE_M = 12_500
```

### 3-2. 함수 수정

```python
def _apply_event_time_policy(distance_m: float, previous_at: datetime | None, measured_at: datetime) -> tuple[bool, float]:
    """역순은 진행도 미반영. 정상 순서는 속도 범위 + 공백 길이 + 절대 상한으로 거리 판정."""
    ordered = previous_at is None or measured_at > previous_at
    accepted_distance = distance_m if ordered and distance_m > 0 else 0.0

    # 절대 상한 — previous_at 유무와 무관하게 적용(첫 이벤트 구멍 차단).
    if accepted_distance > MAX_EVENT_DISTANCE_M:
        accepted_distance = 0.0

    if accepted_distance > 0 and previous_at is not None:
        gap_s = (measured_at - previous_at).total_seconds()
        # 공백이 길면 그 구간의 이동 경로를 알 수 없다 — 거리 미계상.
        # (이 검사가 없으면 통과 가능 거리가 공백에 정비례해 게이트가 무력해진다.)
        if gap_s > MAX_GAP_S:
            accepted_distance = 0.0
        else:
            speed_ms = accepted_distance / gap_s
            if speed_ms < 3 * 1000 / 3600 or speed_ms > 150 * 1000 / 3600:
                accepted_distance = 0.0

    return ordered, accepted_distance
```

### 3-3. 건드리지 말 것 (surgical)

- **`ordered` 의 의미를 바꾸지 않는다.** `ordered` 는 퀘스트 dispatch 를 제어한다(`process_gps_event`). 공백 뒤 이벤트도 시간순으로는 정상이므로 `ordered=True` 를 유지하고, **거리만 0** 으로 만든다. `quest_tracker.py:71-73` 이 `distance_m <= 0` 을 이미 별도 분기로 처리하므로 안전하다.
- 기존 속도 하한(3km/h)·상한(150km/h)은 그대로 둔다. 이번 결함과 무관하다.
- 주변 코드·주석·포맷팅을 정리하지 않는다.

### 3-4. 확인 필요 — 두 번째 증가 경로

`mileage.py` 에 `total_distance_m` 증가 지점이 **2곳**이다:

| 위치 | 경로 | 게이트 통과 여부 |
|---|---|---|
| `:83` | `process_gps_event` → `_apply_event_time_policy` 경유 | ✅ 게이트 적용 |
| `:162` | 별도 함수(docstring `:120` "마일리지 누적. 갱신된 total_distance_m을 반환") | ❓ **미확인 — 게이트를 우회하는지 반드시 확인** |

`:162` 경로가 `_apply_event_time_policy` 를 거치지 않는다면 그 호출부도 함께 막아야 한다. **이 확인 없이 완료 처리하지 말 것.**

---

## 4. 테스트 (수정 전에 먼저 작성 — 재현 확인)

기존 테스트 위치 관례를 따라 `engine/app/tests/` 에 둔다. **Engine 코드는 naive `datetime.now()` 금지 — `datetime.now(timezone.utc)` 로 tz-aware 사용** (CLAUDE.md 제약).

| # | 케이스 | 입력 | 기대 |
|---|---|---|---|
| T-1 | **결함 재현** — 공백 후 대형 점프 | `previous_at = t-8h`, `distance_m = 1_075_000` | `accepted == 0.0` (수정 전엔 1,075,000 통과 → 실패해야 정상) |
| T-2 | 정상 주행 보존 | `previous_at = t-60s`, `distance_m = 500` (30km/h) | `accepted == 500` |
| T-3 | 공백 경계 | `previous_at = t-301s`, `distance_m = 1_000` | `accepted == 0.0` |
| T-4 | 공백 경계 직전 | `previous_at = t-299s`, `distance_m = 1_000` (12km/h) | `accepted == 1_000` |
| T-5 | 절대 상한 | `previous_at = t-290s`, `distance_m = 50_000` | `accepted == 0.0` |
| T-6 | **첫 이벤트 상한** | `previous_at = None`, `distance_m = 1_075_000` | `accepted == 0.0` (수정 전엔 통과) |
| T-7 | 첫 이벤트 정상 | `previous_at = None`, `distance_m = 500` | `accepted == 500` |
| T-8 | 역순 이벤트 — 기존 동작 보존 | `previous_at = t+60s`, `distance_m = 500` | `ordered is False`, `accepted == 0.0` |
| T-9 | 속도 상한 — 기존 동작 보존 | `previous_at = t-10s`, `distance_m = 5_000` (1800km/h) | `accepted == 0.0` |

**T-1 과 T-6 이 수정 전에 실패하는 것을 먼저 확인한 뒤** 수정한다. 그게 이 작업의 완료 판정 기준이다.

---

## 5. 기존 오염 데이터 — 별건이지만 같이 판단 필요

게이트를 고쳐도 **이미 적립된 유령 거리는 남는다.**

1. `SreUser.total_distance_m` — 관측된 1,075km 포함. 정정 필요.
2. `UserMileageLog` — 오염 레코드 식별 가능(같은 device_uuid 의 인접 `recorded_at` 간격이 `MAX_GAP_S` 초과인 행).
3. **이미 지급된 마일리지 보상이 있으면 회수 여부는 정책 결정** — 대표 판단 사항. dev 데이터라면 단순 초기화로 끝난다.

**권고 조회 (읽기 전용, 실행 전 영향 파악용):**
```sql
-- 공백 초과 구간이 계상된 레코드 규모 파악
WITH gaps AS (
  SELECT device_uuid, distance_m, recorded_at,
         recorded_at - LAG(recorded_at) OVER (PARTITION BY device_uuid ORDER BY recorded_at) AS gap
  FROM user_mileage_log
)
SELECT device_uuid, COUNT(*) AS bad_rows, SUM(distance_m)/1000 AS bad_km
FROM gaps WHERE gap > INTERVAL '300 seconds' AND distance_m > 0
GROUP BY device_uuid ORDER BY bad_km DESC;
```

---

## 6. 미결 — 대표 결정 대기

| # | 항목 | 상태 |
|---|---|---|
| M-1 | **누적 주행거리 UI 표시 제거 여부** (`HomePage.tsx:205`·`:373`, `ProfileMain.tsx:235`·`:546`, `api/profile.ts` `lifetime_km`) | 대기. 게이트 수정과 **독립** — 표시를 빼도 §2 머니 경로는 남으므로 게이트는 무조건 고친다. 게임 요소 폐기 방향과는 정합 |
| M-2 | 오염 데이터 정정 범위 · 지급된 보상 회수 여부 | 대기 (§5) |
| M-3 | **탈퇴 후 동일 OAuth 재로그인 시 계정 부활** — `DeviceUserMap`·`UserMileageLog` 가 device_uuid 기준이라 탈퇴 전 거리가 승계된다. 개인정보 처리(탈퇴 시 데이터 파기) 관점 검토 필요 | 별건. [`260802_legal_review_request.md`](../../260802_legal_review_request.md) 에 항목 추가 후보 |

---

## 7. 완료 조건 (checklist)

```
[ ] T-1·T-6 이 수정 전에 실패하는 것을 확인
[ ] MAX_GAP_S / MAX_EVENT_DISTANCE_M 게이트 적용
[ ] T-1 ~ T-9 전부 통과
[ ] mileage.py:162 경로가 게이트를 우회하는지 확인 (§3-4) — 우회 시 함께 차단
[ ] 기존 엔진 테스트 회귀 없음
[ ] TEST/issues.md 에 결함 등재 (발견 경로·기제·수정 커밋)
[ ] context/service-rules.md 에 불변식 추가:
      "GPS 거리 계상은 공백 5분 초과 구간을 버린다 — 포그라운드 전용 워처이므로
       공백 구간의 이동 경로를 알 수 없고, 속도 게이트만으로는 공백 길이에 비례해 뚫린다"
[ ] 코드 수정 후 codebase-memory 재인덱싱 (repo_path: /mnt/c/DEV/saigon_rider, mode: fast)
```

**푸시 전 `/code-review` 를 `high` effort 로 실행한다** — 머니 경로 변경이다 (CLAUDE.md 리뷰 게이트).

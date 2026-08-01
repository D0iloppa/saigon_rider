---
sidebar_position: 4
title: Load Test Plan
---

# 부하테스트 계획

> **목표**: 운영 서버(Xeon ×2 / 64 GB / HDD RAID)에서 동시 10,000명 서비스 가능 여부 검증.
>
> 특히 **HDD + RAID 캐시(2GB) 환경에서 GPS 쓰기 부하의 실제 한계점**을 측정하는 것이 핵심.

---

## 1. 테스트 환경

### 1.1 대상 서버

| 항목 | 사양 |
|---|---|
| CPU | Intel Xeon Silver 4114 × 2 (40 vCPU) |
| RAM | 64 GB |
| Disk | 278.5 GB HDD, RAID 930-8i (2GB write cache) |
| OS | Rocky Linux 9.6 |
| Docker | Docker Compose (전 서비스 동일 서버) |

### 1.2 부하 생성기

부하 생성기는 **대상 서버와 분리된 별도 머신**에서 실행. 같은 서버에서 돌리면 CPU/네트워크를 잡아먹어 결과가 왜곡됨.

| 도구 | 용도 | 설치 |
|---|---|---|
| **k6** | HTTP 부하 생성 | `dnf install k6` 또는 [공식 바이너리](https://k6.io) |
| **pgbench** | PostgreSQL 직접 벤치 | `dnf install postgresql-contrib` |
| **redis-benchmark** | Redis Stream 처리량 | Redis 패키지 포함 |

### 1.3 모니터링

테스트 중 서버에서 병렬로 실행:

```bash
# 터미널 1: 디스크 I/O (HDD 병목 핵심 지표)
iostat -x 2

# 터미널 2: CPU / 메모리
vmstat 2

# 터미널 3: Docker 컨테이너별 자원
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# 터미널 4: PostgreSQL 활성 커넥션
watch -n 2 'docker compose exec database psql -U $DB_USER -d $DB_NAME -c \
  "SELECT state, count(*) FROM pg_stat_activity GROUP BY state"'

# 터미널 5: Redis Stream pending
watch -n 2 'docker compose exec redis redis-cli XINFO GROUPS sre:messages'
```

---

## 2. 테스트 시나리오

### 2.1 T1 — 디스크 I/O 베이스라인

> **목적**: RAID 캐시(2GB)의 실효 IOPS와 포화점 측정. 모든 후속 테스트의 해석 기준.

```bash
# 서버에서 직접 실행
# 순차 쓰기
fio --name=seq-write --rw=write --bs=8k --size=1G --numjobs=1 --runtime=60

# 랜덤 쓰기 (DB 워크로드 시뮬레이션)
fio --name=rand-write --rw=randwrite --bs=8k --size=1G --numjobs=4 --runtime=60

# 혼합 (읽기 70%, 쓰기 30%)
fio --name=mixed --rw=randrw --rwmixread=70 --bs=8k --size=1G --numjobs=4 --runtime=60
```

**측정 항목**: IOPS, avg latency (ms), p99 latency, 캐시 포화까지 소요 시간

| 기대값 | HDD 단독 | RAID 캐시 적용 |
|---|---|---|
| 랜덤 쓰기 IOPS | ~150 | ~1,000-5,000 (캐시 내) |
| avg latency | ~7ms | ~1ms (캐시 히트) |

---

### 2.2 T2 — GPS Flood (핵심 시나리오)

> **목적**: GPS 메시지 처리 파이프라인의 한계점. Worker → DB 쓰기 경로의 실제 처리량.

**k6 스크립트**:

```javascript
// k6/t2-gps-flood.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE_URL || 'http://target-server:18090';
const SERVICE_KEY = __ENV.SERVICE_KEY || 'change_me_engine_service_key';

export const options = {
  scenarios: {
    gps_polling: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '2m', target: 500 },    // 워밍업
        { duration: '3m', target: 1000 },   // 1,000 동시 라이더
        { duration: '3m', target: 2000 },   // 2,000 동시 라이더
        { duration: '3m', target: 3000 },   // 3,000 동시 라이더 (목표)
        { duration: '2m', target: 3000 },   // 유지
        { duration: '1m', target: 0 },      // 쿨다운
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const deviceUuid = uuidv4();

export default function () {
  const lat = 10.7769 + (Math.random() - 0.5) * 0.01;
  const lng = 106.7009 + (Math.random() - 0.5) * 0.01;
  const d = Math.floor(Math.random() * 30);

  const message = JSON.stringify({ x: lng, y: lat, d: d });

  const res = http.get(
    `${BASE}/api/sre/sreMessage?uuid=${deviceUuid}&type=gps&message=${encodeURIComponent(message)}`,
    { headers: { 'X-Service-Key': SERVICE_KEY } }
  );

  check(res, {
    'status 200': (r) => r.status === 200,
    'queued': (r) => r.json('status') === 'queued',
  });

  sleep(3); // 3초 폴링 간격
}
```

**실행**:

```bash
k6 run --env BASE_URL=http://target-server:18090 \
       --env SERVICE_KEY=실제키 \
       k6/t2-gps-flood.js
```

**관찰 포인트**:

| 지표 | 위치 | 정상 | 위험 |
|---|---|---|---|
| `http_req_duration p95` | k6 출력 | < 500ms | > 2s |
| `await` | `iostat -x` | < 20ms | > 100ms |
| Stream pending | `XINFO GROUPS` | < 500 | > 5,000 |
| PG active conns | `pg_stat_activity` | < 100 | > 180 |
| Worker 처리 로그 | `docker logs saigon_worker` | 안정적 | 에러 증가 |

**판정 기준**:
- 3,000 VU에서 P95 < 500ms → **HDD 유지 가능**
- 1,000~2,000 VU에서 이미 지연 → **SSD 필요**

---

### 2.3 T3 — API Mix (일반 사용 시뮬레이션)

> **목적**: GPS 부하가 없는 상태에서 일반 API 응답 성능 측정.

```javascript
// k6/t3-api-mix.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE_URL || 'http://target-server:18090';

export const options = {
  scenarios: {
    api_mix: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '2m', target: 2000 },
        { duration: '3m', target: 5000 },
        { duration: '3m', target: 10000 },
        { duration: '2m', target: 10000 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const ENDPOINTS = [
  '/api/bff/quests/pins',
  '/api/bff/feed?page=1&size=20',
  '/api/bff/profile',
];

export default function () {
  const endpoint = ENDPOINTS[randomIntBetween(0, ENDPOINTS.length - 1)];
  const res = http.get(`${BASE}${endpoint}`);

  check(res, {
    'status ok': (r) => r.status < 400,
  });

  sleep(randomIntBetween(3, 15) / 10); // 0.3~1.5초 간격
}
```

---

### 2.4 T4 — GPS + API 복합 부하

> **목적**: 실제 운영과 유사한 혼합 트래픽에서의 전체 시스템 안정성.

```javascript
// k6/t4-combined.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE_URL || 'http://target-server:18090';
const SERVICE_KEY = __ENV.SERVICE_KEY || 'change_me';

export const options = {
  scenarios: {
    riders: {
      executor: 'constant-vus',
      vus: 3000,
      duration: '10m',
      exec: 'gpsRider',
    },
    browsers: {
      executor: 'constant-vus',
      vus: 7000,
      duration: '10m',
      exec: 'apiBrowse',
    },
  },
  thresholds: {
    'http_req_duration{scenario:riders}': ['p(95)<500'],
    'http_req_duration{scenario:browsers}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const deviceUuid = uuidv4();

export function gpsRider() {
  const message = JSON.stringify({
    x: 106.7 + Math.random() * 0.01,
    y: 10.77 + Math.random() * 0.01,
    d: Math.floor(Math.random() * 30),
  });

  const res = http.get(
    `${BASE}/api/sre/sreMessage?uuid=${deviceUuid}&type=gps&message=${encodeURIComponent(message)}`,
    { headers: { 'X-Service-Key': SERVICE_KEY } }
  );
  check(res, { 'gps ok': (r) => r.status === 200 });
  sleep(3);
}

export function apiBrowse() {
  const endpoints = ['/api/bff/quests/pins', '/api/bff/feed?page=1&size=20'];
  const res = http.get(`${BASE}${endpoints[randomIntBetween(0, 1)]}`);
  check(res, { 'api ok': (r) => r.status < 400 });
  sleep(randomIntBetween(5, 15) / 10);
}
```

---

### 2.5 T5 — PostgreSQL 직접 벤치마크

> **목적**: DB 단독 성능 측정. 다른 서비스 영향 제외.

```bash
# 서버에서 직접 실행
docker compose exec database pgbench -i -s 50 saigon_rider

# 읽기 위주 (기본)
docker compose exec database pgbench -c 50 -j 4 -T 120 saigon_rider

# 쓰기 위주 (GPS 시뮬레이션)
docker compose exec database pgbench -c 50 -j 4 -T 120 -N saigon_rider

# 디스크 I/O 동시 모니터링
iostat -x 2
```

**측정**: TPS, avg latency, 디스크 await

---

## 3. 실행 순서

| 순서 | 시나리오 | 목적 | 소요 |
|---|---|---|---|
| 1 | **T1** 디스크 베이스라인 | RAID 캐시 실효 IOPS 파악 | 15분 |
| 2 | **T5** PG 벤치마크 | DB 단독 한계 (디스크 의존) | 20분 |
| 3 | **T2** GPS Flood | Worker 파이프라인 한계점 | 15분 |
| 4 | **T3** API Mix | 일반 API 응답 성능 | 12분 |
| 5 | **T4** 복합 부하 | 실제 운영 시뮬레이션 | 10분 |
| | **합계** | | **~75분** |

---

## 4. 결과 판정 기준

### 4.1 Pass / Fail 기준

| 지표 | Pass | Fail | 조치 |
|---|---|---|---|
| GPS P95 (3,000 VU) | < 500ms | > 2s | Worker 스케일아웃 또는 SSD |
| API P95 (10,000 VU) | < 500ms | > 2s | BFF worker 증설 |
| 에러율 | < 1% | > 5% | 커넥션 풀 / 타임아웃 조정 |
| 디스크 await | < 20ms | > 100ms | **SSD 추가** |
| PG 커넥션 | < 160 | > 190 | pool 조정 / pgBouncer |
| Worker pending | < 1,000 | > 10,000 | Worker replicas 증설 |
| 메모리 사용률 | < 80% | > 95% | shared_buffers 축소 |

### 4.2 병목 판단 플로우

```
P95 > 500ms ?
  ├── iostat await > 20ms
  │     └─→ 디스크 병목 → SSD 추가 또는 synchronous_commit=off
  ├── PG active conns > 160
  │     └─→ 커넥션 병목 → pool 확장 또는 pgBouncer
  ├── Worker pending > 5,000
  │     └─→ Worker 병목 → replicas 증설
  ├── CPU > 90%
  │     └─→ CPU 병목 → (이 서버에서는 발생 가능성 낮음)
  └── 위 모두 정상인데 느림
        └─→ 네트워크 또는 애플리케이션 로직 프로파일링
```

---

## 5. 테스트 후 산출물

| 산출물 | 설명 |
|---|---|
| **결과 리포트** | 각 시나리오별 P50/P95/P99, TPS, 에러율 |
| **디스크 I/O 로그** | `iostat` 수집 데이터 (await 추이) |
| **병목 분석** | 어디서 먼저 포화되었는지 |
| **설정 변경 권고** | 테스트 결과 기반 PG 튜닝 / Worker 수 / SSD 여부 확정 |
| **server-spec.md 갱신** | 이론치 → 실측치 교체 |

---

*작성: 2026-05-21 — 부하테스트 실행 전*

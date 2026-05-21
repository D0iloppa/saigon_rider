---
sidebar_position: 3
title: Server Spec
---

# 운영 서버 사양 산정

> 동시 사용자 **10,000명** 기준. 부하테스트 전 이론치이며, 테스트 후 갱신 예정.

---

## 1. 운영 서버 현황

| 항목 | 사양 | 판정 |
|---|---|---|
| **OS** | Rocky Linux 9.6 (Blue Onyx) | |
| **CPU** | Intel Xeon Silver 4114 × 2 (20코어 / 40스레드, 2.20 GHz) | 충분 |
| **RAM** | 64 GB (DDR4) | 충분 |
| **Disk** | 278.5 GB HDD — **RAID 930-8i (2GB 쓰기 캐시)** | **주의** |
| **NUMA** | 2 노드 (소켓당 10C/20T) | |
| **용도** | Saigon Rider 전용 | |

### 1.1 CPU / RAM 판정

1만 동접 권장 8 vCPU / 16 GB 대비 **CPU 5배, RAM 4배** 여유. 5만 동접까지 구조적으로 가능한 수준.

### 1.2 디스크 판정

:::warning HDD + RAID 캐시 — 조건부 운영 가능
RAID 930-8i의 **2GB 쓰기 캐시**가 burst 쓰기를 흡수하므로 순수 HDD보다 실효 IOPS가 높음 (추정 ~1,000-2,000 IOPS).
다만 GPS Worker의 **지속적** DB 쓰기 (초당 ~3,000 QPS)에서는 캐시 포화 가능성 있음.

**부하테스트에서 `iostat -x`의 `await` 값을 반드시 측정** — 20ms 이하면 HDD 유지 가능, 초과 시 SSD 추가.
:::

:::tip 용량 주의
278.5 GB는 OS + Docker 이미지 + PG 데이터 + 이미지 저장 모두 포함하면 부족할 수 있음.
PG WAL + 이미지가 증가하면 디스크 추가 필요.
:::

| 디스크 | 랜덤 IOPS | 순차 쓰기 | 비용 (1TB) |
|---|---|---|---|
| SATA HDD (7200rpm) | ~100-200 | ~150 MB/s | ~$40 |
| SATA SSD | ~10,000-30,000 | ~500 MB/s | ~$80 |
| NVMe SSD | ~100,000+ | ~3,000 MB/s | ~$100 |

**권장**: NVMe SSD 500GB~1TB 추가 후 PostgreSQL data directory를 SSD로 이전. 나머지(OS, 이미지, 로그)는 HDD 유지 가능.

---

## 2. 트래픽 추정

### 2.1 사용자 행동 모델

| 행동 | 가정 | 비고 |
|---|---|---|
| 동시 접속 | 10,000명 | DAU ~50,000 기준 피크 동접 |
| 라이딩 중 비율 | 30% (3,000명) | GPS 3초 폴링 |
| 일반 탐색 | 70% (7,000명) | 퀘스트/피드/프로필/상점 |

### 2.2 초당 요청량

| 요청 유형 | 계산 | req/s |
|---|---|---|
| GPS 메시지 | 3,000명 ÷ 3초 | **1,000** |
| 일반 API | 7,000명 ÷ 10초 | **700** |
| 이미지 리사이즈 | 피드 스크롤 | **~200** |
| **합계** | | **~1,900** |

:::info 핵심 부하원
GPS 폴링이 전체 요청의 **52%**. Worker의 DB 쓰기가 전체 부하의 핵심.
:::

---

## 3. 서비스별 자원 배분

### 3.1 서비스별 할당 (40 vCPU / 64 GB 기준)

| 서비스 | CPU 할당 | RAM 할당 | 인스턴스 | 비고 |
|---|---|---|---|---|
| nginx | 2 | 256 MB | 1 | `worker_processes auto` |
| bff | 4 | 1 GB | 1 | Uvicorn 4 worker |
| engine | 2 | 512 MB | 1 | GPS 수신 → Redis 전달 |
| **worker** | **8** | **1 GB** | **4** | 스케일아웃 1순위 |
| redis | 2 | 1 GB | 1 | Stream + 캐시 |
| **database** | **16** | **32 GB** | 1 | shared_buffers 8GB |
| imgproxy | 4 | 1 GB | 1 | `IMGPROXY_CONCURRENCY=8` |
| OS / 여유 | 2 | ~27 GB | - | 파일 캐시로 자동 활용 |

### 3.2 PostgreSQL 튜닝 (64 GB RAM 기준)

RAM이 풍부하므로 **캐시를 최대화**하여 HDD 약점을 보완:

```
# postgresql.conf
shared_buffers = 8GB              # RAM의 ~12% (64GB 기준)
effective_cache_size = 48GB       # OS 파일 캐시 포함
work_mem = 32MB                   # 정렬/해시 작업
maintenance_work_mem = 512MB      # VACUUM, CREATE INDEX
wal_buffers = 64MB                # WAL 쓰기 버퍼

# HDD 최적화
random_page_cost = 4              # HDD는 4 (SSD면 1.1로 변경)
effective_io_concurrency = 2      # HDD (SSD면 200)
checkpoint_completion_target = 0.9
wal_level = minimal               # 복제 미사용 시
max_wal_size = 2GB                # 체크포인트 간격 확대 → WAL 쓰기 분산

max_connections = 200
```

:::tip HDD에서 PG 성능을 최대화하는 핵심
`shared_buffers`를 크게 잡아 **hot data를 메모리에 유지**하고, `max_wal_size`를 늘려 **체크포인트 빈도를 낮춰** 디스크 쓰기를 분산시킵니다. 64GB RAM이면 대부분의 working set이 메모리에 올라갑니다.
:::

### 3.3 DB 커넥션 풀

| 서비스 | pool_size | max_overflow | 합계 |
|---|---|---|---|
| bff | 20 | 30 | 50 |
| engine | 10 | 20 | 30 |
| worker (×4) | 10 × 4 | 10 × 4 | 80 |
| **합계** | | | **160** (PG 200 내) |

### 3.4 nginx

```
worker_processes auto;       # 40 vCPU → 자동 감지
events { worker_connections 4096; }
```

### 3.5 Redis

```
maxmemory 1gb
maxmemory-policy noeviction
```

### 3.6 Worker 스케일

```yaml
worker:
  deploy:
    replicas: 4
    resources:
      limits: { cpus: '2.0', memory: 256M }
```

---

## 4. HDD vs SSD 시나리오 비교

### 시나리오 A: HDD + RAID 캐시 유지 (현재)

| 항목 | 예상 |
|---|---|
| GPS 1,000 msg/s 처리 | RAID 캐시(2GB)가 burst 흡수, **단기간은 가능** |
| API P95 응답시간 | 읽기 < 50ms (캐시 히트), 쓰기 **50ms~500ms** (캐시 상태 의존) |
| 동시 라이더 한계 | ~**2,000~3,000명** (RAID 캐시 + PG shared_buffers 조합) |
| 리스크 | 장시간 피크 시 RAID 캐시 포화 → HDD IOPS로 퇴행 |

**완화 전략** (SSD 없이):
- `synchronous_commit = off` (WAL 동기 쓰기 생략, 장애 시 최대 수백ms 데이터 유실 감수)
- `shared_buffers` 8GB + `max_wal_size` 2GB로 쓰기 분산
- `effective_io_concurrency = 2` (HDD 적합값)
- **부하테스트에서 RAID 캐시 한계점 실측 필수**

### 시나리오 B: NVMe SSD 추가 (권장)

| 항목 | 예상 |
|---|---|
| GPS 1,000 msg/s 처리 | 여유롭게 소화 |
| API P95 응답시간 | 읽기 < 10ms, 쓰기 < 50ms |
| 동시 라이더 한계 | **10,000명+** |
| 비용 | NVMe 1TB ~$100 (1회) |

**구성**: PG data + WAL을 SSD에, 나머지(OS, 이미지, 로그)는 HDD 유지.

```bash
# 예시: NVMe를 /data/pg 에 마운트 후
# docker-compose.yml volumes에서 PG 데이터 경로를 변경
volumes:
  - /data/pg:/var/lib/postgresql/data
```

---

## 5. 스케일 전략

### Phase 1 — 현재 서버 활용 (동시 ~10,000)

```
┌────── Rocky Linux (40 vCPU / 64 GB / HDD+SSD) ──────┐
│  nginx → bff(4w) / engine(2w)                         │
│  worker ×4 ←→ redis(1GB)                              │
│  PostgreSQL (shared_buffers 8GB, data on SSD)         │
│  imgproxy                                              │
└───────────────────────────────────────────────────────┘
```

**SSD 추가만으로 1만 동접 서비스 가능.** CPU/RAM은 이미 충분.

### Phase 2 — DB 분리 (동시 ~30,000)

DB를 별도 서버 또는 Managed Service로 분리.

### Phase 3 — 수평 확장 (동시 ~50,000+)

- App 서버 N대 + Load Balancer
- Redis → Cluster
- DB Read Replica 추가

---

## 6. 부하테스트 계획

### 6.1 시나리오

| # | 시나리오 | 대상 | VU | 목표 |
|---|---|---|---|---|
| 1 | GPS Flood | `/api/sre/sreMessage` | 3,000 (3초 간격) | Worker + DB 쓰기 한계점 |
| 2 | API Mix | BFF 전체 | 10,000 (혼합) | P95 < 500ms |
| 3 | Image Burst | imgproxy | 500 동시 | CPU 포화점 |
| 4 | HDD vs SSD | pgbench | - | IOPS 차이 실측 |

### 6.2 도구

| 도구 | 용도 |
|---|---|
| **k6** | HTTP 부하 생성 (GPS, API mix) |
| **pgbench** | PostgreSQL IOPS 벤치마크 |
| **redis-benchmark** | Stream 처리량 |
| **iostat / iotop** | 디스크 I/O 모니터링 |

### 6.3 측정 기준

| 지표 | 정상 | 경고 | 위험 |
|---|---|---|---|
| API P95 응답시간 | < 200ms | > 500ms | > 2s |
| Worker pending | < 100 | > 1,000 | > 10,000 |
| DB active conns | < 60% | > 80% | > 95% |
| **Disk await (ms)** | **< 5** | **> 20** | **> 100** |
| Redis memory | < 50% | > 70% | > 90% |
| CPU utilization | < 60% | > 80% | > 95% |

---

## 7. 요약

| 자원 | 판정 | 조치 |
|---|---|---|
| CPU (40 vCPU) | 5배 여유 | 불필요 |
| RAM (64 GB) | 4배 여유 → PG 캐시 극대화 활용 | PG shared_buffers 8GB |
| **Disk (HDD)** | **병목** | **NVMe SSD 추가 (PG 전용)** |
| Network | 미확인 | 1Gbps 이상 확인 필요 |

**NVMe SSD 1개 (~$100) 추가가 가장 효과 대비 비용이 높은 조치.**

---

*최종 갱신: 2026-05-21 — 부하테스트 전 이론치*

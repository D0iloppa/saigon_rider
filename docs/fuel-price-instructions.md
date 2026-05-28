# Saigon Rider — 유가 정보 표출 작업 지시서 v1.0

> 발행일: 2026-05-27
> 대상: Claude Code
> 코드베이스: github.com/D0iloppa/saigon_rider
> 범위: 베트남 유가 데이터 파이프라인 + 지도 표출 + 주유소 바텀시트
> 기간: 4-6일 (단일 개발자 풀타임)
> 전제: H 작업 진행 중 (정보 모듈 Phase 3 — 주유소 모듈)
> 디자인 컨벤션: 시안 v2 지도 (`SaigonWardMap.tsx`) 활용

---

## §0. 핵심 원칙 (작업 시작 전 이거 안 지키면 출시 후 신뢰 무너짐)

### 0.1 베트남 유가의 진실

- **정부 조정 주기 불규칙**: 한 달에 4-6번, 시간대도 들쭉날쭉 (15:00 / 22:00 / 23:00 / 23:45 등)
- **브랜드 ≈ 동일가**: Petrolimex / PVOil / Saigon Petro 50-100 VND 차이 미미
- **Vùng 1 / Vùng 2**: 호치민은 **Vùng 1만 신경 쓰면 됨**
- **모터바이크 SKU 99%**: RON 95-III (+ E5 RON 92-II 일부, RON 95-V 소수)
- **디젤 / 케로신 / 마주트는 무시**

### 0.2 절대 규칙

❌ **금지** ❌
- "**실시간가**" 표기 절대 금지 → 첫 한 달 안에 들통남
- "주유소별 가격" 표기 금지 → 데이터 없음
- 갱신 시각 숨기지 마라 → 사용자 신뢰의 핵심

✅ **필수** ✅
- "**오늘의 참고가**" 또는 "**Vùng 1 공식 참고가**" 카피 사용
- **갱신 시각 항상 노출** (예: "16:30 갱신")
- 천 단위 축약 표기 (`21.5k`, `21,560 VND/L`)
- 브랜드별 색 도트 (Petrolimex 파랑/노랑, PVOil 주황)

---

## §1. 파일 위치 (생성/수정될 파일)

```
saigon_rider/
├── backend/
│   ├── scrapers/                                  ⭐ 신규 폴더
│   │   ├── __init__.py
│   │   ├── base_scraper.py                       ⭐ 추상 베이스
│   │   ├── petrolimex_scraper.py                 ⭐ Primary 소스
│   │   ├── pvoil_scraper.py                      ⭐ Secondary 소스
│   │   ├── vnexpress_scraper.py                  ⭐ Cross-check 백업
│   │   └── price_validator.py                    ⭐ 3-way validation
│   ├── routers/
│   │   ├── info_gas.py                           🔧 기존 H 작업물 수정/확장
│   │   └── admin_fuel_price.py                   ⭐ 운영자용 manual approval
│   ├── services/
│   │   ├── fuel_price_service.py                 ⭐ 비즈니스 로직
│   │   └── redis_cache.py                        ⭐ Redis 캐시 헬퍼
│   ├── jobs/                                     ⭐ 신규 폴더 (cron)
│   │   ├── fetch_fuel_prices.py                  ⭐ 메인 cron job
│   │   └── README.md
│   └── migrations/
│       └── 202605xx_fuel_price_v2.sql            ⭐ 신규 스키마
├── frontend/src/
│   ├── components/
│   │   ├── maps/
│   │   │   └── SaigonWardMap.tsx                 🔧 marker type 'gas' 확장
│   │   └── gas/                                  ⭐ 신규 폴더
│   │       ├── GasStationMarker.tsx              ⭐ 브랜드 도트
│   │       ├── GasStationSheet.tsx               ⭐ 바텀시트
│   │       ├── FuelPriceCard.tsx                 ⭐ 가격 카드 (재사용)
│   │       ├── BrandLogo.tsx                     ⭐ 4개 브랜드 SVG 로고
│   │       └── gas-tokens.ts                     ⭐ 브랜드 컬러 토큰
│   ├── pages/info/
│   │   └── InfoGasList.tsx                       🔧 줌아웃/줌인 + 바텀시트 연결
│   └── api/
│       └── info.ts                               🔧 gas API 응답 형식 갱신
└── docs/
    └── fuel-price-instructions.md                 ⭐ 이 문서
```

---

## §2. Phase 0 — 사전 확인 (30분)

### Task 0.1: Redis 설치 확인

```bash
# Redis 클라이언트 설치 확인
redis-cli ping
# 기대값: PONG

# 없으면 설치 (Ubuntu)
sudo apt install redis-server
sudo systemctl start redis
```

`.env`에 추가:
```
REDIS_URL=redis://localhost:6379/0
REDIS_FUEL_PRICE_PREFIX=saigon:fuel:
```

### Task 0.2: Python 의존성 추가

`backend/requirements.txt` 추가:
```
httpx>=0.25
beautifulsoup4>=4.12
lxml>=4.9
redis>=5.0
APScheduler>=3.10        # cron 대용으로 in-process 스케줄러 사용
tenacity>=8.2            # 재시도 라이브러리
```

```bash
cd backend && pip install -r requirements.txt
```

### Task 0.3: 기존 H 작업 진척 확인

H 문서 Phase 3 (주유소 모듈)가 진행됐는지:

```bash
# 기존 gas_station 테이블 존재 확인
psql $DATABASE_URL -c "\dt gas_station"

# 기존 라우터 존재 확인
ls saigon_rider/backend/routers/info_gas.py 2>/dev/null
```

진행 안 됐으면 H 문서의 Phase 3 먼저 끝낸 후 이 작업 진입. 이미 끝났으면 이 문서가 **그 위에 추가 작업**.

---

## §3. Phase 1 — DB 스키마 확장 (2-3시간)

### Task 1.1: 신규 마이그레이션

`backend/migrations/202605xx_fuel_price_v2.sql`:

```sql
-- ═══════════════════════════════════════════════════
-- L1: 정부/브랜드 공식 참고가 (Daily Reference Price)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fuel_price_snapshot (
  snapshot_id     BIGSERIAL PRIMARY KEY,
  effective_date  DATE NOT NULL,
  effective_time  TIMESTAMPTZ NOT NULL,     -- 정부 조정 발효 시각
  region          VARCHAR(10) NOT NULL CHECK (region IN ('VUNG_1', 'VUNG_2')),
  brand           VARCHAR(32) NOT NULL CHECK (brand IN (
    'PETROLIMEX', 'PVOIL', 'SAIGON_PETRO', 'MIPEC', 'COMECO', 'MARKET_AVG'
  )),
  fuel_type       VARCHAR(20) NOT NULL CHECK (fuel_type IN (
    'RON95_III', 'RON95_V', 'E5_RON92_II', 'DO_001S_V', 'DO_005S_II'
  )),
  price_vnd       INT NOT NULL CHECK (price_vnd > 0),
  source          VARCHAR(64) NOT NULL,     -- 'petrolimex.com.vn', 'vnexpress.net', ...
  source_url      TEXT,
  raw_fetched_at  TIMESTAMPTZ NOT NULL,
  validated_by    JSONB,                    -- {"sources":["petrolimex","vnexpress"], "agree":true}
  status          VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','REJECTED')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (effective_date, region, brand, fuel_type, source)
);

-- 활성 가격만 빠른 조회용 partial index
CREATE INDEX idx_fuel_active ON fuel_price_snapshot(brand, fuel_type, effective_date DESC)
  WHERE status = 'ACTIVE';
CREATE INDEX idx_fuel_validated ON fuel_price_snapshot(validated_by, status)
  WHERE status = 'ACTIVE';

-- ═══════════════════════════════════════════════════
-- L2: 주유소 ↔ 브랜드 매핑 (기존 gas_station 확장)
-- ═══════════════════════════════════════════════════
ALTER TABLE gas_station 
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'OSM' 
    CHECK (source_type IN ('OSM', 'GOOGLE', 'PETROLIMEX_OFFICIAL', 'PVOIL_OFFICIAL', 'USER_REPORTED')),
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS is_24h BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brand_normalized VARCHAR(32);

-- 기존 brand 컬럼을 표준화 (PETROLIMEX/PVOIL/SAIGON_PETRO/UNKNOWN)
UPDATE gas_station SET brand_normalized = CASE
  WHEN LOWER(brand) LIKE '%petrolimex%' THEN 'PETROLIMEX'
  WHEN LOWER(brand) LIKE '%pv%oil%' OR LOWER(brand) LIKE '%pvoil%' THEN 'PVOIL'
  WHEN LOWER(brand) LIKE '%saigon petro%' OR LOWER(brand) LIKE '%sài gòn petro%' THEN 'SAIGON_PETRO'
  WHEN LOWER(brand) LIKE '%mipec%' THEN 'MIPEC'
  WHEN LOWER(brand) LIKE '%comeco%' THEN 'COMECO'
  ELSE 'UNKNOWN'
END
WHERE brand_normalized IS NULL;

CREATE INDEX IF NOT EXISTS idx_gas_brand_norm ON gas_station(brand_normalized);

-- ═══════════════════════════════════════════════════
-- L3: 라이더 크라우드소싱 (v1은 스키마만, 로직은 v2)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fuel_price_report (
  report_id       BIGSERIAL PRIMARY KEY,
  station_id      BIGINT REFERENCES gas_station(station_id),
  user_id         BIGINT REFERENCES sre_user(user_id),
  fuel_type       VARCHAR(20) NOT NULL,
  price_vnd       INT NOT NULL,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  deviation_pct   DECIMAL(5, 2),            -- vs reference price
  photo_url       TEXT
);
CREATE INDEX idx_fuel_report_station ON fuel_price_report(station_id, reported_at DESC);
CREATE INDEX idx_fuel_report_user ON fuel_price_report(user_id);

-- ═══════════════════════════════════════════════════
-- 운영자 알림 + 감사
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fuel_price_fetch_log (
  log_id          BIGSERIAL PRIMARY KEY,
  source          VARCHAR(64) NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ,
  status          VARCHAR(20) CHECK (status IN ('SUCCESS','FAILED','PARTIAL')),
  items_found     INT DEFAULT 0,
  items_inserted  INT DEFAULT 0,
  error_message   TEXT,
  raw_response    TEXT                       -- 디버깅용 (응답 처음 2KB만)
);
CREATE INDEX idx_fetch_log_source ON fuel_price_fetch_log(source, scheduled_at DESC);
```

### Task 1.2: 마이그레이션 실행 + 검증

```bash
psql $DATABASE_URL < backend/migrations/202605xx_fuel_price_v2.sql

# 검증
psql $DATABASE_URL -c "\d fuel_price_snapshot"
psql $DATABASE_URL -c "
  SELECT brand_normalized, COUNT(*) 
  FROM gas_station 
  GROUP BY brand_normalized 
  ORDER BY 2 DESC;
"
# 기대값: PETROLIMEX, PVOIL, UNKNOWN 등 분포
```

---

## §4. Phase 2 — 스크래퍼 구현 (1-2일)

### Task 2.1: 베이스 스크래퍼

`backend/scrapers/base_scraper.py`:

```python
"""
Saigon Rider — Fuel Price Scraper Base Class

모든 스크래퍼는 이 추상 클래스를 상속. 공통 retry/timeout/로깅 로직 제공.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
import logging

log = logging.getLogger(__name__)

# 공통 User-Agent (연락처 명시 — 매너)
DEFAULT_UA = "SaigonRider/1.0 (+https://saigonrider.app/contact; fuel-price-bot)"
DEFAULT_TIMEOUT = 15.0
RATE_LIMIT_DELAY = 60.0  # 분당 1회 이상 안 두드림


@dataclass
class FuelPriceRecord:
    """스크래퍼가 반환하는 표준 형식"""
    brand: str                    # 'PETROLIMEX' | 'PVOIL' | ...
    fuel_type: str                # 'RON95_III' | 'E5_RON92_II' | ...
    price_vnd: int
    effective_time: datetime
    region: str = 'VUNG_1'
    source: str = ''
    source_url: Optional[str] = None


class BaseFuelScraper(ABC):
    """모든 스크래퍼의 베이스. 자식은 fetch() 만 구현하면 됨."""
    
    SOURCE_NAME: str = ''        # 자식 클래스가 오버라이드
    SOURCE_URL: str = ''
    
    def __init__(self, timeout: float = DEFAULT_TIMEOUT):
        self.timeout = timeout
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
        reraise=True,
    )
    async def _get(self, url: str) -> str:
        """공통 HTTP GET. 3회 재시도, exponential backoff."""
        async with httpx.AsyncClient(
            headers={"User-Agent": DEFAULT_UA},
            timeout=self.timeout,
            follow_redirects=True,
        ) as client:
            log.info(f"[{self.SOURCE_NAME}] GET {url}")
            response = await client.get(url)
            response.raise_for_status()
            return response.text
    
    @abstractmethod
    async def fetch(self) -> list[FuelPriceRecord]:
        """각 스크래퍼가 구현. 가격 레코드 리스트 반환."""
        pass
    
    def _normalize_fuel_type(self, raw: str) -> Optional[str]:
        """원본 문자열을 표준 fuel_type 코드로 매핑"""
        raw = raw.lower().replace(' ', '').replace('-', '')
        
        # 우선순위 매칭 (RON 95-V > RON 95-III > E5 > DO)
        if 'ron95v' in raw or 'ron95-v' in raw:
            return 'RON95_V'
        if 'ron95iii' in raw or 'ron95-iii' in raw or 'ron95' in raw:
            return 'RON95_III'
        if 'e5ron92' in raw or 'e5' in raw:
            return 'E5_RON92_II'
        if 'do0.001' in raw or 'do0001' in raw:
            return 'DO_001S_V'
        if 'do0.05' in raw or 'do005' in raw:
            return 'DO_005S_II'
        
        return None  # 모터바이크 무관 → 무시
    
    def _parse_price(self, raw: str) -> Optional[int]:
        """문자열을 VND 정수로 변환. '21.560' / '21,560' / '21560 đồng' 모두 처리"""
        if not raw:
            return None
        # 숫자만 추출
        cleaned = ''.join(c for c in raw if c.isdigit())
        if not cleaned:
            return None
        n = int(cleaned)
        # 호치민 휘발유는 15,000 ~ 35,000 VND 범위. 그 외는 의심
        if 15_000 <= n <= 35_000:
            return n
        if 1_500 <= n <= 3_500:    # 천 단위 잘림 (예: "21.5")
            return n * 1000
        log.warning(f"[{self.SOURCE_NAME}] 의심스러운 가격: raw={raw}, parsed={n}")
        return n if n > 0 else None
```

### Task 2.2: Petrolimex 스크래퍼 (Primary)

`backend/scrapers/petrolimex_scraper.py`:

```python
"""
Petrolimex 공식 사이트 스크래퍼.

URL: https://www.petrolimex.com.vn/nd/gia-xang-dau-pet/
페이지 구조: HTML 테이블 (Vùng 1 / Vùng 2 두 컬럼)

⚠️ Petrolimex가 페이지 구조 바꾸면 깨질 수 있음.
   → 매주 자동 검증 로직 + Slack 알림으로 조기 감지.
"""
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup
import re
import logging

from .base_scraper import BaseFuelScraper, FuelPriceRecord

log = logging.getLogger(__name__)


class PetrolimexScraper(BaseFuelScraper):
    SOURCE_NAME = "petrolimex.com.vn"
    SOURCE_URL = "https://www.petrolimex.com.vn/nd/gia-xang-dau-pet/"
    
    async def fetch(self) -> list[FuelPriceRecord]:
        """Petrolimex 페이지에서 Vùng 1 가격 추출."""
        try:
            html = await self._get(self.SOURCE_URL)
        except Exception as e:
            log.error(f"[Petrolimex] fetch failed: {e}")
            raise
        
        soup = BeautifulSoup(html, 'lxml')
        records = []
        
        # 발효 시각 추출 (페이지 상단 "Áp dụng từ XX:XX ngày DD/MM/YYYY")
        effective_time = self._extract_effective_time(soup)
        if not effective_time:
            log.warning("[Petrolimex] effective_time 추출 실패. 현재 시각 사용.")
            effective_time = datetime.utcnow()
        
        # 가격 테이블 추출
        # 페이지에 여러 테이블이 있을 수 있어서, 'Vùng 1' 키워드 근처의 테이블 찾기
        tables = soup.find_all('table')
        for table in tables:
            text = table.get_text().lower()
            if 'vùng' not in text and 'ron' not in text:
                continue
            
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:
                    continue
                
                fuel_label = cells[0].get_text(strip=True)
                fuel_type = self._normalize_fuel_type(fuel_label)
                if not fuel_type:
                    continue
                
                # 두 번째 셀이 Vùng 1 가격
                price_str = cells[1].get_text(strip=True)
                price = self._parse_price(price_str)
                if not price:
                    continue
                
                records.append(FuelPriceRecord(
                    brand='PETROLIMEX',
                    fuel_type=fuel_type,
                    price_vnd=price,
                    effective_time=effective_time,
                    region='VUNG_1',
                    source=self.SOURCE_NAME,
                    source_url=self.SOURCE_URL,
                ))
        
        log.info(f"[Petrolimex] {len(records)} 레코드 수집")
        return records
    
    def _extract_effective_time(self, soup) -> Optional[datetime]:
        """'Áp dụng từ 15:00 ngày 19/03/2026' 패턴 추출"""
        text = soup.get_text()
        # 정규식: 시:분 ngày 일/월/년
        match = re.search(
            r'(?:áp dụng từ|hiệu lực|từ)\s*(\d{1,2}):(\d{2})\s*ngày\s*(\d{1,2})/(\d{1,2})/(\d{4})',
            text,
            re.IGNORECASE,
        )
        if not match:
            return None
        
        h, m, d, mo, y = match.groups()
        try:
            return datetime(int(y), int(mo), int(d), int(h), int(m))
        except ValueError:
            return None
```

### Task 2.3: VNExpress 스크래퍼 (Cross-check)

`backend/scrapers/vnexpress_scraper.py`:

```python
"""
VNExpress 유가 페이지 스크래퍼. Petrolimex 검증용.

URL: https://vnexpress.net/gia-xang-dau

ETag/Last-Modified 헤더 활용해서 변경 감지 후 풀 파싱.
"""
from datetime import datetime
from bs4 import BeautifulSoup
import logging

from .base_scraper import BaseFuelScraper, FuelPriceRecord

log = logging.getLogger(__name__)


class VNExpressScraper(BaseFuelScraper):
    SOURCE_NAME = "vnexpress.net"
    SOURCE_URL = "https://vnexpress.net/gia-xang-dau"
    
    async def fetch(self) -> list[FuelPriceRecord]:
        html = await self._get(self.SOURCE_URL)
        soup = BeautifulSoup(html, 'lxml')
        records = []
        
        # VNExpress는 일반적으로 가격 테이블이 페이지 상단에 있음
        # 클래스명이 자주 바뀌므로 텍스트 기반 휴리스틱 사용
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:
                    continue
                
                fuel_label = cells[0].get_text(strip=True)
                fuel_type = self._normalize_fuel_type(fuel_label)
                if not fuel_type:
                    continue
                
                price = self._parse_price(cells[1].get_text(strip=True))
                if not price:
                    continue
                
                # VNExpress는 보통 시장 평균가 (단일 컬럼)
                records.append(FuelPriceRecord(
                    brand='MARKET_AVG',
                    fuel_type=fuel_type,
                    price_vnd=price,
                    effective_time=datetime.utcnow(),
                    region='VUNG_1',
                    source=self.SOURCE_NAME,
                    source_url=self.SOURCE_URL,
                ))
        
        log.info(f"[VNExpress] {len(records)} 레코드 수집")
        return records
```

### Task 2.4: PVOil 스크래퍼

`backend/scrapers/pvoil_scraper.py`:

```python
"""PVOil 공식 사이트 스크래퍼. 구조는 Petrolimex와 유사."""
from datetime import datetime
from bs4 import BeautifulSoup
import logging

from .base_scraper import BaseFuelScraper, FuelPriceRecord

log = logging.getLogger(__name__)


class PVOilScraper(BaseFuelScraper):
    SOURCE_NAME = "pvoil.com.vn"
    SOURCE_URL = "https://www.pvoil.com.vn/truyen-thong/tin-pvoil/gia-ban-le-xang-dau"
    
    async def fetch(self) -> list[FuelPriceRecord]:
        # Petrolimex 패턴 그대로 (PVOil 사이트 구조 확인 후 fine-tune)
        # 첫 구현은 PetrolimexScraper 카피 후 selector만 조정
        # ... (Task 2.2 패턴 그대로)
        pass
```

⚠️ PVOil 사이트 구조는 발주 시점에 직접 확인해서 fine-tune. Petrolimex 코드 그대로 두고 selector만 조정.

### Task 2.5: 3-way 검증 로직

`backend/scrapers/price_validator.py`:

```python
"""
3-way validation: 2개 이상 소스가 일치하면 신뢰.

매 fetch cycle 끝에 호출.
"""
from collections import defaultdict
from typing import Optional
import logging

from .base_scraper import FuelPriceRecord

log = logging.getLogger(__name__)

TOLERANCE_VND = 200  # 200 VND 이내 차이는 같은 것으로 간주


def validate_prices(
    petrolimex: list[FuelPriceRecord],
    pvoil: list[FuelPriceRecord],
    vnexpress: list[FuelPriceRecord],
) -> dict:
    """
    3-way validation 결과 반환:
    {
        'RON95_III': {
            'price': 21560,
            'sources_agree': ['petrolimex', 'vnexpress'],
            'sources_disagree': [],
            'trusted': True
        },
        ...
    }
    """
    # fuel_type별로 묶음
    grouped: dict[str, dict[str, Optional[FuelPriceRecord]]] = defaultdict(dict)
    
    for r in petrolimex:
        grouped[r.fuel_type]['petrolimex'] = r
    for r in pvoil:
        grouped[r.fuel_type]['pvoil'] = r
    for r in vnexpress:
        grouped[r.fuel_type]['vnexpress'] = r
    
    results = {}
    for fuel_type, sources in grouped.items():
        prices = {name: rec.price_vnd for name, rec in sources.items() if rec}
        if not prices:
            continue
        
        # 가격 일치 검사 (200 VND 이내)
        median = sorted(prices.values())[len(prices) // 2]
        agree = [name for name, p in prices.items() if abs(p - median) <= TOLERANCE_VND]
        disagree = [name for name, p in prices.items() if abs(p - median) > TOLERANCE_VND]
        
        trusted = len(agree) >= 2
        
        results[fuel_type] = {
            'price': median,
            'sources_agree': agree,
            'sources_disagree': disagree,
            'trusted': trusted,
            'all_prices': prices,
        }
        
        if disagree:
            log.warning(
                f"[{fuel_type}] 소스 불일치: {disagree} (median {median}, prices {prices})"
            )
    
    return results
```

---

## §5. Phase 3 — 비즈니스 로직 + 캐시 (4-6시간)

### Task 3.1: Redis 캐시 헬퍼

`backend/services/redis_cache.py`:

```python
"""Redis 캐시 헬퍼. 유가 데이터는 hot path라서 캐시 필수."""
import os
import json
from typing import Any, Optional
from datetime import timedelta
import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
PREFIX = os.getenv("REDIS_FUEL_PRICE_PREFIX", "saigon:fuel:")

_client: Optional[redis.Redis] = None


async def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


async def cache_get(key: str) -> Optional[Any]:
    client = await get_client()
    raw = await client.get(PREFIX + key)
    return json.loads(raw) if raw else None


async def cache_set(key: str, value: Any, ttl: int = 3600) -> None:
    client = await get_client()
    await client.set(PREFIX + key, json.dumps(value), ex=ttl)


async def cache_invalidate(pattern: str = "*") -> int:
    """패턴으로 캐시 무효화 (가격 갱신 시 호출)."""
    client = await get_client()
    keys = []
    async for key in client.scan_iter(match=PREFIX + pattern):
        keys.append(key)
    if keys:
        return await client.delete(*keys)
    return 0


# 캐시 키 패턴
class CacheKeys:
    TODAY_PRICES = "today:prices"                          # 오늘의 전체 참고가
    BRAND_PRICE = "brand:{brand}:{fuel_type}"             # 브랜드별
    STATION_PRICE = "station:{station_id}"                # 주유소별 (브랜드 join)
    STATIONS_NEARBY = "nearby:{lat}:{lng}:{radius}"       # 근처 주유소 리스트
```

### Task 3.2: 비즈니스 서비스

`backend/services/fuel_price_service.py`:

```python
"""유가 비즈니스 로직."""
from datetime import datetime
from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .redis_cache import cache_get, cache_set, CacheKeys

CACHE_TTL = 3600  # 1시간


async def get_today_reference_prices(session: AsyncSession) -> dict:
    """
    오늘의 브랜드×연료별 참고가.
    
    Returns:
        {
            "PETROLIMEX": {
                "RON95_III": {"price": 21560, "updated_at": "..."},
                "E5_RON92_II": {"price": 20890, "updated_at": "..."}
            },
            "PVOIL": {...},
            "MARKET_AVG": {...},
            "updated_at": "16:30",   # 마지막 갱신 시각 (사용자 노출용)
        }
    """
    # 캐시 hit
    cached = await cache_get(CacheKeys.TODAY_PRICES)
    if cached:
        return cached
    
    # DB에서 활성 가격 조회
    result = await session.execute(text("""
        SELECT brand, fuel_type, price_vnd, effective_time, raw_fetched_at
        FROM fuel_price_snapshot
        WHERE status = 'ACTIVE'
          AND region = 'VUNG_1'
          AND effective_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY brand, fuel_type, effective_time DESC
    """))
    
    output = {}
    latest_update = None
    
    for row in result:
        brand = row.brand
        if brand not in output:
            output[brand] = {}
        
        # 가장 최근 가격만 (이미 정렬돼 있음)
        if row.fuel_type not in output[brand]:
            output[brand][row.fuel_type] = {
                "price": row.price_vnd,
                "effective_time": row.effective_time.isoformat(),
            }
        
        if not latest_update or row.raw_fetched_at > latest_update:
            latest_update = row.raw_fetched_at
    
    # 사용자 노출용 갱신 시각
    output['updated_at'] = latest_update.strftime("%H:%M") if latest_update else None
    output['updated_at_iso'] = latest_update.isoformat() if latest_update else None
    
    # 캐시
    await cache_set(CacheKeys.TODAY_PRICES, output, ttl=CACHE_TTL)
    
    return output


async def get_station_with_price(
    session: AsyncSession, station_id: int
) -> Optional[dict]:
    """
    주유소 정보 + 브랜드별 가격.
    
    Returns:
        {
            "station_id": 123,
            "name": "Petrolimex Quận 1",
            "brand_normalized": "PETROLIMEX",
            "lat": ..., "lng": ...,
            "is_24h": True,
            "reference_price": {
                "RON95_III": 21560,
                "E5_RON92_II": 20890,
                "source": "PETROLIMEX 공식",
                "updated_at": "16:30"
            },
            "crowd_price": null   # v1은 항상 null
        }
    """
    # 캐시
    cached = await cache_get(CacheKeys.STATION_PRICE.format(station_id=station_id))
    if cached:
        return cached
    
    # 1) 주유소 메타
    station = await session.execute(text("""
        SELECT station_id, name, brand_normalized, lat, lng, is_24h, ward_code
        FROM gas_station
        WHERE station_id = :id AND status = 'ACTIVE'
    """), {"id": station_id})
    s = station.first()
    if not s:
        return None
    
    # 2) 해당 브랜드의 오늘 가격
    brand_to_query = s.brand_normalized if s.brand_normalized != 'UNKNOWN' else 'MARKET_AVG'
    
    prices = await session.execute(text("""
        SELECT fuel_type, price_vnd, raw_fetched_at
        FROM fuel_price_snapshot
        WHERE brand = :brand
          AND status = 'ACTIVE'
          AND region = 'VUNG_1'
          AND effective_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY fuel_type, effective_time DESC
    """), {"brand": brand_to_query})
    
    fuel_prices = {}
    last_update = None
    for r in prices:
        if r.fuel_type not in fuel_prices:
            fuel_prices[r.fuel_type] = r.price_vnd
            if not last_update or r.raw_fetched_at > last_update:
                last_update = r.raw_fetched_at
    
    source_label = '시장 평균' if brand_to_query == 'MARKET_AVG' else f'{brand_to_query} 공식'
    
    result = {
        "station_id": s.station_id,
        "name": s.name,
        "brand_normalized": s.brand_normalized,
        "lat": float(s.lat),
        "lng": float(s.lng),
        "is_24h": s.is_24h,
        "reference_price": {
            **fuel_prices,
            "source": source_label,
            "updated_at": last_update.strftime("%H:%M") if last_update else None,
            "updated_at_iso": last_update.isoformat() if last_update else None,
        },
        "crowd_price": None,  # v2
    }
    
    await cache_set(CacheKeys.STATION_PRICE.format(station_id=station_id), result, ttl=CACHE_TTL)
    return result
```

### Task 3.3: API 라우터 (기존 H의 info_gas.py 확장)

`backend/routers/info_gas.py` 추가/수정:

```python
@router.get("/today-prices")
async def get_today_prices(session: AsyncSession = Depends(get_session)):
    """오늘의 브랜드별 참고가. 클라이언트는 이걸로 정보 화면 상단 가격표 그림."""
    return await get_today_reference_prices(session)


@router.get("/stations/nearby")
async def get_nearby_stations(
    lat: float, lng: float, radius_km: float = 3.0,
    session: AsyncSession = Depends(get_session),
):
    """근처 주유소 + 브랜드 + 가격 (시안 v2 지도 표출용)."""
    # 캐시 키
    cache_key = f"nearby:{round(lat,3)}:{round(lng,3)}:{radius_km}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    
    # PostGIS 거리 쿼리
    result = await session.execute(text("""
        SELECT 
            gs.station_id, gs.name, gs.brand_normalized,
            gs.lat, gs.lng, gs.is_24h, gs.ward_code,
            ST_Distance(
                gs.geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 AS distance_km
        FROM gas_station gs
        WHERE gs.status = 'ACTIVE'
          AND ST_DWithin(
            gs.geom,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_m
          )
        ORDER BY distance_km
        LIMIT 50
    """), {"lat": lat, "lng": lng, "radius_m": radius_km * 1000})
    
    stations = [dict(r._mapping) for r in result]
    
    # 오늘 가격 join (브랜드별 1회 조회로 최적화)
    today_prices = await get_today_reference_prices(session)
    
    for s in stations:
        brand = s['brand_normalized'] or 'MARKET_AVG'
        brand_prices = today_prices.get(brand, today_prices.get('MARKET_AVG', {}))
        s['reference_price'] = {
            'RON95_III': brand_prices.get('RON95_III', {}).get('price'),
            'E5_RON92_II': brand_prices.get('E5_RON92_II', {}).get('price'),
            'updated_at': today_prices.get('updated_at'),
            'source': f'{brand} 공식' if brand != 'MARKET_AVG' else '시장 평균',
        }
    
    response = {
        "stations": stations,
        "global_updated_at": today_prices.get('updated_at'),
    }
    
    await cache_set(cache_key, response, ttl=600)  # 10분
    return response


@router.get("/station/{station_id}")
async def get_station_detail(
    station_id: int, session: AsyncSession = Depends(get_session)
):
    """주유소 상세 (바텀시트용)."""
    result = await get_station_with_price(session, station_id)
    if not result:
        raise HTTPException(404, "Station not found")
    return result
```

---

## §6. Phase 4 — Cron Job (3-4시간)

### Task 4.1: 메인 fetch job

`backend/jobs/fetch_fuel_prices.py`:

```python
"""
유가 갱신 cron job.

스케줄: 04:00 / 15:30 / 22:30 / 23:30 ICT
APScheduler in-process 또는 crontab에서 호출.
"""
import asyncio
from datetime import datetime
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from db import get_session
from scrapers.petrolimex_scraper import PetrolimexScraper
from scrapers.pvoil_scraper import PVOilScraper
from scrapers.vnexpress_scraper import VNExpressScraper
from scrapers.price_validator import validate_prices
from services.redis_cache import cache_invalidate

log = logging.getLogger(__name__)


async def run_fetch_cycle() -> dict:
    """한 번의 fetch cycle 실행."""
    start = datetime.utcnow()
    log.info(f"=== Fuel price fetch cycle started at {start.isoformat()} ===")
    
    # 1) 3개 소스 병렬 fetch
    petrolimex_scraper = PetrolimexScraper()
    pvoil_scraper = PVOilScraper()
    vnexpress_scraper = VNExpressScraper()
    
    results = await asyncio.gather(
        _safe_fetch(petrolimex_scraper),
        _safe_fetch(pvoil_scraper),
        _safe_fetch(vnexpress_scraper),
        return_exceptions=False,
    )
    petrolimex_data, pvoil_data, vnexpress_data = results
    
    # 2) 3-way validation
    validation = validate_prices(petrolimex_data, pvoil_data, vnexpress_data)
    
    log.info(f"Validation result: {len(validation)} fuel types")
    
    # 3) DB insert (검증 통과 한정)
    inserted = 0
    async with get_session() as session:
        # 기존 ACTIVE 가격을 SUPERSEDED로
        await session.execute(text("""
            UPDATE fuel_price_snapshot
            SET status = 'SUPERSEDED'
            WHERE status = 'ACTIVE' AND effective_date < CURRENT_DATE
        """))
        
        # 신규 가격 insert
        for record in petrolimex_data + pvoil_data + vnexpress_data:
            v = validation.get(record.fuel_type, {})
            await session.execute(text("""
                INSERT INTO fuel_price_snapshot 
                    (effective_date, effective_time, region, brand, fuel_type, 
                     price_vnd, source, source_url, raw_fetched_at, validated_by, status)
                VALUES 
                    (:date, :time, :region, :brand, :fuel, :price, :source, :url, 
                     NOW(), :validated, :status)
                ON CONFLICT (effective_date, region, brand, fuel_type, source) 
                DO UPDATE SET price_vnd = EXCLUDED.price_vnd, raw_fetched_at = NOW()
            """), {
                "date": record.effective_time.date(),
                "time": record.effective_time,
                "region": record.region,
                "brand": record.brand,
                "fuel": record.fuel_type,
                "price": record.price_vnd,
                "source": record.source,
                "url": record.source_url,
                "validated": json.dumps(v),
                "status": 'ACTIVE' if v.get('trusted') else 'PENDING',
            })
            inserted += 1
        
        # log
        await session.execute(text("""
            INSERT INTO fuel_price_fetch_log 
                (source, scheduled_at, finished_at, status, items_found, items_inserted)
            VALUES ('cycle', :start, NOW(), 'SUCCESS', :found, :inserted)
        """), {
            "start": start,
            "found": len(petrolimex_data) + len(pvoil_data) + len(vnexpress_data),
            "inserted": inserted,
        })
        await session.commit()
    
    # 4) Redis 캐시 무효화
    invalidated = await cache_invalidate("*")
    log.info(f"Cache invalidated: {invalidated} keys")
    
    # 5) 가격 변동 감지 + Slack 알림 (옵션)
    # TODO: 이전 가격과 비교해서 변동 시 알림
    
    return {
        "petrolimex": len(petrolimex_data),
        "pvoil": len(pvoil_data),
        "vnexpress": len(vnexpress_data),
        "inserted": inserted,
        "validated_trusted": sum(1 for v in validation.values() if v.get('trusted')),
    }


async def _safe_fetch(scraper):
    """스크래퍼 하나가 실패해도 나머지는 진행."""
    try:
        return await scraper.fetch()
    except Exception as e:
        log.error(f"[{scraper.SOURCE_NAME}] failed: {e}", exc_info=True)
        return []


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = asyncio.run(run_fetch_cycle())
    print(f"Cycle complete: {result}")
```

### Task 4.2: APScheduler 스케줄링 (또는 crontab)

**옵션 A — In-process (APScheduler)**: `backend/main.py`에 추가:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from jobs.fetch_fuel_prices import run_fetch_cycle

@app.on_event("startup")
async def start_scheduler():
    scheduler = AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")
    
    # 04:00 — smoke test (어제 데이터 유효성)
    scheduler.add_job(run_fetch_cycle, CronTrigger(hour=4, minute=0))
    # 15:30 — 15:00 조정 캐치
    scheduler.add_job(run_fetch_cycle, CronTrigger(hour=15, minute=30))
    # 22:30 — 야간 조정
    scheduler.add_job(run_fetch_cycle, CronTrigger(hour=22, minute=30))
    # 23:30 — 23:00 / 23:45 조정 캐치
    scheduler.add_job(run_fetch_cycle, CronTrigger(hour=23, minute=30))
    
    # VNExpress 매시간 체크 (변경 감지용, 가벼움)
    scheduler.add_job(_check_vnexpress_change, CronTrigger(minute=0))
    
    scheduler.start()
    log.info("Fuel price scheduler started.")
```

**옵션 B — System crontab**:

```bash
crontab -e

# 추가
0 4,15 * * * cd /app/backend && python -m jobs.fetch_fuel_prices >> /var/log/fuel_fetch.log 2>&1
30 22,23 * * * cd /app/backend && python -m jobs.fetch_fuel_prices >> /var/log/fuel_fetch.log 2>&1
```

코드베이스에 따라 선택. **추천: 옵션 A (in-process)** — 배포 단순, 로그 통합.

---

## §7. Phase 5 — 프론트엔드 표출 (1-2일)

### Task 5.1: 브랜드 토큰

`frontend/src/components/gas/gas-tokens.ts`:

```typescript
/** 베트남 정유 브랜드 컬러 토큰 */
export interface BrandToken {
  code: string;          // 'PETROLIMEX'
  displayName: string;   // 'Petrolimex'
  primary: string;       // 메인 컬러 (마커 도트)
  accent: string;        // 보조 컬러
  textColor: string;     // 텍스트 색 (메인 위 텍스트용)
}

export const BRAND_TOKENS: Record<string, BrandToken> = {
  PETROLIMEX: {
    code: 'PETROLIMEX',
    displayName: 'Petrolimex',
    primary: '#003F87',   // 페트롤리멕스 파랑
    accent: '#FFCC00',    // 노랑
    textColor: '#FFFFFF',
  },
  PVOIL: {
    code: 'PVOIL',
    displayName: 'PVOil',
    primary: '#F36F21',   // PVOil 주황
    accent: '#FFFFFF',
    textColor: '#FFFFFF',
  },
  SAIGON_PETRO: {
    code: 'SAIGON_PETRO',
    displayName: 'Saigon Petro',
    primary: '#1E7F3E',   // 초록
    accent: '#FFFFFF',
    textColor: '#FFFFFF',
  },
  MIPEC: {
    code: 'MIPEC',
    displayName: 'Mipec',
    primary: '#8B4513',
    accent: '#FFFFFF',
    textColor: '#FFFFFF',
  },
  COMECO: {
    code: 'COMECO',
    displayName: 'Comeco',
    primary: '#6B7280',
    accent: '#FFFFFF',
    textColor: '#FFFFFF',
  },
  UNKNOWN: {
    code: 'UNKNOWN',
    displayName: '기타',
    primary: '#9CA3AF',
    accent: '#FFFFFF',
    textColor: '#FFFFFF',
  },
};

export function getBrand(code?: string | null): BrandToken {
  if (!code) return BRAND_TOKENS.UNKNOWN;
  return BRAND_TOKENS[code] || BRAND_TOKENS.UNKNOWN;
}

/** 가격 천 단위 축약 표기 ('21,560' → '21.5k') */
export function formatPriceShort(vnd: number | null | undefined): string {
  if (!vnd) return '—';
  if (vnd < 10_000) return `${vnd}đ`;
  return `${(vnd / 1000).toFixed(1).replace('.0', '')}k`;
}

/** 가격 풀 표기 ('21,560 VND/L') */
export function formatPriceFull(vnd: number | null | undefined): string {
  if (!vnd) return '—';
  return `${vnd.toLocaleString('en-US')} VND/L`;
}
```

### Task 5.2: 주유소 마커

`frontend/src/components/gas/GasStationMarker.tsx`:

```tsx
import React from 'react';
import { BrandToken, formatPriceShort } from './gas-tokens';

interface Props {
  brand: BrandToken;
  refPrice?: number;       // RON 95-III 가격 (지도 줌인 시 표시)
  is24h?: boolean;
  showPrice: boolean;      // 줌 레벨에 따라 부모가 결정
  onClick?: () => void;
}

/**
 * 지도 위 주유소 마커.
 *
 * 줌아웃: 브랜드 도트만 (12px)
 * 줌인:   브랜드 도트 + 가격 라벨 ('21.5k')
 */
export default function GasStationMarker({
  brand, refPrice, is24h, showPrice, onClick,
}: Props) {
  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      {/* 도트 */}
      <circle
        r={showPrice ? 8 : 5}
        fill={brand.primary}
        stroke="white"
        strokeWidth="1.5"
      />
      
      {/* 24h 표시 (작은 점) */}
      {is24h && (
        <circle
          cx="5"
          cy="-5"
          r="2"
          fill="#FFCC00"
          stroke="white"
          strokeWidth="0.5"
        />
      )}
      
      {/* 가격 라벨 (줌인 시만) */}
      {showPrice && refPrice && (
        <g transform="translate(0, -14)">
          <rect
            x="-14"
            y="-7"
            width="28"
            height="11"
            rx="4"
            fill={brand.primary}
            opacity="0.95"
          />
          <text
            y="1"
            fontSize="7"
            fontWeight="700"
            fill={brand.textColor}
            textAnchor="middle"
          >
            {formatPriceShort(refPrice)}
          </text>
        </g>
      )}
    </g>
  );
}
```

### Task 5.3: 바텀시트

`frontend/src/components/gas/GasStationSheet.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { gasApi } from '@/api/info';
import { getBrand, formatPriceFull } from './gas-tokens';
import styles from './GasStationSheet.module.css';

interface Props {
  stationId: number;
  onClose: () => void;
  onReportPrice?: () => void;   // v2에서 활성화
}

interface StationDetail {
  station_id: number;
  name: string;
  brand_normalized: string;
  lat: number;
  lng: number;
  is_24h: boolean;
  reference_price: {
    RON95_III?: number;
    E5_RON92_II?: number;
    RON95_V?: number;
    source: string;
    updated_at: string;
  };
  crowd_price: any;
}

export default function GasStationSheet({ stationId, onClose, onReportPrice }: Props) {
  const [data, setData] = useState<StationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainFuel, setMainFuel] = useState<'RON95_III' | 'E5_RON92_II'>('RON95_III');
  
  useEffect(() => {
    setLoading(true);
    gasApi.getStation(stationId).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [stationId]);
  
  if (loading || !data) {
    return (
      <div className={styles.sheet}>
        <div className={styles.skeleton}>로딩 중...</div>
      </div>
    );
  }
  
  const brand = getBrand(data.brand_normalized);
  const mainPrice = data.reference_price[mainFuel];
  const subFuel = mainFuel === 'RON95_III' ? 'E5_RON92_II' : 'RON95_III';
  const subPrice = data.reference_price[subFuel];
  
  return (
    <div className={styles.sheet}>
      {/* 헤더 */}
      <header className={styles.header}>
        <div className={styles.brandBadge} style={{ background: brand.primary, color: brand.textColor }}>
          {brand.displayName}
        </div>
        <button onClick={onClose} className={styles.closeBtn}>✕</button>
      </header>
      
      <h2 className={styles.stationName}>{data.name}</h2>
      {data.is_24h && <span className={styles.badge24h}>24시간 영업</span>}
      
      {/* 메인 가격 */}
      <section className={styles.priceMain}>
        <div className={styles.priceLabel}>
          {mainFuel === 'RON95_III' ? 'RON 95-III' : 'E5 RON 92-II'}
        </div>
        <div className={styles.priceValue}>
          {formatPriceFull(mainPrice)}
        </div>
      </section>
      
      {/* 보조 가격 (토글) */}
      {subPrice && (
        <button 
          className={styles.priceSub}
          onClick={() => setMainFuel(subFuel)}
        >
          <span>{subFuel === 'RON95_III' ? 'RON 95-III' : 'E5 RON 92-II'}: {formatPriceFull(subPrice)}</span>
          <span className={styles.swapIcon}>⇄</span>
        </button>
      )}
      
      {/* 출처 + 갱신 시각 (신뢰의 핵심) */}
      <div className={styles.meta}>
        <span>Vùng 1 {data.reference_price.source}</span>
        <span>·</span>
        <span>{data.reference_price.updated_at} 갱신</span>
      </div>
      
      {/* v2 진입점 (라이더 신고) */}
      {onReportPrice && (
        <button className={styles.reportBtn} onClick={onReportPrice}>
          실제 가격 신고하기 → +10 GP
        </button>
      )}
      
      {/* 경고 카피 */}
      <p className={styles.disclaimer}>
        ⓘ 베트남 정부 공시 참고가입니다. 실제 가격은 매장별로 ±100 VND 차이날 수 있어요.
      </p>
    </div>
  );
}
```

`GasStationSheet.module.css`:

```css
.sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-radius: 24px 24px 0 0;
  padding: 20px 20px 32px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
  z-index: 100;
  max-width: 480px;
  margin: 0 auto;
  animation: slideUp 0.25s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.brandBadge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.closeBtn {
  background: #F3F4F6;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
}

.stationName {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}

.badge24h {
  display: inline-block;
  font-size: 10px;
  background: #FFF7ED;
  color: #FF5A1F;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  margin-bottom: 12px;
}

/* 메인 가격 — 큰 글씨 */
.priceMain {
  padding: 16px 0;
  border-top: 1px solid #F3F4F6;
  border-bottom: 1px solid #F3F4F6;
  margin: 8px 0 12px;
}

.priceLabel {
  font-size: 12px;
  color: #6B7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.priceValue {
  font-family: 'JetBrains Mono', 'Inter', monospace;
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  margin-top: 4px;
}

/* 보조 가격 토글 */
.priceSub {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 13px;
  color: #4B5563;
  cursor: pointer;
  margin-bottom: 12px;
}

.priceSub:hover { background: #F3F4F6; }

.swapIcon {
  font-size: 14px;
  color: #9CA3AF;
}

/* 출처 + 갱신시각 — 신뢰의 핵심 */
.meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: #9CA3AF;
  margin-bottom: 16px;
}

/* 신고 CTA */
.reportBtn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #FF5A1F, #FF8A4F);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 12px;
}

.disclaimer {
  font-size: 10px;
  color: #9CA3AF;
  text-align: center;
  line-height: 1.4;
  margin: 0;
}
```

### Task 5.4: 지도 통합 — InfoGasList.tsx

`frontend/src/pages/info/InfoGasList.tsx` 수정:

```tsx
import { useState, useEffect, useMemo } from 'react';
import SaigonWardMap from '@/components/maps/SaigonWardMap';
import GasStationSheet from '@/components/gas/GasStationSheet';
import { gasApi } from '@/api/info';
import { useGeolocation } from '@/hooks/useGeolocation';

export default function InfoGasList() {
  const { location } = useGeolocation();
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [globalUpdatedAt, setGlobalUpdatedAt] = useState<string | null>(null);
  
  useEffect(() => {
    if (!location) return;
    gasApi.getNearby(location.lat, location.lng, 3.0).then(data => {
      setStations(data.stations);
      setGlobalUpdatedAt(data.global_updated_at);
    });
  }, [location]);
  
  // 마커로 변환 (시안 v2 지도에 표출)
  const markers = useMemo(() => {
    return stations.map((s: any) => ({
      type: 'gas' as const,
      lat: s.lat,
      lng: s.lng,
      label: undefined,  // 줌아웃에선 라벨 X (도트만)
      onClick: () => setSelectedStation(s.station_id),
      data: s,
    }));
  }, [stations]);
  
  return (
    <div className="info-gas-page">
      <header>
        <h1>주유소 · 오늘의 참고가</h1>
        {globalUpdatedAt && (
          <span className="updated-at">
            Vùng 1 공식 참고가 · {globalUpdatedAt} 갱신
          </span>
        )}
      </header>
      
      {/* 지도 */}
      <SaigonWardMap
        height={420}
        markers={markers}
        showLabels={false}        // 줌아웃 단계는 라벨 노이즈 줄임
        showLegend={false}
        interactive={true}
      />
      
      {/* 주유소 리스트 (지도 아래) */}
      <section className="stations-list">
        {stations.map((s: any) => (
          <StationCard 
            key={s.station_id} 
            station={s} 
            onClick={() => setSelectedStation(s.station_id)}
          />
        ))}
      </section>
      
      {/* 바텀시트 */}
      {selectedStation && (
        <GasStationSheet 
          stationId={selectedStation}
          onClose={() => setSelectedStation(null)}
          // onReportPrice={() => ...}    // v2에서 활성화
        />
      )}
    </div>
  );
}
```

⚠️ `SaigonWardMap`의 marker type 'gas'가 이미 있어야 함 (지도 컴포넌트 작업 시 추가했음). 없으면 `SaigonWardMap.tsx` 마커 분기에 `'gas'` 추가:

```tsx
{m.type === 'gas' && (
  <GasStationMarker
    brand={getBrand(m.data?.brand_normalized)}
    refPrice={m.data?.reference_price?.RON95_III}
    is24h={m.data?.is_24h}
    showPrice={false}   // 줌 레벨은 부모가 결정 (Phase 6에서 정밀화)
    onClick={m.onClick}
  />
)}
```

---

## §8. Phase 6 — 검수 + 통합 테스트 (1일)

### Task 6.1: 데이터 파이프라인 검수

```bash
# 1. 수동으로 fetch 1회 실행
cd backend && python -m jobs.fetch_fuel_prices

# 2. DB 결과 확인
psql $DATABASE_URL -c "
  SELECT brand, fuel_type, price_vnd, source, raw_fetched_at, status, 
         validated_by->>'trusted' AS trusted
  FROM fuel_price_snapshot
  WHERE effective_date = CURRENT_DATE
  ORDER BY brand, fuel_type;
"
# 기대: PETROLIMEX RON95_III, E5_RON92_II 등 2-3개 + PVOIL + MARKET_AVG

# 3. fetch 로그 확인
psql $DATABASE_URL -c "
  SELECT * FROM fuel_price_fetch_log 
  ORDER BY scheduled_at DESC LIMIT 5;
"

# 4. Redis 캐시 확인
redis-cli KEYS "saigon:fuel:*"
# 기대: today:prices, station:*, nearby:*

# 5. API 응답 확인
curl http://localhost:8000/api/bff/info/gas/today-prices | jq
# 기대: {"PETROLIMEX": {...}, "updated_at": "16:30", ...}

curl "http://localhost:8000/api/bff/info/gas/stations/nearby?lat=10.78&lng=106.7" | jq '.stations[0]'
# 기대: station + reference_price + 가격 + updated_at
```

### Task 6.2: 프론트 시각 검수

```
□ /info/gas 접속 → 지도 + 주유소 마커 표시
□ 마커 색이 브랜드별로 다름 (Petrolimex 파랑, PVOil 주황)
□ 24h 영업 마커에 노란 점
□ 마커 탭 → 바텀시트 열림
□ 바텀시트에 'RON 95-III: 21,560 VND/L' 큰 글씨
□ '⇄' 아이콘 탭하면 E5 RON 92-II 가격으로 메인 전환
□ 갱신 시각 ("16:30 갱신") 회색 작은 글씨로 노출
□ 어디에도 "실시간가" 단어 없음
□ "오늘의 참고가" 또는 "Vùng 1 공식 참고가" 카피 사용
```

### Task 6.3: 사고 시뮬레이션

```bash
# 1. Petrolimex 사이트 다운 시뮬레이션
# scrapers/petrolimex_scraper.py 임시로 raise Exception 추가하고 실행
# 기대: PVOil + VNExpress만으로 fetch 진행, validation은 'trusted: false'

# 2. 이상치 시뮬레이션
psql $DATABASE_URL -c "
  INSERT INTO fuel_price_snapshot 
    (effective_date, effective_time, region, brand, fuel_type, price_vnd, source, raw_fetched_at)
  VALUES 
    (CURRENT_DATE, NOW(), 'VUNG_1', 'PETROLIMEX', 'RON95_III', 99999, 'manual_test', NOW());
"
# 기대: API 응답에서 이게 ACTIVE인지 확인 → ACTIVE면 어뷰징 체크 미흡
```

---

## §9. 작업 순서 (요약)

```
Phase 0 (30분):     Redis + 의존성 + H 작업 진척 확인
Phase 1 (2-3h):     DB 스키마 확장 + 마이그레이션
Phase 2 (1-2일):    스크래퍼 3종 + 검증 로직
Phase 3 (4-6h):     비즈니스 서비스 + Redis 캐시 + API 라우터
Phase 4 (3-4h):     Cron job + APScheduler 설정
Phase 5 (1-2일):    프론트엔드 (브랜드 토큰 + 마커 + 바텀시트 + InfoGasList)
Phase 6 (1일):      검수 + 통합 테스트

총 4-6일 (단일 개발자 풀타임)
```

---

## §10. v2 확장 (이번 작업 범위 밖)

다음 작업은 **v1 끝나고 D7 리텐션 검증 후** 진행:

1. **크라우드소싱 신고**: `fuel_price_report` 테이블에 PENDING → ACCEPTED 워크플로
2. **신뢰도 알고리즘**: 24h 이내 3명+ 신고 → 평균 가격이 reference ±8% 안이면 ACCEPTED
3. **GP 보상**: 신고 시 +10 GP, 폐기 시 -5 GP
4. **"라이더 검증" 배지**: 바텀시트에 crowd_price 추가 표시
5. **"리포터" 타이틀 + 누적 신고 뱃지**: RPG 시스템과 연결

이거 다 H 문서의 GP 적립 통로와 자연스럽게 연결됨 (기존 INFO_GAS_WAIT_REPORT 패턴 따라가면 됨).

---

## §11. 코드에게 던질 첫 메시지

```
Saigon Rider 유가 정보 표출 작업 시작.

【작업 지시서】
docs/fuel-price-instructions.md (이 문서)

【전제】
- H 작업 진척: Phase 3 (주유소 모듈) 끝났음 (gas_station 테이블 + info_gas 라우터 존재)
- 지도 컴포넌트 작업 완료: components/maps/SaigonWardMap.tsx 존재
- 이번 작업은 그 위에 "유가 데이터 파이프라인 + 표출" 추가

【작업 범위】
1. DB 스키마 확장 (fuel_price_snapshot 신규 + gas_station 확장)
2. 스크래퍼 3종 (Petrolimex Primary, PVOil Secondary, VNExpress Cross-check)
3. 3-way validation + Redis 캐시
4. APScheduler cron (04:00 / 15:30 / 22:30 / 23:30 ICT)
5. 프론트: 브랜드 마커 + 바텀시트 + InfoGasList 통합

【절대 규칙】
- "실시간가" 단어 절대 금지 → "오늘의 참고가"
- 갱신 시각 항상 노출
- 천 단위 축약 표기 (21.5k)
- 브랜드별 색 (Petrolimex 파랑, PVOil 주황)

【주의 사항】
- robots.txt 존중, User-Agent에 연락처 명시 (이미 base_scraper.py에 적용됨)
- 분당 1회 이상 안 두드림
- 모든 외부 호출은 3회 재시도 + exponential backoff
- 한 소스 실패 ≠ 전체 실패 (asyncio.gather 패턴)

위임형 진행. Phase 0부터 시작해줘.
```

---

## §12. 문제 해결 가이드

| 문제 | 해결 |
|---|---|
| Petrolimex 페이지 구조 변경 → 파싱 실패 | `fetch_log.error_message` 확인 + selector 업데이트. VNExpress 백업으로 운영 유지 |
| 3-way validation 모두 실패 | "갱신 지연" 배지 + 어제 가격 유지 + Slack 알림 |
| Redis 캐시 stale | Cron 끝마다 `cache_invalidate("*")` 호출 (이미 구현) |
| 이상치 (±8% 벗어남) | `status='PENDING'`으로 저장, 운영자 수동 승인 후 ACTIVE |
| 사용자가 "왜 마커마다 가격 같아?" 문의 | "베트남은 정부 공시 참고가 시스템이라 브랜드별로만 다릅니다" 가이드 노출 |
| 모터바이크 외 연료 (DO 등) 표시 안 됨 | 의도된 동작. v2에서 라이더 리퀘스트 받으면 추가 검토 |

---

## §13. 한 줄 정리

**"3개 소스 (Petrolimex + PVOil + VNExpress)에서 하루 4회 fetch + 3-way validation + Redis 캐시. 시안 v2 지도 위 브랜드 색 마커 + 바텀시트로 '오늘의 참고가' 정직 표시. 갱신 시각 노출 = 신뢰. 4-6일 작업."**

---

(끝)

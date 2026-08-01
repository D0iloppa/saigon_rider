"""
240개 quests에 mission_code/rarity 제안값을 생성.

입력: stdin 으로 받은 PSV (id|title_ko|desc_ko|period|badge|district_id|rider_type_id)
출력: scripts/quest_code_proposal.csv (사람이 검토/수정 가능한 형식)

매핑 규칙 (우선순위):
  1. 시즌 키워드 매칭 → S-{TET/SPRING/...}-NN
  2. 온보딩 키워드("14일", "환영", "첫", "신규") → O-{cat}-NN
  3. 연간 키워드("연간", "1주년") → A-MX-NN
  4. period=EVENT + 월간 키워드 → M-{cat}-NN
  5. period=DAILY/WEEKLY → D-{cat}-NN / W-{cat}-NN
  6. 카테고리: 키워드 점수표 (MAINT > DELIVERY > COMMUNITY > MARKET > RIDING > MIXED)
  7. 레전드/마스터/풀컴플리션 키워드 + period=EVENT → rarity='M' 후보 표시
"""
from __future__ import annotations
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import List, Tuple

ROOT = Path(__file__).resolve().parent.parent
OUT_CSV = ROOT / 'scripts/quest_code_proposal.csv'

# ── 카테고리 키워드 (높을수록 우선) ─────────────────────────
CAT_KEYWORDS = {
    'MT': [  # MAINT
        '점검', '오일', '타이어', '체인', '워셔', '브레이크', '엔진', '부품',
        '정비', '세차', '주유', '연료', '교체', '필터', '배터리', '오도미터',
        '연비', '우비',
    ],
    'DL': [  # DELIVERY
        '배달', '배차', '드라이버', '콜', '택배', '운송', '픽업',
    ],
    'CM': [  # COMMUNITY
        '응원', '댓글', '친구', '초대', '팔로워', '인플루언서', '추천',
        '피드', '좋아요', '공유', '게시', '커뮤니티', '댓글로', '소셜',
        '후기', '채팅', '리뷰', '메시지', '공감', '인스타', 'TikTok',
        '응답', '컨텐츠', '매너',
    ],
    'MK': [  # MARKET
        '마켓', '거래', '판매', '구매', '가격', '큐레이터', '쇼핑', '주문',
        '시세', '시장', '입찰', '등록',
    ],
    'RD': [  # RIDING
        '라이딩', '라이더', 'km', '주행', '통근', '탐험', '투어', '코스',
        '다리', '도로', '왕복', '출퇴근', '카페', '야시장', '강변', '풍경',
        '사진', '동네', '바이크', '귀가', 'District', 'Thu Duc', 'Phu My',
        '횡단', '랜드마크', '진입', 'Saigon', '도시', '골든아워', '새벽',
        '야간', '점심', '아침',
    ],
}
CAT_ORDER = ['MT', 'DL', 'CM', 'MK', 'RD']  # 점수 동률 시 우선순위

# ── 시즌 키워드 → 시즌 라벨 ──────────────────────────────
SEASON_KEYWORDS: List[Tuple[List[str], str]] = [
    (['Tết', 'Tet', '설', '구정', '귀성'], 'TET'),
    (['시조', '훙왕', 'Hung', '봄'], 'SPRING'),
    (['4/30', '30/4', '해방', '재통일', '여름'], 'SUM'),
    (['장마', '우기', '비 오는', '몬순', '우중'], 'RAIN'),
    (['9/2', '독립', '귀신달', '음력 7'], 'INDEP'),
    (['추석', '중추', '한가위', 'Trung Thu', '중추절', '가을'], 'MID'),
    (['건기', '사이공 생일', 'Sài Gòn', '겨울'], 'DRY'),
    (['크리스마스', 'Xmas', '연말', '새해', '신년', '카운트다운'], 'XMAS'),
    (['모든 시즌', '풀 시즌'], 'ANNUAL'),
]

# ── 윈도우 분류 키워드 ────────────────────────────────────
ONBOARDING_KEYWORDS = ['14일', '환영', '신규', '첫 라이딩', '첫 퀘스트', '첫 ', '입문']
ANNUAL_KEYWORDS = ['연간', '1주년', '연 1', '10000km', '5000km', '풀패스', '풀 패스']
MONTHLY_KEYWORDS = ['월간', '월 1', '월 2', '월 5', '월 1000', '25일', '30일', '월 ']

# ── Mythic 힌트 키워드 ────────────────────────────────────
MYTHIC_KEYWORDS = ['레전드', '풀 컴플리션', '풀 카테고리', '풀 다양성', '챔피언 마스터',
                    '시조의', '전설', '폭풍의', '유령', '불사조']


def detect_season(title: str, desc: str) -> str:
    text = f"{title} {desc}"
    for kws, label in SEASON_KEYWORDS:
        for kw in kws:
            if kw.lower() in text.lower():
                return label
    return ''


MX_KEYWORDS = ['다양성', '풀 컴플리션', '풀컴플리션', '풀패스', '풀 패스',
                '충성', '카테고리 마스터', '퀘스트 마스터', '완벽주의']
COUNT_RE = re.compile(r'\d+\s*건')


def detect_category(title: str, desc: str) -> Tuple[str, int]:
    text_raw = f"{title} {desc}"
    text = text_raw.lower()
    # MX 명시 키워드 우선
    if any(kw in text_raw for kw in MX_KEYWORDS):
        return 'MX', 99
    scores = defaultdict(int)
    for cat, kws in CAT_KEYWORDS.items():
        for kw in kws:
            if kw.lower() in text:
                scores[cat] += 1
    # 'N건' 패턴 → DL 가중
    if COUNT_RE.search(text_raw):
        scores['DL'] += 2
    if not scores:
        return 'MX', 0
    max_score = max(scores.values())
    for cat in CAT_ORDER:
        if scores[cat] == max_score:
            return cat, max_score
    return 'MX', 0


def detect_window(title: str, desc: str, period: str, season: str) -> str:
    text = f"{title} {desc}"
    if season:
        return 'S'
    if any(kw in text for kw in ONBOARDING_KEYWORDS):
        return 'O'
    if any(kw in text for kw in ANNUAL_KEYWORDS):
        return 'A'
    if any(kw in text for kw in MONTHLY_KEYWORDS):
        return 'M'
    if period == 'DAILY':
        return 'D'
    if period == 'WEEKLY':
        return 'W'
    if period == 'EVENT':
        # 시즌/온보딩/연간/월간 다 아니면 W로 폴백 (event는 보통 1주 단위)
        return 'W'
    return 'D'


def detect_mythic(title: str, desc: str, period: str) -> str:
    text = f"{title} {desc}"
    if period == 'EVENT' and any(kw in text for kw in MYTHIC_KEYWORDS):
        return 'M'
    return 'C'  # 기본 Common; 보정은 수동


def main() -> int:
    rows = []
    seq = defaultdict(int)
    for line in sys.stdin:
        line = line.rstrip('\n')
        if not line:
            continue
        parts = line.split('|')
        if len(parts) != 7:
            print(f"⚠ malformed: {line[:80]}", file=sys.stderr)
            continue
        qid, title, desc, period, badge, district, rider_type = parts

        season = detect_season(title, desc)
        window = detect_window(title, desc, period, season)
        cat, cat_score = detect_category(title, desc)
        rarity = detect_mythic(title, desc, period)

        if window == 'S':
            # 시즌은 카테고리 대신 시즌 라벨
            seq_key = f'S-{season}'
            seq[seq_key] += 1
            mission_code = f'S-{season}-{seq[seq_key]:02d}'
        elif window == 'O':
            seq_key = f'O-{cat}'
            seq[seq_key] += 1
            mission_code = f'O-{cat}-{seq[seq_key]:02d}'
        elif window == 'A':
            seq_key = 'A-MX'
            seq[seq_key] += 1
            mission_code = f'A-MX-{seq[seq_key]:02d}'
        else:
            seq_key = f'{window}-{cat}'
            seq[seq_key] += 1
            mission_code = f'{window}-{cat}-{seq[seq_key]:02d}'

        # confidence: 시즌 매칭 > Mythic 매칭 > 카테고리 점수
        conf = 'HIGH' if season else ('MED' if cat_score >= 1 else 'LOW')

        rows.append({
            'id': qid,
            'title_ko': title,
            'period': period,
            'badge': badge,
            'district_id': district,
            'rider_type_id': rider_type,
            'window': window,
            'season': season,
            'category': cat,
            'mission_code': mission_code,
            'rarity': rarity,
            'confidence': conf,
            'cat_score': cat_score,
            'notes': '',
        })

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    # 통계
    print(f"✓ {OUT_CSV.relative_to(ROOT)} ({len(rows)} rows)")
    print("\n── confidence 분포 ──")
    confs = defaultdict(int)
    for r in rows:
        confs[r['confidence']] += 1
    for k, v in sorted(confs.items()):
        print(f"  {k}: {v}")

    print("\n── mission_code 분포 ──")
    codes = defaultdict(int)
    for r in rows:
        prefix = '-'.join(r['mission_code'].split('-')[:2])
        codes[prefix] += 1
    for k, v in sorted(codes.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

    print("\n── rarity ──")
    rarities = defaultdict(int)
    for r in rows:
        rarities[r['rarity']] += 1
    for k, v in sorted(rarities.items()):
        print(f"  {k}: {v}")

    return 0


if __name__ == '__main__':
    sys.exit(main())

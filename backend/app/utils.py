import hashlib
import hmac
import math
import os
import re
from base64 import urlsafe_b64encode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

IMGPROXY_BASE_URL = os.getenv("IMGPROXY_BASE_URL", "http://localhost:18090/img")
IMGPROXY_KEY = os.getenv("IMGPROXY_KEY", "")
IMGPROXY_SALT = os.getenv("IMGPROXY_SALT", "")
BFF_PUBLIC_URL = os.getenv("BFF_PUBLIC_URL", "http://localhost:8082")

# 일자 경계 계산용 타임존 (DAILY 퀘스트 period_key, ride streak, 월별 통계 등)
# .env 의 APP_TIMEZONE 값을 따른다. 미설정 또는 잘못된 값이면 Asia/Seoul 로 폴백.
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Seoul")
try:
    APP_TZ = ZoneInfo(APP_TIMEZONE)
except ZoneInfoNotFoundError:
    APP_TZ = ZoneInfo("Asia/Seoul")

MOCK_IMG_ENDPOINT = f"{BFF_PUBLIC_URL}/contents/mock-img"


async def generate_random_nickname(db) -> str | None:
    """닉네임 단어 풀에서 랜덤 닉네임 생성("형용사 명사 NNN"). 단어 풀이 비면 None.

    users.nickname 은 UNIQUE 라 충돌을 피해야 한다 → 최대 10회 재시도하며 미사용 값을 고른다.
    가입(register)·로그인(login) 시 공백 닉네임 보정과 /profile/random-nickname 에서 공용.
    """
    import random

    from sqlalchemy import select

    from .models import NicknameWord, User

    adj_rows = (
        (await db.execute(select(NicknameWord.word).where(NicknameWord.word_type == "adjective"))).scalars().all()
    )
    noun_rows = (await db.execute(select(NicknameWord.word).where(NicknameWord.word_type == "noun"))).scalars().all()
    if not adj_rows or not noun_rows:
        return None

    candidate = ""
    for _ in range(10):
        candidate = f"{random.choice(adj_rows)} {random.choice(noun_rows)} {random.randint(100, 999)}"
        taken = (await db.execute(select(User.id).where(User.nickname == candidate))).scalar_one_or_none()
        if taken is None:
            return candidate
    return candidate  # 10회 모두 충돌(극히 드묾) — 마지막 후보 반환(상위 호출부가 처리)


# 프로필 사진 미설정 시 폴백 풀 (owner_type='profile_mock') 서빙 엔드포인트
PROFILE_MOCK_ENDPOINT = f"{BFF_PUBLIC_URL}/contents/profile-mock-img"


def build_imgproxy_url(file_path: str, options: str = "") -> str:
    # base64 인코딩: nginx의 merge_slashes가 local:/// 를 local:/ 로 압축하는 문제를 방지
    source = f"local:///{file_path}"
    encoded = urlsafe_b64encode(source.encode()).rstrip(b"=").decode()
    path = f"/{options}/{encoded}" if options else f"/{encoded}"

    if IMGPROXY_KEY and IMGPROXY_SALT:
        key = bytes.fromhex(IMGPROXY_KEY)
        salt = bytes.fromhex(IMGPROXY_SALT)
        digest = hmac.new(key, salt + path.encode(), hashlib.sha256).digest()
        signature = urlsafe_b64encode(digest).rstrip(b"=").decode()
        return f"{IMGPROXY_BASE_URL}/{signature}{path}"

    return f"{IMGPROXY_BASE_URL}/insecure{path}"


# 아바타 표시용 imgproxy 옵션 (정사각 크롭)
AVATAR_IMGPROXY_OPTIONS = "rs:fill:240:240:1"


def default_avatar_url(seed: str | None = None) -> str:
    """프로필 사진 미설정 시 폴백 URL — profile_mock 컨텐츠 풀에서 1장.

    seed(user_id 등)를 주면 풀에서 결정론적으로 동일 이미지를, 없으면 랜덤 반환한다.
    `/contents/profile-mock-img` 엔드포인트가 302 redirect 로 imgproxy URL 을 내려준다.
    """
    suffix = f"&seed={seed}" if seed else ""
    return f"{PROFILE_MOCK_ENDPOINT}?w=240&h=240{suffix}"


def resolve_avatar_url(user) -> str:
    """유저 프로필 이미지 URL 해석 — contents 중개(content_id) 우선, 없으면 프론트 default 이미지.

    우선순위: avatar_content (contents 테이블) > avatar_url (레거시) > default_avatar_url().
    """
    content = getattr(user, "avatar_content", None)
    if content is not None and getattr(content, "file_path", None):
        return build_imgproxy_url(content.file_path, options=AVATAR_IMGPROXY_OPTIONS)
    legacy = getattr(user, "avatar_url", None)
    if legacy:
        return legacy
    user_id = getattr(user, "id", None)
    return default_avatar_url(seed=str(user_id) if user_id else None)


# E.164 베트남 번호(+84 + 국내 9자리)만 지원 — 형식 불일치는 마스킹 실패로 간주(fail closed)
_PHONE_MASK_RE = re.compile(r"^\+84(\d{9})$", re.ASCII)


def mask_phone(phone: str | None) -> str | None:
    """전화번호 마스킹 — 판매자/유저 공개 API 노출용. 앞 2자리만 남기고 나머지 7자리는 '*'.
    예: +84901234567 -> '+84 90*******'. None/공백/형식 불일치는 None(원문 노출 방지).
    """
    if not phone:
        return None
    match = _PHONE_MASK_RE.match(phone)
    if not match:
        return None
    national = match.group(1)
    return f"+84 {national[:2]}{'*' * 7}"


def resolve_feed_image_url(post) -> str | None:
    """피드 이미지 URL 해석 — contents 중개(content_id) 우선, 없으면 레거시 image_url."""
    content = getattr(post, "image_content", None)
    if content is not None and getattr(content, "file_path", None):
        return build_imgproxy_url(content.file_path)
    return getattr(post, "image_url", None)


# 퀘스트 카드 이미지(static system asset). 시드: 047_quest_card_contents_seed.sql
QUEST_CARD_IMGPROXY_OPTIONS = "rs:fill:640:400:1"

# 퀘스트 이미지 3종 슬롯의 출력 crop. 메인이 원본, 썸네일/배너는 메인에서 crop 파생.
QUEST_MAIN_IMGPROXY_OPTIONS = "rs:fill:640:400:1"  # 상세 히어로 (8:5)
QUEST_THUMB_IMGPROXY_OPTIONS = "rs:fill:480:300:1"  # 리스트 카드 (8:5, 경량)
QUEST_BANNER_IMGPROXY_OPTIONS = "rs:fill:1200:400:1/g:ce"  # 홈/이벤트 배너 (3:1, 중앙 crop)


def exp_required_for_level(level: int) -> int:
    """레벨업에 필요한 EXP. frontend/src/lib/rewards.ts와 동일한 곡선."""
    if level <= 1:
        return 200
    if level == 2:
        return 500
    if level == 3:
        return 1000
    if level == 4:
        return 2000
    return exp_required_for_level(level - 1) * 2


# 누적·레벨 상한 (SGR-228 후속 economy-cap-rebalance). 슬롯 보너스 곡선이 Lv30에서 종료되므로
# Lv30 하드캡. SP는 4스킬 x 9서브포인트 = 36 이 유효 투자 한계(SGR-280: 단계당 3 SP)
# → 그 이상은 죽은 숫자라 미발행(레벨업 골드는 계속).
MAX_LEVEL = 30
MAX_SKILL_PT_TOTAL = 36


async def gain_exp(db, user, amount: int) -> int:
    """경험치 적립의 단일 진입점. exp 적립 → 레벨업 판정 → 레벨업 보상 지급까지 처리.
    모든 exp 획득은 이 함수를 거친다. 획득한 레벨 수를 반환한다.

    레벨업 보상(gold·skill_pt)은 코드에 하드코딩하지 않고 levelup_reward_policy(DB seed)
    에서 읽어 레벨당 적립한다 (SGR-228). 환율 골드 100:스킬 10:RP 1.
    Lv30 하드캡, SP 누적 36 상한(=4스킬 x 9서브포인트). 초과 EXP/SP는 적립하지 않는다.
    """
    from .models import LevelupRewardPolicy

    user.exp += amount
    gained = 0
    while user.level < MAX_LEVEL and user.exp >= exp_required_for_level(user.level):
        user.exp -= exp_required_for_level(user.level)
        user.level += 1
        gained += 1
    if gained:
        policy = await db.get(LevelupRewardPolicy, 1)
        if policy is not None:
            user.gold += policy.gold * gained
            # SP 누적 상한: (보유 + 이미 투자한 서브포인트) <= 36. 초과분은 미발행.
            invested = (
                user.skill_distance_rider + user.skill_gold_hunter + user.skill_quest_slot + user.skill_cost_discount
            )
            sp_room = max(0, MAX_SKILL_PT_TOTAL - (user.skill_pt + invested))
            user.skill_pt += min(policy.skill_pt * gained, sp_room)
    return gained


# 보상 가산% 안전캡 — 풀장비+스킬만렙이 닿는 설계 상한. cap은 안전장치, 실제 밸런스는 시드값으로 맞춤.
REWARD_PCT_CAP = 50


async def resolve_reward_pct(db, user) -> tuple[int, int]:
    """RP(EXP+RP)·Gold 가산 % = 착용아이템(RP_MULT/GOLD_MULT) + 스킬(거리라이더/골드헌터 5%/단계).
    스킬 컬럼은 0~9 서브포인트라 단계 = //3 (SGR-280). 각 +{REWARD_PCT_CAP}% 안전캡.
    user None 또는 엔진 장애 시 아이템분 0(스킬분은 항상)."""
    if user is None:
        return 0, 0
    import httpx

    from .engine_client import engine_client

    try:
        eff = await engine_client.get_equip_effects(str(user.id))
    except httpx.HTTPError:
        eff = {}
    rp_pct = min(eff.get("rp_mult_pct", 0) + (user.skill_distance_rider // 3) * 5, REWARD_PCT_CAP)
    gold_pct = min(eff.get("gold_mult_pct", 0) + (user.skill_gold_hunter // 3) * 5, REWARD_PCT_CAP)
    return rp_pct, gold_pct


def skill_cost_discount_pct(user) -> int:
    """cost_discount 스킬 할인 % (단계당 -2%). 컬럼은 0~9 서브포인트라 단계 = //3 (SGR-280).
    가차/상점이 엔진에 전달하는 단일 환산."""
    return ((user.skill_cost_discount // 3) * 2) if user else 0


async def apply_quest_reward_multiplier(db, user, base_exp: int, base_gold: int) -> tuple[int, int]:
    """퀘스트 EXP/Gold 보상에 아이템+스킬 배수를 적용 (RP_MULT→EXP, GOLD_MULT→Gold).
    모든 보상 지급 경로(ride/submit, internal/quest-card-completed, quests[DBG])의 단일 소스 —
    개러지 효과 표시와 실지급을 일치시킨다.
    """
    if user is None:
        return base_exp, base_gold
    rp_pct, gold_pct = await resolve_reward_pct(db, user)
    return (
        int(base_exp * (1 + rp_pct / 100)),
        int(base_gold * (1 + gold_pct / 100)),
    )


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 간 거리(m) — Haversine. (master.py resolve_ward와 동일 공식의 단일 정의)"""
    r = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


async def find_nearest_ward_id(db, lat: float, lng: float, city: str = "HCMC") -> int | None:
    """가장 가까운 active Ward의 id (센터 좌표 기준, /master/wards/resolve와 동일 기준).

    동네지도 배지(map.py listings 탭)가 ward_id로 집계하므로, 매물 생성처럼 좌표를 아는
    쓰기 경로에서는 이걸로 ward_id를 채워야 지도 집계에 노출된다.
    """
    from sqlalchemy import select

    from .models import Ward

    wards = (
        await db.execute(
            select(Ward.id, Ward.center_lat, Ward.center_lng).where(
                Ward.is_active == True,
                Ward.city_code == city.upper(),
                Ward.center_lat.isnot(None),
                Ward.center_lng.isnot(None),
            )
        )
    ).all()
    if not wards:
        return None
    # Decimal(스키마) vs Float(컬럼) 혼합 연산 TypeError 방지 — 양쪽 다 float 정규화
    lat_f, lng_f = float(lat), float(lng)
    return min(wards, key=lambda w: haversine_m(lat_f, lng_f, float(w.center_lat), float(w.center_lng))).id

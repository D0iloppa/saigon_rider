"""admin JSON API — SRE 운영(ops) 대시보드 (읽기 전용, Engine ops 지표 프록시).

`admin_legacy.py`의 `/admin-legacy/sre/ops` 라우트를 JSON 응답으로 이관한 것 —
일일 GOLD/XP 발행-소모, 가챠 ROI, 채널 비율, 천장 분포 4개 지표를 기존
engine_client.admin_ops_daily_net/admin_ops_gacha_roi/admin_ops_channel_ratio/
admin_ops_pity_distribution 그대로 재사용해 프록시한다 (Engine 무변경, 순수
읽기 전용이라 감사 로그 없음). 구 `/admin-legacy/sre/ops` 라우트는 손대지
않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends

from ...admin_auth import AdminSession, verify_root_api
from ...engine_client import engine_client

router = APIRouter(prefix="/ops")


@router.get("/daily-net", summary="일일 GOLD/XP 발행/소모 (최근 7일)")
async def get_daily_net(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_ops_daily_net()
    except Exception:
        return []


@router.get("/gacha-roi", summary="가챠별 ROI 분석 (최근 30일)")
async def get_gacha_roi(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_ops_gacha_roi()
    except Exception:
        return []


@router.get("/channel-ratio", summary="가챠 vs 상점 사용 비율 (최근 30일)")
async def get_channel_ratio(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_ops_channel_ratio()
    except Exception:
        return []


@router.get("/pity-distribution", summary="천장 도달자 분포")
async def get_pity_distribution(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_ops_pity_distribution()
    except Exception:
        return []

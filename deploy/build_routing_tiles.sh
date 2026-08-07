#!/usr/bin/env bash
# =============================================================
# Saigon Rider — 자체호스팅 라우팅(Valhalla) 타일 빌드
#
# 실측 근거·엔진 선정 배경: ai-docs/context/routing-engine.md
#
# 절차: (국가 pbf 다운로드 → bbox 추출) × N리전 → 추출본 전체를 한 번에
# valhalla_build_tiles 에 넘겨 단일 타일셋으로 병합 빌드 → 국가 pbf 삭제(용량 절약).
# 멱등: bbox 추출본이 이미 있으면 국가 pbf 다운로드/추출을 건너뛴다.
# 타일이 이미 있으면(재빌드 원할 때만 --rebuild) 빌드 자체를 건너뛴다.
#
# 용법: deploy/build_routing_tiles.sh [--rebuild]
# 실행 위치: 저장소 루트 어디서든 무관(경로는 스크립트 기준 절대경로로 계산).
#
# 빌드는 무겁다(실측 24분/326MiB, HCMC+경기도 기준) — 개발 머신에서 1회 실행하고,
# 운영 서버에는 결과물 routing_data/valhalla/{tiles,valhalla.json} 만 옮겨서
# docker compose --profile backend up -d routing_engine 으로 서빙만 한다.
# =============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OSM_DIR="$ROOT/routing_data/osm"
VALHALLA_DIR="$ROOT/routing_data/valhalla"
TILES_DIR="$VALHALLA_DIR/tiles"
CONFIG="$VALHALLA_DIR/valhalla.json"
OSMIUM_IMAGE="stefda/osmium-tool:latest"
VALHALLA_IMAGE="valhalla/valhalla:run-latest"

REBUILD=false
[[ "${1:-}" == "--rebuild" ]] && REBUILD=true

mkdir -p "$OSM_DIR" "$VALHALLA_DIR"

# (국가 pbf 다운로드 URL, bbox "lon_min,lat_min,lon_max,lat_max", 추출본 파일명)
# bbox 출처: HCMC = backend/scripts/ward_import.py:32 HCMC_BBOX 재사용.
# 경기도 = 행정경계 아닌 직사각형(대표 승인, 개발 검증용 — ai-docs/context/routing-engine.md §2 참조).
REGIONS=(
  "https://download.geofabrik.de/asia/vietnam-latest.osm.pbf|106.2,10.3,107.2,11.3|hcmc.osm.pbf"
  "https://download.geofabrik.de/asia/south-korea-latest.osm.pbf|126.5,36.9,127.9,38.3|gyeonggi.osm.pbf"
)

extracts=()
for region in "${REGIONS[@]}"; do
  IFS='|' read -r url bbox extract_name <<< "$region"
  extract_path="$OSM_DIR/$extract_name"
  extracts+=("$extract_path")

  if [[ -f "$extract_path" ]]; then
    echo "[skip] $extract_name 이미 존재 — 다운로드/추출 건너뜀"
    continue
  fi

  country_name="$(basename "$url")"
  country_path="$OSM_DIR/$country_name"
  if [[ ! -f "$country_path" ]]; then
    echo "[download] $url"
    curl -sL -o "$country_path" "$url"
  fi

  echo "[extract] $extract_name (bbox $bbox)"
  docker run --rm -v "$OSM_DIR:/data" "$OSMIUM_IMAGE" \
    osmium extract -b "$bbox" -o "/data/$extract_name" "/data/$country_name" --overwrite

  echo "[cleanup] $country_name 삭제 (추출 완료, 재실행 시 필요하면 자동 재다운로드)"
  rm -f "$country_path"
done

if [[ -d "$TILES_DIR" && "$REBUILD" != true ]]; then
  echo "[skip] $TILES_DIR 이미 존재 — 빌드 건너뜀 (재빌드하려면 --rebuild)"
  exit 0
fi

rm -rf "$TILES_DIR" "$VALHALLA_DIR/valhalla.json.tmp"

echo "[config] valhalla_build_config"
docker run --rm -v "$VALHALLA_DIR:/data/valhalla" "$VALHALLA_IMAGE" \
  valhalla_build_config \
    --mjolnir-tile-dir /data/valhalla/tiles \
    --mjolnir-timezone /data/valhalla/timezones.sqlite \
    --mjolnir-admin /data/valhalla/admins.sqlite \
  > "$CONFIG"

echo "[build] valhalla_build_tiles (${#extracts[@]}개 리전 병합 — 수십 분 소요)"
docker run --rm \
  -v "$OSM_DIR:/data/osm" \
  -v "$VALHALLA_DIR:/data/valhalla" \
  "$VALHALLA_IMAGE" \
  valhalla_build_tiles -c /data/valhalla/valhalla.json \
    "${extracts[@]/#$OSM_DIR//data/osm}"

echo "[done] $(du -sh "$TILES_DIR" | cut -f1) — $TILES_DIR"
echo "서빙: docker compose --env-file .env up -d routing_engine"

#!/usr/bin/env python3
"""Saigon Map v2 데이터 생성 파이프라인.

도심 37개 동(洞) 각각에 대해 OSM(ODbL) 도로·건물·수역을 받아
 - depth2.json: 메인도로 polygonize 블록 + 동 경계 (동 bbox 투영)
 - depth3.json: 상세(도로·건물·강), depth2 와 동일 좌표계
를 frontend/public/maps/v2/<slug>/ 에 생성한다.
또한 frontend/src/components/maps/v2/saigon-depth1.json 의 각 ward 에 slug 를 보강한다.

OSM 갱신 시에만 재실행. 정적 reference 데이터이므로 DB 가 아닌 에셋으로 관리.
사용: python3 scripts/gen_saigon_map_v2.py [--only <slug>]

데이터 소스: routing_data/osm/hcmc.osm.pbf (로컬 스냅샷, routing_engine 타일과 동일 pbf).
Overpass 공개 API 는 더 이상 쓰지 않는다 — osmium-tool(docker 이미지) 로 로컬 추출한다.
동 경계(행정구역)도 이 pbf 의 admin_level=6 relation(2025 개편 후 신설 Phường/Xã) 에서 직접 뽑는다.
"""
import json, math, os, subprocess, sys, unicodedata
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import polygonize, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OSM_DIR = os.path.join(ROOT, 'routing_data/osm')                # routing_engine 과 공유하는 pbf 스냅샷
PBF = os.path.join(OSM_DIR, 'hcmc.osm.pbf')
OSM_WORK = os.path.join(OSM_DIR, '_gen')                        # osmium 중간산출물 (routing_data/ 전체가 gitignore)
OSMIUM_IMG = 'stefda/osmium-tool'
WARD_ADMIN_LEVEL = '6'                                           # 2025 행정구역 개편 후 Phường/Xã 레벨
DEPTH1 = os.path.join(ROOT, 'frontend/src/components/maps/v2/saigon-depth1.json')
OUT_DIR = os.path.join(ROOT, 'frontend/public/maps/v2')

MAIN_ROADS = {'trunk', 'primary', 'secondary', 'trunk_link', 'primary_link', 'secondary_link'}
ROAD_STYLE = {
    'motorway': ('#F4A93C', 5.5), 'motorway_link': ('#F4A93C', 3), 'trunk': ('#F4A93C', 5), 'trunk_link': ('#F4A93C', 3),
    'primary': ('#F6C453', 4), 'primary_link': ('#F6C453', 2.5), 'secondary': ('#FBD980', 3), 'secondary_link': ('#FBD980', 2),
    'tertiary': ('#ffffff', 2.4), 'residential': ('#ffffff', 1.8), 'living_street': ('#ffffff', 1.6),
    'unclassified': ('#ffffff', 1.6), 'pedestrian': ('#EDE6DA', 1.8), 'service': ('#f6f6f6', 0.9),
}


def vn_slug(name):
    s = name.replace('Phường ', '').replace('Xã ', '').strip()
    s = s.replace('đ', 'd').replace('Đ', 'D')
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    out = []
    for c in s.lower():
        out.append(c if c.isalnum() else '-')
    slug = '-'.join(filter(None, ''.join(out).split('-')))
    return slug


def _osmium(*args):
    """osmium-tool 을 docker(stefda/osmium-tool)로 실행. routing_data/osm 을 /data 로 마운트."""
    cmd = ['docker', 'run', '--rm', '-v', f'{OSM_DIR}:/data', OSMIUM_IMG, 'osmium', *args]
    subprocess.run(cmd, check=True, capture_output=True)


def load_ward_polygons():
    """pbf 의 boundary=administrative relation 에서 admin_level=6(Phường/Xã) 폴리곤을 뽑는다."""
    os.makedirs(OSM_WORK, exist_ok=True)
    _osmium('tags-filter', '/data/hcmc.osm.pbf', 'r/boundary=administrative',
            '-o', '/data/_gen/admin.osm.pbf', '--overwrite')
    _osmium('export', '/data/_gen/admin.osm.pbf', '-f', 'geojson',
            '-o', '/data/_gen/admin.geojson', '--overwrite')
    d = json.load(open(os.path.join(OSM_WORK, 'admin.geojson')))
    wards = []
    for f in d['features']:
        p = f['properties']
        if p.get('admin_level') != WARD_ADMIN_LEVEL or not p.get('name'):
            continue
        geom = shape(f['geometry'])
        if geom.is_empty:
            continue
        poly = max(geom.geoms, key=lambda g: g.area) if geom.geom_type == 'MultiPolygon' else geom
        wards.append((p['name'], poly))
    return wards


def local_osm(bbox, slug):
    """Overpass 'out geom' 응답과 동일한 {'elements': [...]} 형태로 로컬 pbf 에서 도로/건물/수역을 뽑는다."""
    s, w, n, e = bbox
    area_pbf, feat_pbf, feat_geojson = f'{slug}_area.osm.pbf', f'{slug}_feat.osm.pbf', f'{slug}_feat.geojson'
    _osmium('extract', '-b', f'{w},{s},{e},{n}', '-s', 'complete_ways',
            '/data/hcmc.osm.pbf', '-o', f'/data/_gen/{area_pbf}', '--overwrite')
    _osmium('tags-filter', f'/data/_gen/{area_pbf}', 'w/highway', 'w/building', 'w/waterway', 'w/natural=water',
            '-o', f'/data/_gen/{feat_pbf}', '--overwrite')
    _osmium('export', f'/data/_gen/{feat_pbf}', '-f', 'geojson',
            '-o', f'/data/_gen/{feat_geojson}', '--overwrite')
    d = json.load(open(os.path.join(OSM_WORK, feat_geojson)))
    elements = []
    for feat in d['features']:
        geom, t, gt = feat['geometry'], feat['properties'], feat['geometry']['type']
        if gt == 'Point':
            continue
        # osmium export 는 building/water(area 태그) closed way 를 LineString(원본 way) +
        # MultiPolygon(조립된 area) 두 형태로 중복 방출한다 — area 계열 태그는 폴리곤만 취한다.
        is_area_tag = ('building' in t) or (t.get('natural') == 'water')
        if is_area_tag and gt == 'LineString':
            continue
        if gt == 'LineString':
            coords = geom['coordinates']
        elif gt == 'Polygon':
            coords = geom['coordinates'][0]
        elif gt == 'MultiPolygon':
            coords = geom['coordinates'][0][0]
        else:
            continue
        if len(coords) < 2:
            continue
        elements.append({'tags': t, 'geometry': [{'lat': lat, 'lon': lon} for lon, lat in coords]})
    return {'elements': elements}


def build_ward(name, slug, poly):
    minx, miny, maxx, maxy = poly.bounds
    sx, sy = maxx - minx, maxy - miny
    pad = 0.06
    W, E = minx - sx * pad, maxx + sx * pad
    S, N = miny - sy * pad, maxy + sy * pad
    latkm = (N - S) * 110.57
    lngkm = (E - W) * 111.32 * math.cos(math.radians((N + S) / 2))
    VW = 1000.0
    VH = round(VW * latkm / lngkm, 1)

    def pr(lat, lng):
        return ((lng - W) / (E - W) * VW, (N - lat) / (N - S) * VH)

    def ring_geom(g):
        return ' '.join(f'{round(x, 1)},{round(y, 1)}' for x, y in (pr(p['lat'], p['lon']) for p in g))

    def ring_poly(pg):
        return ' '.join(f'{round(x, 1)},{round(y, 1)}' for x, y in pg.exterior.coords)

    # 동 경계를 투영좌표 polygon 으로 (clip 용)
    ward_proj = Polygon([pr(lat, lng) for lng, lat in poly.exterior.coords])
    border = ring_poly(ward_proj)

    d = local_osm((S, W, N, E), slug)
    main_lines, det_roads, bldg, water, wline = [], [], [], [], []
    for el in d['elements']:
        t = el.get('tags', {})
        g = el.get('geometry')
        if not g or len(g) < 2:
            continue
        hw = t.get('highway')
        if hw:
            pts = [pr(p['lat'], p['lon']) for p in g]
            if hw in MAIN_ROADS:
                main_lines.append(LineString(pts))
            c, wdt = ROAD_STYLE.get(hw, (None, None))
            if c:
                ln = LineString(pts)
                if ward_proj.intersects(ln):
                    det_roads.append({'p': ' '.join(f'{round(x,1)},{round(y,1)}' for x, y in pts), 'c': c, 'w': wdt})
        elif 'building' in t and len(g) >= 3:
            pg = Polygon([pr(p['lat'], p['lon']) for p in g])
            if pg.area < 3 or pg.is_empty:
                continue
            if ward_proj.contains(pg.centroid):
                bldg.append(ring_poly(pg.simplify(0.6, True)))
        elif t.get('natural') == 'water' and len(g) >= 3:
            water.append(ring_geom(g))
        elif 'waterway' in t:
            wline.append(ring_geom(g))

    # depth2 블록: 메인도로 polygonize → 동 경계로 clip
    blocks = []
    for bk in polygonize(unary_union(main_lines)):
        inter = bk.intersection(ward_proj)
        if inter.is_empty:
            continue
        if inter.geom_type == 'Polygon':
            geoms = [inter]
        elif inter.geom_type in ('MultiPolygon', 'GeometryCollection'):
            geoms = [g for g in inter.geoms if g.geom_type == 'Polygon']
        else:
            geoms = []
        for gg in geoms:
            if gg.area >= 200:
                blocks.append({'p': ring_poly(gg), 'cx': round(gg.centroid.x, 1), 'cy': round(gg.centroid.y, 1)})

    base = {'VW': VW, 'VH': VH, 'bbox': {'S': S, 'W': W, 'N': N, 'E': E}, 'border': border}
    depth2 = {**base, 'blocks': blocks}
    depth3 = {**base, 'roads': det_roads, 'bldg': bldg, 'water': water, 'wline': wline}

    out = os.path.join(OUT_DIR, slug)
    os.makedirs(out, exist_ok=True)
    json.dump(depth2, open(os.path.join(out, 'depth2.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump(depth3, open(os.path.join(out, 'depth3.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    sz2 = os.path.getsize(os.path.join(out, 'depth2.json')) // 1024
    sz3 = os.path.getsize(os.path.join(out, 'depth3.json')) // 1024
    return len(blocks), len(det_roads), len(bldg), sz2, sz3


def main():
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1]

    polys = load_ward_polygons()
    bt = [p for n, p in polys if 'Bến Thành' in n][0]
    c = bt.centroid

    def km(p):
        pc = p.centroid
        return math.hypot((pc.x - c.x) * 109, (pc.y - c.y) * 110.6)

    central = [(n, p) for n, p in polys if km(p) <= 6]
    # slug 충돌 방지
    seen = {}
    wards = []
    for n, p in central:
        sl = vn_slug(n)
        if sl in seen:
            seen[sl] += 1
            sl = f'{sl}-{seen[sl]}'
        else:
            seen[sl] = 0
        wards.append((n, sl, p))

    # depth1 에 slug 보강 (name 매칭)
    d1 = json.load(open(DEPTH1))
    name2slug = {n.replace('Phường ', '').replace('Xã ', ''): sl for n, sl, _ in wards}
    hit = 0
    for w in d1['wards']:
        sl = name2slug.get(w.get('n'))
        if sl:
            w['slug'] = sl
            hit += 1
    json.dump(d1, open(DEPTH1, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'[depth1] slug attached {hit}/{len(d1["wards"])} wards')

    print(f'[wards] {len(wards)} central wards' + (f' (only={only})' if only else ''))
    ok = 0
    for i, (n, sl, p) in enumerate(wards, 1):
        if only and sl != only:
            continue
        try:
            nb, nr, nbl, sz2, sz3 = build_ward(n, sl, p)
            ok += 1
            print(f'[{i:2}/{len(wards)}] {sl:24} blocks={nb:3} roads={nr:4} bldg={nbl:4} | d2={sz2}KB d3={sz3}KB')
        except Exception as ex:  # noqa
            print(f'[{i:2}/{len(wards)}] {sl:24} FAILED: {ex}')
    print(f'[done] {ok} wards written to {OUT_DIR}')


if __name__ == '__main__':
    main()

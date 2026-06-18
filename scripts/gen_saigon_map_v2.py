#!/usr/bin/env python3
"""Saigon Map v2 데이터 생성 파이프라인.

도심 37개 동(洞) 각각에 대해 OSM(ODbL) 도로·건물·수역을 받아
 - depth2.json: 메인도로 polygonize 블록 + 동 경계 (동 bbox 투영)
 - depth3.json: 상세(도로·건물·강), depth2 와 동일 좌표계
를 frontend/public/maps/v2/<slug>/ 에 생성한다.
또한 frontend/src/components/maps/v2/saigon-depth1.json 의 각 ward 에 slug 를 보강한다.

OSM 갱신 시에만 재실행. 정적 reference 데이터이므로 DB 가 아닌 에셋으로 관리.
사용: python3 scripts/gen_saigon_map_v2.py [--only <slug>]
"""
import json, math, os, sys, time, unicodedata, urllib.parse, urllib.request
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import polygonize, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARDS_SRC = os.path.join(ROOT, '_tmp/hcmc_wards.json')          # 사전 수집된 동 경계 relations
DEPTH1 = os.path.join(ROOT, 'frontend/src/components/maps/v2/saigon-depth1.json')
OUT_DIR = os.path.join(ROOT, 'frontend/public/maps/v2')

ENDPOINTS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
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


def ward_polygon(rel):
    mem = [m for m in rel.get('members', []) if m.get('role') in ('outer', '') and m.get('geometry')]
    lines = [LineString([(p['lon'], p['lat']) for p in m['geometry']]) for m in mem if len(m['geometry']) >= 2]
    ps = list(polygonize(unary_union(lines)))
    return max(ps, key=lambda p: p.area) if ps else None


def overpass(bbox):
    s, w, n, e = bbox
    q = f"""[out:json][timeout:90];
(
  way["highway"]({s},{w},{n},{e});
  way["building"]({s},{w},{n},{e});
  way["waterway"]({s},{w},{n},{e});
  way["natural"="water"]({s},{w},{n},{e});
);
out geom;"""
    data = urllib.parse.urlencode({'data': q}).encode()
    last = None
    for attempt in range(3):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=data)
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
            if raw[:1] == b'{':
                return json.loads(raw)
            last = raw[:120]
        except Exception as ex:  # noqa
            last = str(ex)
        time.sleep(4)
    raise RuntimeError(f'overpass failed: {last}')


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

    d = overpass((S, W, N, E))
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

    raw = json.load(open(WARDS_SRC))
    polys = []
    for e in [x for x in raw['elements'] if x['type'] == 'relation']:
        nm = e['tags'].get('name')
        if not nm:
            continue
        pg = ward_polygon(e)
        if pg:
            polys.append((nm, pg))
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
        time.sleep(2.5)
    print(f'[done] {ok} wards written to {OUT_DIR}')


if __name__ == '__main__':
    main()

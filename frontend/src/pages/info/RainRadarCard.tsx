import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudOff } from 'lucide-react';
import { weatherApi, type RainRadarData } from '@/api/info';
import depth1 from '@/components/maps/v2/saigon-depth1.json';
import styles from './RainRadarCard.module.css';

/**
 * 강수 레이더 카드 (RainViewer).
 *
 * 왜 필요한가: OpenWeather/open-meteo 같은 격자 예보 모델은 호치민 우기의 국지 대류성
 * 소나기를 구조적으로 놓친다 — 2026-08-03 실제로 비가 쏟아지는 시각에 두 소스 모두
 * 강수 0 을 응답해 앱이 "비 안 옴"이라고 표시한 사고가 있었다. 레이더는 관측(observation)
 * 이라 이 실패 모드가 없다. 즉 이 카드는 장식이 아니라 예보 오탐의 교차검증 수단이다.
 *
 * 지도 구현: 앱 지도(SaigonMapV5)는 등거리 원통 좌표계 SVG 렌더러라 XYZ 래스터 타일을
 * 바로 얹을 수 없다. 여기서는 레이더 타일의 좌표계(Web Mercator)를 기준으로 3×3 타일
 * 모자이크를 만들고, 지리적 기준점으로 depth1 의 동 경계를 같은 머케이터 픽셀 공간으로
 * 변환해 위에 얹는다 — 외부 베이스맵 타일 의존이 없다(비용·정책·CSP 문제 회피).
 *
 * 줌 제약: 무키 RainViewer 는 z<=7 만 실제 타일을 주고 그 위는 "Zoom Level Not Supported"
 * 플레이스홀더 PNG 를 돌려준다(2026-08-03 확인). z=7 타일 하나가 약 300km 폭이라 그대로
 * 보여주면 호치민이 점으로 보이므로, viewBox 로 중심 주변만 잘라내 확대한다(래스터라 다소
 * 뭉개지지만 지리적으로는 정확하다). 서버가 max_zoom 을 내려주므로 키가 붙으면 자동 개선된다.
 */

const TILE = 256;
const SPAN = 3;
/** 크롭 반경(도) — 중심에서 ±0.55° ≈ 120km. 접근 중인 비구름까지 보이면서 동 경계도 식별 가능. */
const CROP_DEG = 0.55;

const D1 = depth1.bbox as { N: number; S: number; E: number; W: number };

const mercX = (lng: number, scale: number) => ((lng + 180) / 360) * scale;
const mercY = (lat: number, scale: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
};

/** depth1 SVG 좌표(px) → 위경도 (bbox 선형 매핑, SaigonMapV5 d1ToU* 와 동일 규약) */
const d1ToLat = (y: number) => D1.N - (y / depth1.VH) * (D1.N - D1.S);
const d1ToLng = (x: number) => D1.W + (x / depth1.VW) * (D1.E - D1.W);

interface Props {
  lat: number;
  lng: number;
}

export default function RainRadarCard({ lat, lng }: Props) {
  const { t, i18n } = useTranslation();
  const [radar, setRadar] = useState<RainRadarData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    weatherApi
      .getRainRadar(lat, lng)
      .then((r) => {
        if (!cancelled) setRadar(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const zoom = radar?.max_zoom ?? 7;

  const geo = useMemo(() => {
    const scale = Math.pow(2, zoom) * TILE;
    const cxT = mercX(lng, scale) / TILE;
    const cyT = mercY(lat, scale) / TILE;
    const tx0 = Math.floor(cxT) - 1;
    const ty0 = Math.floor(cyT) - 1;
    const originX = tx0 * TILE;
    const originY = ty0 * TILE;
    const tiles: { x: number; y: number; tx: number; ty: number }[] = [];
    for (let j = 0; j < SPAN; j++) {
      for (let i = 0; i < SPAN; i++) {
        tiles.push({ x: i * TILE, y: j * TILE, tx: tx0 + i, ty: ty0 + j });
      }
    }
    const px = (la: number, ln: number) => ({
      x: mercX(ln, scale) - originX,
      y: mercY(la, scale) - originY,
    });
    const me = px(lat, lng);
    // 크롭 창 — 중심 ±CROP_DEG 를 머케이터 픽셀로 환산해 viewBox 로 잘라낸다.
    const nw = px(lat + CROP_DEG, lng - CROP_DEG);
    const se = px(lat - CROP_DEG, lng + CROP_DEG);
    const view = { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y };
    return { originX, originY, tiles, me, px, view, scale };
  }, [lat, lng, zoom]);

  // 동 경계 폴리곤 — 레이더와 같은 머케이터 픽셀 공간으로 변환(지리 기준점).
  const wardPaths = useMemo(
    () =>
      (depth1.wards as { p: string }[]).map((w) =>
        w.p
          .trim()
          .split(/\s+/)
          .map((pair) => {
            const [sx, sy] = pair.split(',').map(Number);
            const p = geo.px(d1ToLat(sy), d1ToLng(sx));
            return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          })
          .join(' '),
      ),
    [geo],
  );

  const observedAt = radar
    ? new Date(radar.last_updated * 1000).toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  if (failed) {
    return (
      <div className={styles.failed}>
        <CloudOff size={15} />
        <span>{t('info.weather.radarUnavailable')}</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>
        {radar ? (
          <svg
            viewBox={`${geo.view.x} ${geo.view.y} ${geo.view.w} ${geo.view.h}`}
            className={styles.canvas}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            {/* 레이더 셀 — 반투명 PNG 타일. 동 경계보다 먼저 깔아 경계선이 위로 보이게 한다. */}
            {geo.tiles.map((tile) => (
              <image
                key={`${tile.tx}-${tile.ty}`}
                x={tile.x}
                y={tile.y}
                width={TILE}
                height={TILE}
                href={radar.tile_url
                  .replace('{z}', String(zoom))
                  .replace('{x}', String(tile.tx))
                  .replace('{y}', String(tile.ty))}
              />
            ))}
            {/* 동 경계 — 위치 기준선(채움 없음) */}
            <g className={styles.wards}>
              {wardPaths.map((points, i) => (
                <polygon key={i} points={points} />
              ))}
            </g>
            {/* 내 위치 크로스헤어 */}
            <g className={styles.me}>
              <circle cx={geo.me.x} cy={geo.me.y} r={geo.view.w * 0.012} />
              <circle cx={geo.me.x} cy={geo.me.y} r={geo.view.w * 0.028} className={styles.meRing} />
            </g>
          </svg>
        ) : (
          <div className={styles.skel} />
        )}
        {radar && <span className={styles.meLabel}>{t('info.weather.radarMyLocation')}</span>}
      </div>
      <div className={styles.meta}>
        <span className="num">
          {observedAt ? t('info.weather.radarObserved', { time: observedAt }) : '\u2014'}
        </span>
        <span className={styles.hint}>{t('info.weather.radarHint')}</span>
      </div>
    </div>
  );
}

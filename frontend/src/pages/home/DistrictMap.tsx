import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, X } from 'lucide-react';
import { DISTRICTS } from './districtPaths';
import styles from './DistrictMap.module.css';

interface Props {
  activeCode?: string | null;
}

interface VB {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: VB = { x: 0, y: 0, w: 1200, h: 900 };
const MIN_W = 80;

function fitDistrict(id: string): VB {
  const d = DISTRICTS[id];
  const { bbox } = d;
  const pad = Math.max(bbox.w, bbox.h) * 0.06;
  const halfW = Math.max(d.cx - bbox.x + pad, bbox.x + bbox.w - d.cx + pad);
  const halfH = Math.max(d.cy - bbox.y + pad, bbox.y + bbox.h - d.cy + pad);
  return { x: d.cx - halfW, y: d.cy - halfH, w: halfW * 2, h: halfH * 2 };
}

// Auto-zoom upper bound: cap minimum viewBox size to district 8's fit so small
// districts don't appear oddly enlarged on initial location-based zoom.
const AUTO_MIN_VB: VB = fitDistrict('d8');

function fitDistrictCapped(id: string): VB {
  const v = fitDistrict(id);
  if (v.w >= AUTO_MIN_VB.w && v.h >= AUTO_MIN_VB.h) return v;
  const d = DISTRICTS[id];
  const w = Math.max(v.w, AUTO_MIN_VB.w);
  const h = Math.max(v.h, AUTO_MIN_VB.h);
  return { x: d.cx - w / 2, y: d.cy - h / 2, w, h };
}

export default function DistrictMap({ activeCode }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [vb, setVb] = useState<VB>(FULL);
  const svgRef = useRef<SVGSVGElement>(null);
  const vbRef = useRef<VB>(FULL);
  const gest = useRef({
    pts: new Map<number, { x: number; y: number }>(),
    lastDist: 0,
    lastPan: { x: 0, y: 0 },
    moved: false,
  });

  useEffect(() => { vbRef.current = vb; }, [vb]);

  const highlighted = useMemo(() => {
    if (selected) return selected;
    if (!activeCode) return null;
    const entry = Object.entries(DISTRICTS).find(([, v]) => v.code === activeCode);
    return entry?.[0] ?? null;
  }, [selected, activeCode]);

  // Auto-zoom to user's district on first activeCode resolution
  const didAutoZoom = useRef(false);
  useEffect(() => {
    if (didAutoZoom.current || selected) return;
    if (!activeCode) return;
    const entry = Object.entries(DISTRICTS).find(([, v]) => v.code === activeCode);
    if (entry) {
      didAutoZoom.current = true;
      setVb(fitDistrictCapped(entry[0]));
    }
  }, [activeCode, selected]);

  const isZoomed = vb.w < FULL.w * 0.95;

  const applyVb = useCallback((next: VB) => {
    if (next.w > FULL.w) next = { ...FULL };
    if (next.w < MIN_W) {
      const r = MIN_W / next.w;
      next = { x: next.x, y: next.y, w: next.w * r, h: next.h * r };
    }
    vbRef.current = next;
    setVb(next);
  }, []);

  const handleTap = useCallback((id: string) => {
    if (gest.current.moved) return;
    if (selected === id) {
      setSelected(null);
      applyVb(FULL);
    } else {
      setSelected(id);
      applyVb(fitDistrict(id));
    }
  }, [selected, applyVb]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const g = gest.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.moved = false;
    if (g.pts.size === 1) {
      g.lastPan = { x: e.clientX, y: e.clientY };
    } else if (g.pts.size === 2) {
      const pts = [...g.pts.values()];
      g.lastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gest.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const v = vbRef.current;

    if (g.pts.size === 2) {
      const pts = [...g.pts.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (g.lastDist > 0 && dist > 0) {
        const ratio = g.lastDist / dist;
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const svgCx = v.x + (cx - rect.left) / rect.width * v.w;
        const svgCy = v.y + (cy - rect.top) / rect.height * v.h;
        const nw = v.w * ratio;
        const nh = v.h * ratio;
        applyVb({
          x: svgCx - (cx - rect.left) / rect.width * nw,
          y: svgCy - (cy - rect.top) / rect.height * nh,
          w: nw,
          h: nh,
        });
      }
      g.lastDist = dist;
      g.moved = true;
    } else if (g.pts.size === 1 && v.w < FULL.w * 0.95) {
      const dx = e.clientX - g.lastPan.x;
      const dy = e.clientY - g.lastPan.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) g.moved = true;
      applyVb({
        ...v,
        x: v.x - dx / rect.width * v.w,
        y: v.y - dy / rect.height * v.h,
      });
      g.lastPan = { x: e.clientX, y: e.clientY };
    }
  }, [applyVb]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const g = gest.current;
    g.pts.delete(e.pointerId);
    if (g.pts.size < 2) g.lastDist = 0;
  }, []);

  const badgeLabel = highlighted ? t(`home.district.${highlighted}`) : null;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <MapPin size={14} className={styles.cardIcon} strokeWidth={2} />
        <span className={styles.cardTitle}>{t('home.district.title')}</span>
      </div>
      <div
        className={styles.mapWrap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          ref={svgRef}
          className={styles.map}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {Object.entries(DISTRICTS).map(([id, dist]) => (
            <path
              key={id}
              d={dist.d}
              className={`${styles.district} ${id === highlighted ? styles.active : ''}`}
              onClick={() => handleTap(id)}
            />
          ))}

        </svg>

        {badgeLabel && (
          <div className={styles.floatingChip}>
            <MapPin size={11} strokeWidth={2.5} />
            <span>{badgeLabel}</span>
          </div>
        )}

        {isZoomed && (
          <button
            className={styles.zoomBtn}
            onClick={() => { setSelected(null); applyVb(FULL); }}
            aria-label={t('common.close', '닫기')}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

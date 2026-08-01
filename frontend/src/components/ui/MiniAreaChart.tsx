import { useCallback } from 'react';
import styles from './MiniAreaChart.module.css';

/* viewBox 좌표계 — SVG 는 width:100% / height:auto 로 균등 스케일된다.
 * 선·링은 vectorEffect="non-scaling-stroke" 로 실제 픽셀 두께를 고정한다. */
const VB_W = 320;
const VB_H = 62;
const PAD_X = 6;
const PAD_TOP = 8;
const PLOT_H = 52;
const BASE_Y = PAD_TOP + PLOT_H; // 60

interface Props {
  /** 일별 값 — 길이는 기간 일수(항상 2 이상, 구멍 없음) */
  values: number[];
  /** 시리즈 색 — 반드시 디자인 토큰 var(...) 를 넘긴다 */
  color: string;
  /** 크로스헤어 위치. 스몰 멀티플 패널들이 공유하도록 상위가 소유한다 */
  activeIndex: number | null;
  onActive: (index: number | null) => void;
  /** 스크린리더용 요약 (값은 표 보기에서도 읽을 수 있다) */
  ariaLabel: string;
}

/**
 * 단일 시리즈 영역 차트(스몰 멀티플 1패널).
 *
 * y 축은 이 패널의 최대값 기준 — 여러 지표를 한 플롯에 이중 축으로 얹지 않는다.
 * 값 읽기는 크로스헤어(상위의 공용 리드아웃) + 표 보기 두 경로로 열려 있다.
 */
export default function MiniAreaChart({ values, color, activeIndex, onActive, ariaLabel }: Props) {
  const n = values.length;
  const max = Math.max(1, ...values);
  const xAt = (i: number) => PAD_X + (i * (VB_W - 2 * PAD_X)) / Math.max(1, n - 1);
  const yAt = (v: number) => PAD_TOP + PLOT_H * (1 - v / max);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
  const area = `${line} L${xAt(n - 1).toFixed(2)},${BASE_Y} L${xAt(0).toFixed(2)},${BASE_Y} Z`;

  const pick = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (rect.width <= 0) return;
      // 마크가 그려지는 범위(좌우 PAD_X 제외)로 정규화해야 크로스헤어가 손가락 위치와 어긋나지 않는다
      const padPx = (PAD_X / VB_W) * rect.width;
      const ratio = (clientX - rect.left - padPx) / (rect.width - padPx * 2);
      const i = Math.round(ratio * (n - 1));
      onActive(Math.min(n - 1, Math.max(0, i)));
    },
    [n, onActive],
  );

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pick(e.clientX, e.currentTarget.getBoundingClientRect());
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      const from = activeIndex ?? (step > 0 ? -1 : n);
      onActive(Math.min(n - 1, Math.max(0, from + step)));
    } else if (e.key === 'Escape') {
      onActive(null);
    }
  };

  return (
    <div
      className={styles.plot}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointer}
      onPointerMove={handlePointer}
      onPointerLeave={() => onActive(null)}
      onBlur={() => onActive(null)}
      onKeyDown={handleKey}
    >
      <svg className={styles.svg} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false">
        {/* 그리드 — 최대선과 0선, 실선 헤어라인, 후퇴색 */}
        <line
          x1={PAD_X}
          y1={PAD_TOP}
          x2={VB_W - PAD_X}
          y2={PAD_TOP}
          stroke="var(--line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={PAD_X}
          y1={BASE_Y}
          x2={VB_W - PAD_X}
          y2={BASE_Y}
          stroke="var(--line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill={color} fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {activeIndex != null && (
          <>
            <line
              x1={xAt(activeIndex)}
              y1={PAD_TOP}
              x2={xAt(activeIndex)}
              y2={BASE_Y}
              stroke="var(--text-3)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={xAt(activeIndex)}
              cy={yAt(values[activeIndex])}
              r={4}
              fill={color}
              stroke="var(--surface)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  );
}

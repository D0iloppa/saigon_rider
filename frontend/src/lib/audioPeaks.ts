/**
 * 음성메시지 파형(peak bar) 계산 — 프론트 전용. 서버는 파형을 저장하지 않는다.
 *
 * 파일을 받아 Web Audio 로 디코딩한 뒤 `bars` 구간으로 나눠 구간별 최대 진폭을 0..1 로 정규화한다.
 * 음성메시지는 최대 60초·수십 KB 라 디코딩 비용이 수 ms 수준이고, 결과는 URL 별로 캐시해
 * 채팅 리스트가 재렌더/스크롤돼도 다시 디코딩하지 않는다.
 */
const cache = new Map<string, Promise<number[]>>();
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

export function computeAudioPeaks(url: string, bars: number): Promise<number[]> {
  const key = `${bars}:${url}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const buf = await fetch(url).then((r) => {
      if (!r.ok) throw new Error(`peaks fetch ${r.status}`);
      return r.arrayBuffer();
    });
    const audio = await getCtx().decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / bars));
    const peaks: number[] = new Array(bars).fill(0);
    for (let i = 0; i < bars; i++) {
      const start = i * step;
      const end = Math.min(start + step, data.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    const top = Math.max(...peaks, 0.01);
    // 최대 진폭 기준 정규화 — 조용한 녹음도 파형이 보이게. 바닥값 0.12 로 무음 구간도 점으로 남긴다.
    return peaks.map((v) => Math.max(0.12, v / top));
  })();
  // 실패는 캐시하지 않는다 — 다음 렌더에 재시도.
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

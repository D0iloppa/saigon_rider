import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { computeAudioPeaks } from '@/lib/audioPeaks';
import { useWalkieTalkieBubbleStore } from '@/store/useWalkieTalkieBubbleStore';
import styles from './VoiceMessageBubble.module.css';

const BAR_COUNT = 40;
// 디코딩 전/실패 시 보여줄 중립 파형 — 빈 칸 대신 자리를 유지한다.
const PLACEHOLDER_PEAKS = Array.from({ length: BAR_COUNT }, (_, i) => 0.2 + 0.15 * Math.abs(Math.sin(i * 0.9)));

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface VoiceMessageBubbleProps {
  audioUrl: string | null;
  durationMs: number;
  isMine: boolean;
  timeLabel: string;
  /** 처음 재생을 시작한 순간 1회 호출 — 읽음 표시용(더 이상 삭제를 유발하지 않는다). */
  onFirstPlay?: () => void;
}

/**
 * 영구 재생 가능한 음성메시지 버블 (Voxer/Zello 스타일, 202608 개편).
 *
 * 파형은 프론트에서 계산한다(`computeAudioPeaks`) — 서버 변경 없음. 재생 진행은 파형 막대의
 * 채움색으로 표현하고, 파형 위를 탭/드래그하면 그 지점으로 이동한다. 시간 표기는 재생 중엔
 * 현재 위치, 정지 상태엔 전체 길이(서버가 준 durationMs).
 */
export function VoiceMessageBubble({ audioUrl, durationMs, isMine, timeLabel, onFirstPlay }: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const playedOnceRef = useRef(false);
  const seekingRef = useRef(false);
  // 반이중 — 캡슐이 녹음 중이면 재생하지 않는다(iOS 는 녹음 중 웹 오디오 재생이 마이크를 끊는다).
  const walkieRecording = useWalkieTalkieBubbleStore((s) => s.recording);

  // 파형 계산은 버블이 화면에 들어올 때 한 번만 — 대화방 진입 시 음성 N개를 동시에 내려받지 않는다.
  useEffect(() => {
    const el = waveRef.current;
    if (!audioUrl || !el) return;
    let cancelled = false;
    const run = () => {
      computeAudioPeaks(audioUrl, BAR_COUNT)
        .then((p) => {
          if (!cancelled) setPeaks(p);
        })
        .catch(() => {
          /* 디코딩 실패(빈 파일 등) — 플레이스홀더 파형 유지 */
        });
    };
    if (typeof IntersectionObserver === 'undefined') {
      run();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [audioUrl]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || walkieRecording) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (!playedOnceRef.current) {
      playedOnceRef.current = true;
      onFirstPlay?.();
    }
    audio.play().catch(() => {});
  };

  const seekToClientX = (clientX: number) => {
    const el = waveRef.current;
    const audio = audioRef.current;
    if (!el || !audio) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setProgress(ratio);
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationMs / 1000;
    if (dur > 0) {
      audio.currentTime = ratio * dur;
      setCurrentMs(ratio * dur * 1000);
    }
  };

  const onWavePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!audioUrl) return;
    seekingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  };
  const onWavePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (seekingRef.current) seekToClientX(e.clientX);
  };
  const onWavePointerUp = () => {
    seekingRef.current = false;
  };

  const bars = peaks ?? PLACEHOLDER_PEAKS;
  const showCurrent = playing || progress > 0;

  return (
    <div className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={toggle}
          disabled={!audioUrl || walkieRecording}
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className={styles.playIcon} />}
        </button>
        <div
          ref={waveRef}
          className={styles.wave}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-disabled={!audioUrl || undefined}
          onPointerDown={onWavePointerDown}
          onPointerMove={onWavePointerMove}
          onPointerUp={onWavePointerUp}
          onPointerCancel={onWavePointerUp}
        >
          {bars.map((v, i) => (
            <i
              key={i}
              data-played={i < Math.round(progress * BAR_COUNT) || undefined}
              style={{ height: `${Math.round(v * 100)}%` }}
            />
          ))}
        </div>
        <span className={`${styles.duration} num`}>{formatDuration(showCurrent ? currentMs : durationMs)}</span>
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setProgress(0);
              setCurrentMs(0);
            }}
            onTimeUpdate={(e) => {
              if (seekingRef.current) return;
              const a = e.currentTarget;
              if (a.duration > 0) {
                setProgress(a.currentTime / a.duration);
                setCurrentMs(a.currentTime * 1000);
              }
            }}
          />
        )}
      </div>
      <div className={styles.meta}>{timeLabel}</div>
    </div>
  );
}

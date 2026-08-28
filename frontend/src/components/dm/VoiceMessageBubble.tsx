import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './VoiceMessageBubble.module.css';

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
 * 종전엔 워키토키 캡슐이 수신 음성을 자동재생하고 재생 즉시 큐에서 사라졌다(대표 피드백
 * "워키토키 같지 않다"). 이제 음성메시지는 일반 메시지처럼 채팅 이력에 영구히 남고,
 * 스크럽바로 아무 때나 다시 재생할 수 있다. 파형 시각화·텍스트변환 등은 범위 밖.
 */
export function VoiceMessageBubble({ audioUrl, durationMs, isMine, timeLabel, onFirstPlay }: VoiceMessageBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const playedOnceRef = useRef(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
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

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const ratio = Number(e.target.value);
    setProgress(ratio);
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = ratio * audio.duration;
    }
  };

  return (
    <div className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={toggle}
          disabled={!audioUrl}
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <input
          type="range"
          className={styles.scrub}
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={onSeek}
          disabled={!audioUrl}
        />
        <span className={styles.duration}>{formatDuration(durationMs)}</span>
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
            }}
            onTimeUpdate={(e) => {
              const a = e.currentTarget;
              if (a.duration > 0) setProgress(a.currentTime / a.duration);
            }}
          />
        )}
      </div>
      <div className={styles.meta}>{timeLabel}</div>
    </div>
  );
}

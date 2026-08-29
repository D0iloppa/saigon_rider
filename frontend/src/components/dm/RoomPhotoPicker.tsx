import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import styles from './RoomPhotoPicker.module.css';

/**
 * 방 사진 선택기 — 숨은 file input + 원형 아바타 버튼 + 카메라 배지.
 * 그룹 개설(DmGroupCreate)과 방 설정(GroupSettingsSheet)이 같은 UI 를 쓴다.
 * 업로드/저장 방식은 화면마다 달라(개설은 content id 만 보관, 설정은 즉시 PATCH)
 * 파일만 넘기고 처리는 호출부에 맡긴다.
 */
export function RoomPhotoPicker({
  src,
  name,
  seed,
  disabled,
  onFile,
  size = 72,
}: {
  src?: string | null;
  name: string;
  seed?: string;
  disabled?: boolean;
  onFile: (file: File) => void | Promise<void>;
  size?: number;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.photoRow}>
      <button
        type="button"
        className={styles.photoBtn}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label={t('dm.settingsPhotoChange', { defaultValue: '방 사진 바꾸기' })}
      >
        <Avatar src={src} name={name} seed={seed} size={size} />
        <span className={styles.photoBadge}>
          <Camera size={14} />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // 같은 파일 재선택 허용
          if (file) void onFile(file);
        }}
      />
    </div>
  );
}

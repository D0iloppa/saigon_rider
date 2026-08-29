import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImagePlus, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { api } from '@/api/client';
import { createChannelPost } from '@/api/dmChannels';
import { useUserStore } from '@/store/useUserStore';
import styles from './DmBoardCompose.module.css';

const MAX_IMAGES = 4;

/**
 * 게시판 글쓰기 (init/218, P1) — 본문 + 사진 최대 4장.
 * 사진은 앱 표준 업로드 관용구(/contents/upload → content id)로 올리고, 글에는 id 만 실어 보낸다.
 * 금칙어는 서버가 400 `banned_keyword` 로 막는다 — DmDetail 전송과 같은 문구로 안내한다.
 */
export default function DmBoardCompose() {
  const { conversationId = '' } = useParams();
  const [params] = useSearchParams();
  const channelId = params.get('channel') ?? '';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const me = useUserStore((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);

  const [body, setBody] = useState('');
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // 채널 없이 들어오면(직접 URL 등) 쓸 수 없는 폼이라 게시판으로 되돌린다 — 채널은 거기서 고른다.
  useEffect(() => {
    if (!channelId) navigate(`/dm/${conversationId}/board`, { replace: true });
  }, [channelId, conversationId, navigate]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file || !me || busy || images.length >= MAX_IMAGES) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      form.append('owner_id', me.id);
      // 업로드 응답이 imgproxy URL 을 실어준다 — 미리보기도 <AppImage> 로 서버 URL 을 그대로 쓴다
      const res = await api.realFetchForm<{ id: string; imgproxy_url?: string }>('/contents/upload', form, 'bff', {
        rethrow: true,
      });
      setImages((prev) => [...prev, { id: res.id, url: res.imgproxy_url ?? '' }]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!body.trim() || !channelId || busy) return;
    setBusy(true);
    try {
      await createChannelPost(
        conversationId,
        channelId,
        body.trim(),
        images.map((i) => i.id),
      );
      navigate(`/dm/${conversationId}/board`, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(
        msg.includes('banned_keyword')
          ? t('dm.bannedKeyword', { defaultValue: '금지된 표현이 포함되어 있습니다' })
          : t('common.errorUnexpected'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!channelId) return null;

  return (
    <div className={styles.page}>
      <TopBar
        title={t('dm.board.postCompose', { defaultValue: '글쓰기' })}
        rightContent={
          <button
            type="button"
            className={styles.submitBtn}
            disabled={!body.trim() || !channelId || busy}
            onClick={handleSubmit}
          >
            {t('dm.board.postSubmit', { defaultValue: '올리기' })}
          </button>
        }
      />

      <div className={styles.body}>
        <textarea
          className={styles.textarea}
          value={body}
          placeholder={t('dm.board.postPlaceholder', { defaultValue: '방 사람들과 나눌 이야기를 적어보세요' })}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className={styles.images}>
          {images.map((img) => (
            <span key={img.id} className={styles.thumb}>
              <AppImage src={img.url} alt="" />
              <button
                type="button"
                className={styles.thumbRemove}
                onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                aria-label={t('dm.board.removeImage', { defaultValue: '사진 빼기' })}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              className={styles.addImage}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              aria-label={t('dm.board.addImage', { defaultValue: '사진 추가' })}
            >
              <ImagePlus size={20} />
              <span className={`${styles.addImageCount} num`}>
                {images.length}/{MAX_IMAGES}
              </span>
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleImageSelect} />
      </div>
    </div>
  );
}

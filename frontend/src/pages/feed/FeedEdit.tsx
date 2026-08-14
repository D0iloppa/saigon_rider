import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, MapPin, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { fetchFeedPost, updateFeedPost } from '@/api/feed';
import { api } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { useConfirmStore } from '@/store/useConfirmStore';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { native } from '@/lib/native';
import { requireServiceLocation } from '@/lib/serviceLocation';
import { useKeyboard } from '@/hooks/useKeyboard';
import styles from './FeedCreate.module.css';

const MAX_IMAGES = 10;

interface ExistingImage {
  type: 'existing';
  url: string;
  contentId: string;
}

interface NewImage {
  type: 'new';
  file: File;
  preview: string;
  contentId: string | null;
  uploading: boolean;
}

type ImageSlot = ExistingImage | NewImage;

export default function FeedEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const user = useUserStore((s) => s.user);
  const openConfirm = useConfirmStore((s) => s.open);

  const [content, setContent] = useState('');
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const kb = useKeyboard();
  const [originalContent, setOriginalContent] = useState('');
  const draftKey = postId ? `feedEdit:draft:${postId}` : null;
  // iOS 네이티브는 키보드가 순수 오버레이라 textarea 아래 여백이 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  // P2-13: 조회 실패가 "로딩만 영원히 도는" 무응답이 되지 않도록 error+재시도를 제공한다.
  const loadPost = () => {
    if (!postId) return;
    setLoadError(false);
    fetchFeedPost(postId).then((post) => {
      const fullText = [
        post.caption ?? '',
        ...post.hashtags.map((t) => `#${t}`),
      ].filter(Boolean).join(' ');
      setOriginalContent(fullText);

      // 텍스트 초안을 세션 단위로 보존 (P1-7) — 이전 세션에서 이탈 시 남긴 초안이 있으면 복원한다.
      let restored = fullText;
      try {
        const draft = draftKey ? sessionStorage.getItem(draftKey) : null;
        if (draft != null) restored = draft;
      } catch { /* ignore */ }
      setContent(restored);

      if (post.photoUrls.length > 0) {
        setImageSlots(post.photoUrls.map((url, i) => ({
          type: 'existing' as const,
          url,
          contentId: post.imageContentIds[i] ?? '',
        })));
      }
      if (post.latitude != null && post.longitude != null) {
        setLocation({ lat: post.latitude, lng: post.longitude });
      }
      setLoaded(true);
    }).catch(() => setLoadError(true));
  };

  useEffect(loadPost, [postId, draftKey]);

  useEffect(() => {
    if (!loaded || !draftKey) return;
    try {
      if (content !== originalContent) sessionStorage.setItem(draftKey, content);
      else sessionStorage.removeItem(draftKey);
    } catch { /* ignore */ }
  }, [content, loaded, draftKey, originalContent]);

  const isDirty = loaded && (
    content !== originalContent ||
    imageSlots.some((s) => s.type === 'new')
  );

  const handleBackAttempt = () => {
    if (!isDirty) {
      navigate(-1);
      return;
    }
    openConfirm(
      t('feedEdit.leaveConfirmMsg', { defaultValue: '수정 중인 내용이 있습니다. 저장하지 않고 나가시겠어요?' }),
      () => {
        try { if (draftKey) sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
        navigate(-1);
      },
      {
        confirmLabel: t('feedEdit.leaveConfirmDiscard', { defaultValue: '나가기' }),
        cancelLabel: t('feedEdit.leaveConfirmKeep', { defaultValue: '계속 수정' }),
      },
    );
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    const slots = MAX_IMAGES - imageSlots.length;
    const toAdd = files.slice(0, slots);

    const newItems: NewImage[] = toAdd.map((f) => ({
      type: 'new',
      file: f,
      preview: URL.createObjectURL(f),
      contentId: null,
      uploading: true,
    }));
    const startIdx = imageSlots.length;
    setImageSlots((prev) => [...prev, ...newItems]);

    for (let i = 0; i < toAdd.length; i++) {
      try {
        const form = new FormData();
        form.append('file', toAdd[i]);
        form.append('owner_type', 'user');
        if (user) form.append('owner_id', user.id);
        const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
        setImageSlots((prev) =>
          prev.map((slot, idx) => {
            if (idx !== startIdx + i || slot.type !== 'new') return slot;
            return { ...slot, contentId: res.id, uploading: false };
          }),
        );
      } catch (err: any) {
        toast.error(err.message ?? t('feedCreate.uploadError'));
        setImageSlots((prev) =>
          prev.map((slot, idx) => {
            if (idx !== startIdx + i || slot.type !== 'new') return slot;
            return { ...slot, uploading: false };
          }),
        );
      }
    }
  };

  const handleLocation = async () => {
    if (location) {
      setLocation(null);
      return;
    }
    // 위치 태그는 게시글에 함께 저장되는 **기록형** — 권역 밖/부정확 좌표는 태그하지 않는다
    // (260813 정책안 §1). 중심가 폴백을 붙이면 사용자가 있지도 않은 곳이 게시글에 남는다.
    const gate = await requireServiceLocation();
    if (!gate.ok) {
      // 서비스 지역/측위 상태 안내는 오류가 아니라 상태다 — 톤은 neutral 로 통일한다
      // (대표 결정 2026-08-13). 경로 차단 토스트와 같은 톤이어야 한 화면에서 갈리지 않는다.
      toast.neutral(t(`locationGate.${gate.reason}.title`));
      return;
    }
    setLocation(gate.coords);
  };

  const removeSlot = (idx: number) => {
    setImageSlots((prev) => {
      const removed = prev[idx];
      if (removed?.type === 'new' && removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSave = async () => {
    if (saving) return;
    if (!user || !postId) return;
    setSaving(true);
    try {
      const contentIds = imageSlots
        .map((s) => s.contentId)
        .filter((id): id is string => !!id);

      await updateFeedPost(postId, {
        userId: user.id,
        content: content.trim() || undefined,
        imageContentIds: contentIds,
        latitude: location?.lat,
        longitude: location?.lng,
        updateLocation: true,
      });
      toast.success(t('feedEdit.saveSuccess'));
      try { if (draftKey) sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      navigate('/profile', { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? t('feedEdit.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const allUploaded = imageSlots.every((s) => s.type === 'existing' || !s.uploading);
  const canSave = !saving && loaded && allUploaded;

  if (loadError) {
    return (
      <div className={styles.page}>
        <TopBar title={t('feedEdit.title')} onBack={handleBackAttempt} />
        <StateBlock
          icon={AlertCircle}
          tone="error"
          title={t('feedEdit.loadError')}
          actionLabel={t('common.retry')}
          onAction={loadPost}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar
        title={t('feedEdit.title')}
        onBack={handleBackAttempt}
        rightContent={
          <Button
            onClick={handleSave}
            disabled={!canSave}
            loading={saving}
            style={{ minWidth: 64 }}
          >
            {saving ? t('feedEdit.saving') : t('feedEdit.saveBtn')}
          </Button>
        }
      />

      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        <div className={styles.card}>
          <textarea
            className={styles.textarea}
            placeholder={t('feedCreate.textPlaceholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={2000}
          />

          {imageSlots.length > 0 && (
            <div className={styles.previewGrid}>
              {imageSlots.map((slot, idx) => (
                <div key={idx} className={styles.previewItem}>
                  {slot.type === 'existing' ? (
                    <AppImage src={slot.url} alt="" className={styles.previewThumb} />
                  ) : (
                    <>
                      <img src={slot.preview} alt="" className={styles.previewThumb} />
                      {slot.uploading && (
                        <div className={styles.uploadingOverlay}>
                          <span className={`shimmer ${styles.uploadingBar}`} />
                        </div>
                      )}
                    </>
                  )}
                  <button className={styles.removeImg} aria-label={t('feedCreate.removeImage')} onClick={() => removeSlot(idx)}>
                    <X size={13} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.toolBtn}>
            <Camera size={16} strokeWidth={2.2} />
            {t('feedCreate.addPhoto')} {imageSlots.length > 0 && `(${imageSlots.length}/${MAX_IMAGES})`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={imageSlots.length >= MAX_IMAGES}
            />
          </label>

          <button
            className={`${styles.toolBtn} ${location ? styles.toolBtnActive : ''}`}
            onClick={handleLocation}
          >
            <MapPin size={16} strokeWidth={2.2} />
            {location ? t('feedCreate.locationAttached') : t('feedCreate.addLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Globe, Lock, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { AppImage } from '@/components/ui/AppImage';
import { api } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { createGroup } from '@/api/community_groups';
import { toast } from '@/components/ui/Toast';
import feedStyles from '@/pages/feed/FeedList.module.css';
import feedCreateStyles from '@/pages/feed/FeedCreate.module.css';
import styles from '@/pages/dm/DmGroupCreate.module.css';
import communityStyles from './Community.module.css';

type Visibility = 'public' | 'private';
type JoinPolicy = 'open' | 'approval';

// 그룹 개설 폼 — 최소 필드(이름/설명/공개여부/가입정책). DmGroupCreate/FeedCreate CSS 재사용, 신규 카드 디자인 없음.
export default function GroupCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('open');
  const [submitting, setSubmitting] = useState(false);
  const user = useUserStore((s) => s.user);
  const [cover, setCover] = useState<{ preview: string; contentId: string | null; uploading: boolean } | null>(null);

  const coverTokenRef = useRef(0);
  const previewRef = useRef<string | null>(null);

  const dropCover = () => {
    coverTokenRef.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setCover(null);
  };

  // 언마운트(생성 성공 후 이동 포함) 시 미리보기 URL 해제 + 진행 중 업로드 결과 무시
  useEffect(() => () => {
    coverTokenRef.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const token = ++coverTokenRef.current;
    const preview = URL.createObjectURL(file);
    previewRef.current = preview;
    setCover({ preview, contentId: null, uploading: true });
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      if (user) form.append('owner_id', user.id);
      const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      if (token !== coverTokenRef.current) return;
      setCover({ preview, contentId: res.id, uploading: false });
    } catch (err: any) {
      if (token !== coverTokenRef.current) return;
      toast.error(err.message ?? t('feedCreate.uploadError'));
      dropCover();
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || submitting || cover?.uploading) return;
    setSubmitting(true);
    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        joinPolicy,
        coverContentId: cover?.contentId ?? undefined,
      });
      navigate(`/group/${group.slug ?? group.id}`, { replace: true });
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.createTitle')} />
      <div className={styles.body}>
        <label className={communityStyles.coverPicker} data-testid="group-cover-picker" aria-label={t('communityGroup.coverLabel')}>
          {cover ? (
            <>
              <AppImage src={cover.preview} alt="" className={communityStyles.coverPreview} />
              <button
                type="button"
                className={communityStyles.coverRemove}
                aria-label={t('communityGroup.coverRemove')}
                onClick={(e) => { e.preventDefault(); dropCover(); }}
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <span className={communityStyles.coverPickerInner}>
              <Camera size={22} />
              {t('communityGroup.coverLabel')}
            </span>
          )}
          <input
            className={communityStyles.hiddenInput}
            data-testid="group-cover-input"
            type="file"
            accept="image/*"
            onChange={handleCoverSelect}
          />
        </label>
        <input
          className={styles.titleInput}
          type="text"
          placeholder={t('communityGroup.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
        <textarea
          className={feedCreateStyles.textarea}
          placeholder={t('communityGroup.descPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={500}
        />

        <div className={feedStyles.filterRow} role="radiogroup" aria-label={t('communityGroup.visibility')}>
          <Chip
            as="button"
            variant={visibility === 'public' ? 'dark' : 'surface'}
            role="radio"
            aria-checked={visibility === 'public'}
            onClick={() => setVisibility('public')}
            style={{ cursor: 'pointer' }}
          >
            <Globe size={13} strokeWidth={2.2} />
            {t('communityGroup.visibilityPublic')}
          </Chip>
          <Chip
            as="button"
            variant={visibility === 'private' ? 'dark' : 'surface'}
            role="radio"
            aria-checked={visibility === 'private'}
            onClick={() => setVisibility('private')}
            style={{ cursor: 'pointer' }}
          >
            <Lock size={13} strokeWidth={2.2} />
            {t('communityGroup.visibilityPrivate')}
          </Chip>
        </div>

        <div className={feedStyles.filterRow} role="radiogroup" aria-label={t('communityGroup.joinPolicy')}>
          <Chip
            as="button"
            variant={joinPolicy === 'open' ? 'dark' : 'surface'}
            role="radio"
            aria-checked={joinPolicy === 'open'}
            onClick={() => setJoinPolicy('open')}
            style={{ cursor: 'pointer' }}
          >
            {t('communityGroup.joinPolicyOpen')}
          </Chip>
          <Chip
            as="button"
            variant={joinPolicy === 'approval' ? 'dark' : 'surface'}
            role="radio"
            aria-checked={joinPolicy === 'approval'}
            onClick={() => setJoinPolicy('approval')}
            style={{ cursor: 'pointer' }}
          >
            {t('communityGroup.joinPolicyApproval')}
          </Chip>
        </div>
      </div>
      <div className={styles.submitBar}>
        <Button onClick={handleCreate} disabled={!name.trim() || submitting || !!cover?.uploading} loading={submitting}>
          {t('communityGroup.createSubmit')}
        </Button>
      </div>
    </div>
  );
}

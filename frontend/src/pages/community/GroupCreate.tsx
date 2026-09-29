import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Check, Globe, Lock, UserCheck, UserPlus, X, type LucideProps } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { api } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { createGroup, getGroup, patchGroup } from '@/api/community_groups';
import { toast } from '@/components/ui/Toast';
import type { CommunityGroup } from '@/api/types';
import { pickTopicLabel, useGroupTopics } from './groupTopics';
import styles from './GroupCreate.module.css';

type Visibility = 'public' | 'private';
type JoinPolicy = 'open' | 'approval';

const NAME_MAX = 60;
const DESC_MAX = 500;

function OptionRow({ active, icon: Icon, title, desc, onSelect }: {
  active: boolean;
  icon: ComponentType<LucideProps>;
  title: string;
  desc: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`${styles.option} ${active ? styles.optionActive : ''}`}
      onClick={onSelect}
    >
      <span className={styles.optionIcon}><Icon size={18} strokeWidth={2.2} /></span>
      <span className={styles.optionBody}>
        <span className={styles.optionTitle}>{title}</span>
        <span className={styles.optionDesc}>{desc}</span>
      </span>
      <span className={styles.optionCheck} aria-hidden="true">{active && <Check size={12} strokeWidth={3} />}</span>
    </button>
  );
}

// 그룹 개설 폼 — 기본 정보(커버·이름·소개) / 주제(필수·고정 목록 1개) / 공개 여부 / 가입 방식 3섹션 (F-CM-02 FR-1 r14).
// 선택지는 기존 옵션(public|private, open|approval)만 — 새 정책 없음.
export default function GroupCreate() {
  const { t, i18n } = useTranslation();
  const topics = useGroupTopics();
  const navigate = useNavigate();
  // /group/:slug/edit 이면 편집 모드 — 같은 폼을 getGroup 값으로 채우고 PATCH 로 저장
  const { slug } = useParams<{ slug: string }>();
  const isEdit = !!slug;
  const [editGroup, setEditGroup] = useState<CommunityGroup | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy | 'invite'>('open');
  const [submitting, setSubmitting] = useState(false);
  const user = useUserStore((s) => s.user);
  const [cover, setCover] = useState<{ preview: string; contentId: string | null; uploading: boolean } | null>(null);

  useEffect(() => {
    if (!slug) return;
    getGroup(slug)
      .then((g) => {
        setEditGroup(g);
        setName(g.name);
        setDescription(g.description ?? '');
        setTopic(g.topic);
        setVisibility(g.visibility as Visibility);
        setJoinPolicy(g.joinPolicy as JoinPolicy | 'invite');
      })
      .catch(() => {
        toast.error(t('communityGroup.notFound'));
        navigate(-1);
      });
  }, [slug, navigate, t]);

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
    if (!name.trim() || !topic || submitting || cover?.uploading) return;
    if (isEdit && !editGroup) return;
    setSubmitting(true);
    try {
      if (editGroup) {
        const saved = await patchGroup(editGroup.id, {
          name: name.trim(),
          topic,
          description: description.trim() || undefined,
          visibility,
          joinPolicy,
          coverContentId: cover?.contentId ?? undefined,
        });
        navigate(`/group/${saved.slug ?? saved.id}`, { replace: true });
        return;
      }
      const group = await createGroup({
        name: name.trim(),
        topic,
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
      <TopBar title={t(isEdit ? 'communityGroup.editTitle' : 'communityGroup.createTitle')} />
      <div className={styles.body}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('communityGroup.basicInfo')}</h2>

          <label className={styles.coverRow} data-testid="group-cover-picker" aria-label={t('communityGroup.coverLabel')}>
            <span className={`${styles.coverThumb} ${cover || editGroup?.coverUrl ? styles.coverThumbFilled : ''}`}>
              {cover || editGroup?.coverUrl
                ? <AppImage src={cover?.preview ?? editGroup!.coverUrl!} alt="" className={styles.coverPreview} />
                : <Camera size={22} />}
              {cover?.uploading && <span className={styles.coverUploading}>{t('communityGroup.coverUploading')}</span>}
            </span>
            <span className={styles.coverBody}>
              <span className={styles.coverTitle}>
                {t('communityGroup.coverLabel')}
                <span className={styles.optional}>{t('communityGroup.optional')}</span>
              </span>
              <span className={styles.coverHint}>{t('communityGroup.coverHint')}</span>
              <span className={styles.coverAction}>{cover || editGroup?.coverUrl ? t('communityGroup.coverChange') : t('communityGroup.coverPick')}</span>
            </span>
            {cover && (
              <button
                type="button"
                className={styles.coverRemove}
                aria-label={t('communityGroup.coverRemove')}
                onClick={(e) => { e.preventDefault(); dropCover(); }}
              >
                <X size={16} />
              </button>
            )}
            <input
              className={styles.hiddenInput}
              data-testid="group-cover-input"
              type="file"
              accept="image/*"
              onChange={handleCoverSelect}
            />
          </label>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="group-create-name">{t('communityGroup.nameLabel')}</label>
            <input
              id="group-create-name"
              className={styles.input}
              type="text"
              placeholder={t('communityGroup.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
            />
            <div className={styles.counter}>{name.length}/{NAME_MAX}</div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="group-create-desc">
              {t('communityGroup.descLabel')}
              <span className={styles.optional}>{t('communityGroup.optional')}</span>
            </label>
            <textarea
              id="group-create-desc"
              className={styles.textarea}
              placeholder={t('communityGroup.descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={DESC_MAX}
            />
            <div className={styles.counter}>{description.length}/{DESC_MAX}</div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('communityGroup.topicLabel')}</h2>
          <p className={styles.sectionHint}>{t('communityGroup.topicHint')}</p>
          <div className={styles.chips} role="radiogroup" aria-label={t('communityGroup.topicLabel')} data-testid="group-create-topics">
            {topics.map(({ code: c, labels }) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={topic === c}
                data-testid={`group-create-topic-${c}`}
                className={`${styles.chip} ${topic === c ? styles.chipActive : ''}`}
                onClick={() => setTopic(c)}
              >
                {pickTopicLabel(labels, i18n.language)}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('communityGroup.visibility')}</h2>
          <div className={styles.options} role="radiogroup" aria-label={t('communityGroup.visibility')}>
            <OptionRow
              active={visibility === 'public'}
              icon={Globe}
              title={t('communityGroup.visibilityPublic')}
              desc={t('communityGroup.visibilityPublicDesc')}
              onSelect={() => setVisibility('public')}
            />
            <OptionRow
              active={visibility === 'private'}
              icon={Lock}
              title={t('communityGroup.visibilityPrivate')}
              desc={t('communityGroup.visibilityPrivateDesc')}
              onSelect={() => setVisibility('private')}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('communityGroup.joinPolicy')}</h2>
          <div className={styles.options} role="radiogroup" aria-label={t('communityGroup.joinPolicy')}>
            <OptionRow
              active={joinPolicy === 'open'}
              icon={UserPlus}
              title={t('communityGroup.joinPolicyOpen')}
              desc={t('communityGroup.joinPolicyOpenDesc')}
              onSelect={() => setJoinPolicy('open')}
            />
            <OptionRow
              active={joinPolicy === 'approval'}
              icon={UserCheck}
              title={t('communityGroup.joinPolicyApproval')}
              desc={t('communityGroup.joinPolicyApprovalDesc')}
              onSelect={() => setJoinPolicy('approval')}
            />
          </div>
        </section>
      </div>
      <div className={styles.submitBar}>
        <Button onClick={handleCreate} disabled={!name.trim() || !topic || submitting || !!cover?.uploading || (isEdit && !editGroup)} loading={submitting} data-testid={isEdit ? 'group-edit-save' : undefined}>
          {t(isEdit ? 'communityGroup.editSubmit' : 'communityGroup.createSubmit')}
        </Button>
      </div>
    </div>
  );
}

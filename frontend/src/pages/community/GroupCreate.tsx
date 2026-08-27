import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, Lock } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { createGroup } from '@/api/community_groups';
import { toast } from '@/components/ui/Toast';
import feedStyles from '@/pages/feed/FeedList.module.css';
import feedCreateStyles from '@/pages/feed/FeedCreate.module.css';
import styles from '@/pages/dm/DmGroupCreate.module.css';

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

  const handleCreate = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        joinPolicy,
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
        <Button onClick={handleCreate} disabled={!name.trim() || submitting} loading={submitting}>
          {t('communityGroup.createSubmit')}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { useUserStore } from '@/store/useUserStore';
import { fetchFollowing } from '@/api/follows';
import { createGroupConversation } from '@/api/dm';
import { toast } from '@/components/ui/Toast';
import type { FollowUser } from '@/api/types';
import styles from './DmGroupCreate.module.css';

// 새 그룹톡방 생성 — 초대 후보는 **내가 팔로우하는 사람 전체**(대표 지시 2026-08-28로 맞팔에서 확대).
// 맞팔(친구)은 팔로잉의 부분집합이라 함께 나온다. 서버도 같은 기준을 강제한다
// (backend `require_invite_eligible`) — 종전엔 서버 무검증이라 UI 관례에 불과했다.
// 초대 후보(팔로잉) 이어받기 상한 — 20명/페이지 × 10 = 200명. 이보다 많이 팔로우하는 사용자가
// 나오면 이 화면에 검색 입력이 필요하다(현재는 전체 목록 체크박스 방식).
const MAX_CANDIDATE_PAGES = 10;

export default function DmGroupCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useUserStore((s) => s.user);
  const [friends, setFriends] = useState<FollowUser[]>([]);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    // 팔로잉은 맞팔 목록보다 훨씬 길어질 수 있는데 API 는 20명씩 끊어 준다. 이 화면엔 검색·무한
    // 스크롤이 없어서 첫 페이지만 받으면 21번째 이후 팔로잉은 **초대할 방법이 아예 없다**
    // (서버도 팔로잉 외 초대를 거부하므로 우회 경로도 없다). 전량을 이어 받는다.
    (async () => {
      const acc: FollowUser[] = [];
      for (let page = 1; page <= MAX_CANDIDATE_PAGES; page += 1) {
        const r = await fetchFollowing(me.id, page);
        acc.push(...r.items);
        if (r.items.length === 0 || acc.length >= r.total) break;
      }
      if (!cancelled) setFriends(acc);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!title.trim() || selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const conv = await createGroupConversation(title.trim(), Array.from(selected));
      navigate(`/dm/${conv.id}`, { replace: true, state: { conv } });
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('dm.createGroup', { defaultValue: '그룹 만들기' })} />
      <div className={styles.body}>
        <input
          className={styles.titleInput}
          type="text"
          placeholder={t('dm.groupTitlePlaceholder', { defaultValue: '방 이름' })}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {friends.length === 0 ? (
          <StateBlock icon={Users} title={t('follow.emptyFollowing')} />
        ) : (
          <div className={styles.list}>
            {friends.map((u) => (
              <label key={u.id} className={styles.row}>
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                />
                <AppImage src={u.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                <span className={styles.name}>{u.nickname ?? 'Unknown'}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className={styles.submitBar}>
        <Button onClick={handleCreate} disabled={!title.trim() || selected.size === 0 || submitting}>
          {t('dm.createGroupSubmit', { defaultValue: '만들기' })}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { RoomPhotoPicker } from '@/components/dm/RoomPhotoPicker';
import { api } from '@/api/client';
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
  // 방 사진 — 개설 전에 미리 업로드해 content id 만 들고 있다가 생성 요청에 실어보낸다
  const [photoContentId, setPhotoContentId] = useState<string | undefined>();
  const [photoPreview, setPhotoPreview] = useState<string | undefined>();

  // 미리보기 blob URL 은 교체·이탈 시 해제한다 (안 하면 세션 내내 메모리에 남는다)
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

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

  const handlePhotoFile = async (file: File) => {
    if (!me || submitting) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      form.append('owner_id', me.id);
      const { id } = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      setPhotoContentId(id);
      // 이전 URL 해제는 아래 useEffect 정리 함수가 전담한다(중복 revoke 방지)
      setPhotoPreview(URL.createObjectURL(file));
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const conv = await createGroupConversation(title.trim(), Array.from(selected), photoContentId);
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
        <div className={styles.photoWrap}>
          <RoomPhotoPicker
            src={photoPreview}
            name={title || '?'}
            disabled={submitting}
            onFile={handlePhotoFile}
          />
        </div>
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
                <Avatar src={u.avatarUrl} name={u.nickname ?? u.id} seed={u.id} size={40} />
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

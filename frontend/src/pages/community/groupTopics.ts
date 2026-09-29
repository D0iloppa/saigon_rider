import { useEffect, useState } from 'react';
import { listGroupTopics } from '@/api/community_groups';
import type { GroupTopic, GroupTopicLabels } from '@/api/types';

// 그룹 주제는 서버 테이블(community_group_topics)이 SoT — 코드·라벨을 프론트에 두지 않는다.
let cache: Promise<GroupTopic[]> | null = null;

export function useGroupTopics(): GroupTopic[] {
  const [topics, setTopics] = useState<GroupTopic[]>([]);
  useEffect(() => {
    let alive = true;
    cache ??= listGroupTopics().catch((e) => { cache = null; throw e; });
    cache.then((r) => alive && setTopics(r)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return topics;
}

export function pickTopicLabel(labels: GroupTopicLabels | null, lang: string): string {
  if (!labels) return '';
  const l = lang.slice(0, 2) as keyof GroupTopicLabels;
  return labels[l] || labels.en || labels.ko;
}

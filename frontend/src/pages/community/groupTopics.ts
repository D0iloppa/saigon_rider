// 그룹 주제 고정 목록 (대표 승인 260929, F-CM-02 r15) — 코드는 서버 GroupTopic·DB CHECK(248)와 동일.
export const GROUP_TOPICS = [
  'neighborhood_friends',
  'riding_tour',
  'sports',
  'food_cafe',
  'language_exchange',
  'hobby',
  'self_dev',
  'family',
  'pets',
  'etc',
] as const;

export type GroupTopic = (typeof GROUP_TOPICS)[number];

export const groupTopicKey = (code: string) => `communityGroup.topics.${code}`;

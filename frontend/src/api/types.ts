// 도메인 타입 정의 (기획서 §2 DB 스키마 기반) 
import type { District, RiderType, SafetyGrade as SafetyGradeMaster } from './master';

export type RiderStyle = 'commuter' | 'cafe_hunter' | 'night_rider';
export type QuestType = 'daily' | 'weekly' | 'event';
export type QuestStatus = 'available' | 'locked' | 'completed';
export type AttemptStatus = 'in_progress' | 'success' | 'failed' | 'abandoned';
export type SafetyGrade = 'A' | 'B' | 'C';
export type SkillKey = 'distance_rider' | 'gold_hunter' | 'quest_slot' | 'cost_discount' | 'mileage_rate';
export type Language = 'ko' | 'vi' | 'en';

export interface User {
  id: string;
  phone: string | null;
  phoneVerified: boolean;
  nickname: string;
  riderStyle: RiderStyle;
  avatarUrl?: string;
  level: number;
  levelExp: number;        // 누적 레벨 EXP
  xpPoints: number;        // 소모 가능 XP
  gold: number;
  skillPoints: number;
  mannerTemp: number;
  language: Language;
  skills: Record<SkillKey, number>;  // 각 스킬 레벨 0~3
  createdAt: string;
  // F-9: null=동의 미기록(서비스 진입 차단 대상), undefined=판정 불가(차단하지 않음).
  consentAgreedAt?: string | null;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  questType: QuestType;
  district: District | null;
  districtName: string;
  riderType: RiderType | null;
  minLevel: number;
  minDistanceM: number;
  cardType?: 'DISTANCE' | 'CHECKPOINT' | 'COUNT_EVENT' | 'COUNT_DISTINCT';
  targetLat?: number | null;
  targetLng?: number | null;
  maxDurationSec: number | null;
  timeRestriction: { from: string; to: string } | null;
  safetyGrade: SafetyGradeMaster | null;
  rewardExp: number;
  rewardXpPoints: number;
  rewardGold: number;
  rewardItems: Array<{ key: string; name: string }>;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: ('HOT' | 'NEW' | 'LIMITED')[];
  thumbnailUrl: string;
  thumbnailUrls: string[];
  thumbnailImageUrl?: string | null;
  mainImageUrl?: string | null;
  bannerImageUrl?: string | null;
  expiresAt?: string;
  missionCode?: string | null;
  rarity?: 'C' | 'R' | 'E' | 'L' | 'M';
  csv?: string | null; // 정적 SVG 카드 id(카드코드) → sprite #card-{csv}
}

export interface QuestAttempt {
  id: string;
  userId: string;
  questId: string;
  status: AttemptStatus;
  startedAt: string;
  endedAt?: string;
  distanceM: number;
  durationSec: number;
  safetyGrade?: SafetyGrade;
  expEarned?: number;
  xpEarned?: number;
  goldEarned?: number;
  itemsEarned?: Array<{ key: string; name: string }>;
}

export interface FeedPost {
  id: string;
  userId: string;
  userNickname: string | null;
  userAvatarUrl?: string | null;
  userLevel: number;
  attemptId?: string;
  questTitle?: string;
  photoUrl: string | null;
  photoUrls: string[];
  imageContentIds: string[];
  caption: string | null;
  hashtags: string[];
  translationFailed?: boolean;
  distanceKm: number | null;
  safetyGrade: SafetyGrade | null;
  rewardExp: number | null;
  cheerCount: number;
  commentCount: number;
  iCheered: boolean;
  createdAt: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Comment {
  id: string;
  postId: string;
  userNickname: string;
  userAvatarUrl?: string;
  content: string;
  createdAt: string;
  likeCount: number;
  iLiked: boolean;
  parentId?: string;
}

export interface Badge {
  key: string;
  name: string;
  description: string;
  condition: string;
  iconEmoji: string;
  earned: boolean;
  earnedAt?: string;
}

export interface BadgeData {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  condition_type: string | null;
  condition_value: number | null;
  condition_rule: ConditionRule | null;
  name_ko: string | null;
  name_vi: string | null;
  name_en: string | null;
  description_ko: string | null;
  description_vi: string | null;
  description_en: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ConditionRule {
  operator: 'AND' | 'OR';
  conditions: Array<{ metric: string; op: string; value: number }>;
}

export interface BadgeWithEarned {
  badge: BadgeData;
  earned: boolean;
  acquired_at: string | null;
}

export interface QuestHistoryItem {
  id: string;
  quest_id: string;
  quest_title: string | null;
  distance_km: number | null;
  safety_grade: string | null;
  reward_exp: number;
  reward_gold: number;
  completed_at: string | null;
}

export interface UserStats {
  month: string;
  total_km: number;
  lifetime_km: number;
  quest_count: number;
  avg_safety_grade: string | null;
  review_count: number;
  avg_rating: number | null;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface FollowUser {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  isFollowing: boolean; // 뷰어(세션 유저) 기준 팔로우 여부
}

export interface UserProfile {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  riderStyle: string | null;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFriend: boolean; // 맞팔 여부 (P4-4)
  isPhoneVerified: boolean;
  phoneMasked: string | null;
}

export interface DmConversation {
  id: string;
  /** direct 에서만 non-null — group/open 은 null (260827 group/open 확장) */
  otherUserId: string | null;
  otherUserNickname: string | null;
  otherUserAvatarUrl: string | null;
  lastMessagePreview: string | null;
  /** 마지막 메시지 타입 — price_offer/appointment 미리보기를 뷰어 로케일로 조립 (DM-5) */
  lastMessageType: string | null;
  lastMessageMeta: { amount?: number; when?: string; place?: string | null } | null;
  lastMessageAt: string;
  unreadCount: number;
  contextType: string | null;
  contextId: string | null;
  contextListing: import('./market').ListingCard | null;
  /** 약속잡기 게이트 — 판매자는 항상 true, 구매자는 판매자의 거래진행 액션 이후에만 true */
  appointmentUnlocked: boolean;
  /** 260827 group/open 확장 (§3.5) */
  conversationType: 'direct' | 'group' | 'open';
  title: string | null;
  photoUrl: string | null;
  memberCount: number;
  communityGroupId: string | null;
  /** 진행 중 거래(PROPOSED/ACCEPTED) — init/214 로 방이 상대당 1개가 되면서 매물 구분을 여기서 드러낸다. */
  activeTrades: DmActiveTrade[];
}

/** 대화방에서 진행 중인 거래 1건. status 는 서버가 enum 만 내리고 라벨은 프론트가 i18n 매핑한다. */
export interface DmActiveTrade {
  appointmentId: string;
  listingId: string;
  listingTitle: string | null;
  thumbnailUrl: string | null;
  status: 'PROPOSED' | 'ACCEPTED';
}

// ── 커뮤니티 그룹 (204_community_group.sql, Phase2) ────────────────
export interface CommunityGroup {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  coverUrl: string | null;
  groupType: string;
  wardId: number | null;
  districtId: number | null;
  joinPolicy: string;
  visibility: string;
  ownerId: string | null;
  memberCount: number;
  postCount: number;
  status: string;
  createdAt: string;
  /** 조회 세션 유저 기준 — None(비가입) | 'PENDING' | 'ACTIVE' | 'BANNED' */
  myMembershipStatus: string | null;
  myRole: string | null;
  conversationId: string | null;
}

export interface CommunityGroupMember {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  joinedAt: string;
}

export interface DmAppointmentMeta {
  appointmentId?: string;
  when?: string;
  place?: string;
  placeLat?: number;
  placeLng?: number;
  /** message_type === 'sticker' 일 때 스티커 식별자. */
  stickerId?: string;
  /** message_type === 'price_offer' 일 때 가격제안 식별자. */
  priceOfferId?: string;
  /** message_type === 'voice' 일 때 녹음 길이(ms). */
  durationMs?: number;
  /** message_type === 'voice' 재생완료 시각 — 채워지면 audioUrl 은 null(파일 삭제됨). */
  playedAt?: string;
  /** message_type === 'walkie_invite' 일 때 채널을 연 사람의 표시이름. */
  invitedByName?: string;
  /** message_type === 'system' 의 종류 — init/214 병합 경계는 'listing_divider'. */
  kind?: string;
  /** kind === 'listing_divider' 일 때 구분자에 표시할 매물 제목. */
  listingTitle?: string;
}

export type AppointmentStatus = 'PROPOSED' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';

export interface Appointment {
  id: string;
  listingId: string;
  conversationId: string;
  proposerId: string;
  sellerId: string | null;
  whenAt: string;
  placeName: string | null;
  placeLat: number | null;
  placeLng: number | null;
  status: AppointmentStatus;
  /** S-16: 구매자 완료 요청. status 는 ACCEPTED 그대로이고 이 필드로 요청 여부를 판별한다. */
  completionRequestedBy: string | null;
  completionRequestedAt: string | null;
  completionDeclinedAt: string | null;
  /** 거절 행위자 — 판매자 거절이면 판매자 id, 운영 이의 큐 기각이면 null. */
  completionDeclinedBy: string | null;
}

/** 거래 위치공유(P4) 상태. M-6: 대칭 강제 아님 — my/peer 각각 독립 판정. */
export type LocationShareStatusValue = 'not_started' | 'sharing' | 'stopped';

export interface LocationShareStatus {
  myStatus: LocationShareStatusValue;
  peerStatus: LocationShareStatusValue;
  peerLat: number | null;
  peerLng: number | null;
  expiresAt: string | null;
}

export type PriceOfferStatus = 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface PriceOffer {
  id: string;
  listingId: string;
  conversationId: string;
  proposerId: string;
  sellerId: string | null;
  amount: number;
  status: PriceOfferStatus;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  imageUrl: string | null;
  /** message_type === 'voice' 일 때 재생URL. 재생완료로 파일이 삭제된 뒤에는 null. */
  audioUrl: string | null;
  readAt: string | null;
  createdAt: string;
  messageType: string;
  meta: DmAppointmentMeta | null;
  appointment: Appointment | null;
  priceOffer: PriceOffer | null;
}

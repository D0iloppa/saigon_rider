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
  nickname: string;
  riderStyle: RiderStyle;
  avatarUrl?: string;
  level: number;
  levelExp: number;        // 누적 레벨 EXP
  xpPoints: number;        // 소모 가능 XP
  gold: number;
  skillPoints: number;
  language: Language;
  skills: Record<SkillKey, number>;  // 각 스킬 레벨 0~3
  createdAt: string;
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
}

export interface DmConversation {
  id: string;
  otherUserId: string;
  otherUserNickname: string | null;
  otherUserAvatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
  contextType: string | null;
  contextId: string | null;
  contextListing: import('./market').ListingCard | null;
}

export interface DmAppointmentMeta {
  when?: string;
  place?: string;
  placeLat?: number;
  placeLng?: number;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
  messageType: string;
  meta: DmAppointmentMeta | null;
}

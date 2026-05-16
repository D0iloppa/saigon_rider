// 도메인 타입 정의 (기획서 §2 DB 스키마 기반)
import type { District, SafetyGrade as SafetyGradeMaster } from './master';

export type RiderStyle = 'commuter' | 'cafe_hunter' | 'night_rider';
export type QuestType = 'daily' | 'weekly' | 'event';
export type QuestStatus = 'available' | 'locked' | 'completed';
export type AttemptStatus = 'in_progress' | 'success' | 'failed' | 'abandoned';
export type SafetyGrade = 'A' | 'B' | 'C';
export type SkillKey = 'distance_rider' | 'gold_hunter' | 'safe_rider';
export type Language = 'ko' | 'vi' | 'en';

export interface User {
  id: string;
  phone: string;
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
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  questType: QuestType;
  district: District | null;
  districtName: string;
  minLevel: number;
  minDistanceM: number;
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
  expiresAt?: string;
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
  caption: string | null;
  hashtags: string[];          // content에서 파싱된 #태그 목록
  distanceKm: number | null;
  safetyGrade: SafetyGrade | null;
  rewardExp: number | null;
  cheerCount: number;
  commentCount: number;
  iCheered: boolean;
  createdAt: string;  // ISO
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

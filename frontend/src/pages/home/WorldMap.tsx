import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { fetchRecommendedQuest } from '@/api/quests';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber } from '@/lib/format';
import type { Quest } from '@/api/types';
import styles from './WorldMap.module.css';

export default function WorldMap() {
  const user = useUserStore((s) => s.user);
  const navigate = useNavigate();
  const [recommended, setRecommended] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecommendedQuest().then((q) => {
      setRecommended(q);
      setLoading(false);
    });
  }, []);

  if (!user) return null;
  const { needed, progress } = expToNextLevel(user.levelExp, user.level);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.noise} />
        <div className={styles.headerInner}>
          <div className={styles.userRow}>
            <img src={user.avatarUrl} alt="" className={styles.avatar} />
            <div>
              <div className={styles.nick}>{user.nickname}</div>
              <div className={styles.levelChip}>LV.{user.level}</div>
            </div>
          </div>
          <div className={styles.headerIcons}>
            <button className={styles.iconBtn} aria-label="알림">
              🔔<span className={styles.dot} />
            </button>
            <button
              className={styles.iconBtn}
              aria-label="설정"
              onClick={() => navigate('/settings')}
            >
              ⚙
            </button>
          </div>
        </div>

        <div className={styles.greet}>
          Chào buổi tối, {user.nickname.replace('@', '')} ✨
        </div>
        <div className={styles.progressLine}>
          <span>Lv.{user.level + 1}까지 {formatNumber(needed)} EXP</span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Currency cards */}
      <div className={styles.currencyRow}>
        <div className={styles.currencyCard}>
          <span className={styles.currencyIcon} style={{ color: 'var(--xp)' }}>
            💎
          </span>
          <div>
            <div className={styles.currencyNum}>{formatNumber(user.xpPoints)}</div>
            <div className={styles.currencyLabel}>XP</div>
          </div>
        </div>
        <div className={styles.currencyCard}>
          <span className={styles.currencyIcon} style={{ color: 'var(--gold)' }}>
            🪙
          </span>
          <div>
            <div className={styles.currencyNum}>{formatNumber(user.gold)}</div>
            <div className={styles.currencyLabel}>Gold</div>
          </div>
        </div>
        <div className={styles.currencyCard}>
          <span className={styles.currencyIcon} style={{ color: 'var(--brand-500)' }}>
            ⭐
          </span>
          <div>
            <div className={styles.currencyNum}>{user.skillPoints}</div>
            <div className={styles.currencyLabel}>Skill</div>
          </div>
        </div>
      </div>

      {/* Stylized world map */}
      <div className={styles.mapWrap}>
        <svg viewBox="0 0 400 280" className={styles.map}>
          {/* River */}
          <path
            d="M 50 240 Q 150 200 240 220 T 380 180"
            stroke="var(--neon-cyan)"
            strokeWidth="14"
            fill="none"
            opacity="0.4"
            strokeLinecap="round"
          />
          {/* Districts as polygons */}
          <polygon
            points="80,80 160,60 180,140 100,160"
            fill="var(--brand-200)"
            stroke="white"
            strokeWidth="2"
          />
          <text x="120" y="115" className={styles.mapLabel}>Q.1</text>

          <polygon
            points="180,140 270,120 280,200 200,210"
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <text x="225" y="170" className={styles.mapLabel}>BÌNH THẠNH</text>

          <polygon
            points="270,120 360,100 370,180 280,200"
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <text x="320" y="155" className={styles.mapLabel}>THỦ ĐỨC</text>

          <polygon
            points="40,170 130,180 110,260 30,250"
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <text x="75" y="220" className={styles.mapLabel}>Q.7</text>

          <polygon
            points="100,160 180,140 200,210 130,220"
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <text x="145" y="190" className={styles.mapLabel}>P.NHUẬN</text>

          {/* Quest pins */}
          <g transform="translate(120, 80)">
            <ellipse cx="0" cy="0" rx="20" ry="14" fill="var(--brand-500)" />
            <text x="0" y="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">+3</text>
          </g>
          <g transform="translate(225, 145)">
            <ellipse cx="0" cy="0" rx="20" ry="14" fill="var(--brand-500)" />
            <text x="0" y="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">+2</text>
          </g>
          <g transform="translate(75, 210)">
            <ellipse cx="0" cy="0" rx="20" ry="14" fill="var(--brand-500)" />
            <text x="0" y="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">+1</text>
          </g>
        </svg>

        <div className={styles.mapChip}>🇻🇳 Hồ Chí Minh City</div>
      </div>

      {/* Recommended quest card */}
      {loading ? (
        <div className={styles.recCardSkeleton} />
      ) : recommended ? (
        <div className={styles.recCard}>
          <img
            src={recommended.thumbnailUrl}
            alt=""
            className={styles.recImg}
          />
          <div className={styles.recBody}>
            <div className={styles.recTag}>TONIGHT'S PICK</div>
            <h3 className={styles.recTitle}>{recommended.title}</h3>
            <div className={styles.recRewards}>
              <span>💎 +{recommended.rewardExp}</span>
              <span>🪙 +{recommended.rewardGold}</span>
              {recommended.rewardItems.length > 0 && <span>🎁 ×{recommended.rewardItems.length}</span>}
            </div>
            <button
              className={styles.recBtn}
              onClick={() => navigate(`/quests/${recommended.id}`)}
            >
              퀘스트 시작 →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './SafeTradeGuide.module.css';

// ── 아이콘 ───────────────────────────────────────
const IcoBack = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 6l-6 6 6 6"/>
  </svg>
);
const IcoChevronDown = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0b0b5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', flexShrink: 0, marginTop: 3 }}>
    <path d="M6 9l6 6 6-6"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1fa463" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
    <path d="M5 12l5 5L20 6"/>
  </svg>
);
const IcoWarning = () => (
  <svg width="22" height="22" viewBox="0 0 24 24">
    <path d="M12 2.5L22.5 21H1.5L12 2.5z" fill="#f55c28" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M12 9v5.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="12" cy="17.5" r="1.3" fill="#fff"/>
  </svg>
);
const IcoArrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2f2114" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6"/>
  </svg>
);

const P_ICONS = [
  <svg key="1" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87"/>
  </svg>,
  <svg key="2" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>,
  <svg key="3" width="34" height="34" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" stroke="#5a5a5f" strokeWidth="1.6"/>
    <path d="M12 7v5M12 15h.01" stroke="#5a5a5f" strokeWidth="2" strokeLinecap="round"/>
  </svg>,
  <svg key="4" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10.5H3M21 6H3M7 14H3v4h4v-4zM21 14h-8M21 18h-8"/>
  </svg>,
];

// 타일 배경색 (fraudTile inline style 로 사용)
const FRAUD_BG = ['#edf7ea', '#f4f1ec', '#eeeaf8', '#efeff1'];

// 일러스트만 담은 SVG — 경고 배지는 별도 overlay
const FRAUD_ICONS = [
  // 1. 선입금 사기 — 지폐 + 번개 동전 (중심 ≈ 29,29)
  <svg key="f1" width="58" height="58" viewBox="0 0 58 58" fill="none">
    {/* 지폐 — 34w×21h, y=14 기준 */}
    <rect x="8" y="14" width="34" height="21" rx="4.5" fill="#66bb6a"/>
    <rect x="11" y="17" width="5" height="5" rx="1.5" fill="#43a047" opacity="0.55"/>
    <rect x="32" y="17" width="5" height="5" rx="1.5" fill="#43a047" opacity="0.55"/>
    <rect x="11" y="27" width="5" height="5" rx="1.5" fill="#43a047" opacity="0.55"/>
    <rect x="32" y="27" width="5" height="5" rx="1.5" fill="#43a047" opacity="0.55"/>
    <circle cx="25" cy="24" r="6.5" fill="#43a047" opacity="0.38"/>
    <circle cx="25" cy="24" r="4.5" fill="#fff" opacity="0.22"/>
    {/* 동전 — 지폐 우하단에 겹쳐서 배치 (cx=37 cy=32) */}
    <circle cx="37" cy="32" r="13" fill="#ebebeb"/>
    <circle cx="37" cy="32" r="12" fill="#fdd835"/>
    <circle cx="37" cy="32" r="10.5" fill="#f9a825"/>
    {/* 번개 볼트 */}
    <path d="M39.5 25.5 L34 33 H37.5 L34.5 39.5 L41.5 31 H38 Z" fill="#fff"/>
  </svg>,

  // 2. 허위 상품 사기 — 배달 트럭 (중심 ≈ 29,29)
  <svg key="f2" width="58" height="58" viewBox="0 0 58 58" fill="none">
    {/* 화물칸 — y=16 기준 (3px 아래로) */}
    <rect x="8" y="16" width="24" height="22" rx="3.5" fill="#7cb342"/>
    <line x1="12" y1="22" x2="29" y2="22" stroke="#558b2f" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    <line x1="12" y1="27" x2="29" y2="27" stroke="#558b2f" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    <line x1="12" y1="32" x2="29" y2="32" stroke="#558b2f" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    {/* 운전석 루프 */}
    <path d="M31 21 Q33 14 40 14 H50 V38 H31 Z" fill="#90a4ae"/>
    <rect x="31" y="26" width="19" height="12" fill="#78909c"/>
    {/* 앞유리 */}
    <rect x="33" y="19" width="14" height="9" rx="2" fill="#b2dfdb"/>
    {/* 바닥 */}
    <line x1="6" y1="38" x2="53" y2="38" stroke="#c8c0b6" strokeWidth="1.2"/>
    {/* 뒷바퀴 */}
    <circle cx="19" cy="38" r="7" fill="#37474f"/>
    <circle cx="19" cy="38" r="4.5" fill="#78909c"/>
    <circle cx="19" cy="38" r="1.8" fill="#37474f"/>
    {/* 앞바퀴 */}
    <circle cx="41" cy="38" r="7" fill="#37474f"/>
    <circle cx="41" cy="38" r="4.5" fill="#78909c"/>
    <circle cx="41" cy="38" r="1.8" fill="#37474f"/>
  </svg>,

  // 3. 개인정보 피싱 — 선물 상자 (중심 ≈ 29,29)
  <svg key="f3" width="58" height="58" viewBox="0 0 58 58" fill="none">
    {/* 상자 몸통 — x=13-45, y=29-47 */}
    <rect x="13" y="29" width="32" height="18" rx="2.5" fill="#3949ab"/>
    {/* 수직 리본 (몸통) */}
    <rect x="25" y="29" width="6" height="18" fill="#ffa000"/>
    {/* 수평 리본 (몸통) */}
    <rect x="13" y="35" width="32" height="5" fill="#ffb300" opacity="0.35"/>
    {/* 뚜껑 — x=11-47, y=21-31 */}
    <rect x="11" y="21" width="36" height="10" rx="2.5" fill="#5c6bc0"/>
    {/* 수직 리본 (뚜껑) */}
    <rect x="25" y="21" width="6" height="10" fill="#ffa000"/>
    {/* 리본 왼쪽 루프 */}
    <ellipse cx="19" cy="19" rx="8" ry="5" transform="rotate(-22 19 19)" fill="#ffb300"/>
    <ellipse cx="19" cy="19" rx="5.5" ry="3.2" transform="rotate(-22 19 19)" fill="#ffa000"/>
    {/* 리본 오른쪽 루프 */}
    <ellipse cx="39" cy="19" rx="8" ry="5" transform="rotate(22 39 19)" fill="#ffb300"/>
    <ellipse cx="39" cy="19" rx="5.5" ry="3.2" transform="rotate(22 39 19)" fill="#ffa000"/>
    {/* 매듭 */}
    <circle cx="28" cy="21" r="4.5" fill="#e65100"/>
    <circle cx="28" cy="21" r="2.8" fill="#ff6d00"/>
  </svg>,

  // 4. 가짜 계좌 사기 — 사람 실루엣 (중심 ≈ 29,29)
  <svg key="f4" width="58" height="58" viewBox="0 0 58 58" fill="none">
    {/* 머리 — cy=23 (3px 아래로) */}
    <circle cx="29" cy="23" r="12" fill="#9e9e9e"/>
    {/* 어깨 — y=36-49 */}
    <path d="M5 49 C5 36 53 36 53 49 Z" fill="#9e9e9e"/>
  </svg>,
];

export default function SafeTradeGuide() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [openFraud, setOpenFraud] = useState<number | null>(null);

  const principles = [1, 2, 3, 4].map((n) => ({
    n,
    icon: P_ICONS[n - 1],
    title: t(`safeTradeGuide.p${n}Title`),
    desc: t(`safeTradeGuide.p${n}Desc`),
  }));

  const frauds = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`safeTradeGuide.f${n}Title`),
    desc: t(`safeTradeGuide.f${n}Desc`),
    tips: [t(`safeTradeGuide.f${n}t1`), t(`safeTradeGuide.f${n}t2`)],
    icon: FRAUD_ICONS[n - 1],
    bg: FRAUD_BG[n - 1],
  }));

  return (
    <div className={styles.root}>
      {/* ── 헤더 ── */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <IcoBack />
        </button>
        <div className={styles.headerTitle}>{t('safeTradeGuide.title')}</div>
      </div>

      <div className={styles.scroll}>
        {/* ── 히어로 배너 ── */}
        <div className={styles.heroWrap}>
          <div className={styles.hero}>
            <div className={styles.heroLeft}>
              <div className={styles.heroTitle}>{t('safeTradeGuide.heroTitle')}</div>
              <div className={styles.heroSub}>{t('safeTradeGuide.heroSub')}</div>
            </div>
            <div className={styles.heroIllo}>
              <svg width="110" height="100" viewBox="0 0 100 92" fill="none">
                <rect x="2" y="16" width="34" height="22" rx="6" fill="#ffb98a"/>
                <rect x="10" y="40" width="26" height="16" rx="5" fill="#ffcfa8"/>
                <path d="M62 6l28 10v22c0 18-12 30-28 36-16-6-28-18-28-36V16L62 6z" fill="#f6913f"/>
                <path d="M62 10l24 8.5V38c0 15.5-10 25.8-24 31-14-5.2-24-15.5-24-31V18.5L62 10z" fill="#ff9d52"/>
                <path d="M52 38l7 7 14-14" stroke="#fff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="60" y="58" width="30" height="24" rx="6" fill="#e07b2f"/>
                <path d="M67 58v-6a8 8 0 0116 0v6" stroke="#e07b2f" strokeWidth="5" fill="none"/>
                <circle cx="75" cy="69" r="3.5" fill="#fff"/>
              </svg>
            </div>
          </div>
        </div>

        {/* ── 안전거래 5원칙 ── */}
        <div className={styles.sectionTitle}>{t('safeTradeGuide.principlesTitle')}</div>
        <div className={styles.principlesRow}>
          {principles.map((p) => (
            <div key={p.n} className={styles.principleCard}>
              <div className={styles.principleNum}>{p.n}</div>
              <div className={styles.principleIcon}>{p.icon}</div>
              <div className={styles.principleCardTitle}>{p.title}</div>
              <div className={styles.principleCardDesc}>{p.desc}</div>
            </div>
          ))}
        </div>

        {/* ── 사기 유형과 예방법 ── */}
        <div className={styles.sectionTitle}>{t('safeTradeGuide.fraudsTitle')}</div>
        <div className={styles.fraudList}>
          {frauds.map((f, idx) => (
            <div key={f.n} className={styles.fraudItem} style={{ borderTop: idx === 0 ? 'none' : '1px solid #ededf0' }}>
              <button className={styles.fraudHeader} onClick={() => setOpenFraud(openFraud === f.n ? null : f.n)}>
                <div className={styles.fraudTile} style={{ background: f.bg }}>
                  {f.icon}
                  <div className={styles.fraudWarning}><IcoWarning /></div>
                </div>
                <div className={styles.fraudText}>
                  <div className={styles.fraudTitle}>{f.title}</div>
                  <div className={styles.fraudDesc}>{f.desc}</div>
                </div>
                <IcoChevronDown open={openFraud === f.n} />
              </button>
              {openFraud === f.n && (
                <div className={styles.fraudTips}>
                  {f.tips.map((tip, i) => (
                    <div key={i} className={styles.fraudTip}>
                      <IcoCheck />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── 안전거래 기능 ── */}
        <div className={styles.sectionTitle}>{t('safeTradeGuide.featuresTitle')}</div>
        <div className={styles.features}>
          <div className={styles.featCard}>
            <div className={styles.featIcon} style={{ background: '#e3f5e9' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#1fa463">
                <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z"/>
                <circle cx="12" cy="9.5" r="2.4" fill="#fff"/>
                <path d="M7.8 16c.4-2.3 2.1-3.5 4.2-3.5s3.8 1.2 4.2 3.5z" fill="#fff"/>
              </svg>
            </div>
            <div className={styles.featTitle}>{t('safeTradeGuide.feat1Title')}</div>
            <div className={styles.featDesc}>{t('safeTradeGuide.feat1Desc')}</div>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featIcon} style={{ background: '#e4eefb' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#3a82e0">
                <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z"/>
                <path d="M8.5 12l2.4 2.4L16 9.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className={styles.featTitle}>{t('safeTradeGuide.feat2Title')}</div>
            <div className={styles.featDesc}>{t('safeTradeGuide.feat2Desc')}</div>
          </div>
          <div className={styles.featCard}>
            <div className={styles.featIcon} style={{ background: '#fef0e6' }}>
              <svg width="34" height="30" viewBox="0 0 34 30" fill="none">
                <path d="M9 18a8 8 0 0116 0z" fill="#f8602a"/>
                <rect x="6" y="18" width="22" height="5" rx="2.5" fill="#e07b2f"/>
                <rect x="15.5" y="3" width="3" height="5" rx="1.5" fill="#f8602a"/>
                <path d="M5 9l3 2.5M29 9l-3 2.5" stroke="#f8602a" strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div className={styles.featTitle}>{t('safeTradeGuide.feat3Title')}</div>
            <div className={styles.featDesc}>{t('safeTradeGuide.feat3Desc')}</div>
          </div>
        </div>

        {/* ── 도움말 ── */}
        <div className={styles.helpWrap}>
          <div className={styles.helpCard}>
            <div className={styles.helpText}>
              <div className={styles.helpTitle}>{t('safeTradeGuide.helpTitle')}</div>
              <div className={styles.helpDesc}>{t('safeTradeGuide.helpDesc')}</div>
            </div>
            <button className={styles.helpBtn} onClick={() => navigate('/settings/support')}>
              {t('safeTradeGuide.helpBtn')}<IcoArrow />
            </button>
          </div>
        </div>

        <div className={styles.bottomPad} />
      </div>
    </div>
  );
}

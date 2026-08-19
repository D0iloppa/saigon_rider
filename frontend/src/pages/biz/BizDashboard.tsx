import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  Users,
  Newspaper,
  MessageSquare,
  Megaphone,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from 'lucide-react';
import StateBlock from '@/components/ui/StateBlock';
import MiniAreaChart from '@/components/ui/MiniAreaChart';
import ReviewActionRow from '@/components/biz/ReviewActionRow';
import ReviewModerationSheets from '@/components/biz/ReviewModerationSheets';
import { useReviewModeration } from '@/hooks/useReviewModeration';
import {
  fetchBizOwnerReviews,
  fetchBusinessPublicProfile,
  fetchBizAdStatsSummary,
  fetchBizAdStatsSeries,
  createBizIssue,
  type BizOwnerReview,
  type BizAdStatsSummary,
  type BizAdStatsSeries,
  type BizAdStatsSeriesPeriod,
  type BizAdStatsSeriesPoint,
} from '@/api/biz';
import { formatRelativeTime } from '@/lib/format';
import styles from './BizDashboard.module.css';

const REVIEW_PAGE = 5;
const RANGES: BizAdStatsSeriesPeriod[] = ['7d', '14d', '30d'];

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

function formatNum(value: number): string {
  return value.toLocaleString('vi-VN');
}

/** '2026-07-26' → '7.26' (Date 파싱 없이 문자열만 — 타임존 이동 방지) */
function dayLabel(iso: string): string {
  return `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
}

interface Props {
  profileId: string;
  /** '내 소식' 목록은 BizManage 가 이미 오너용으로 로딩 중 — 중복 호출 방지를 위해 상위에서 전달받는다 */
  newsCount: number | null;
}

/**
 * 업체 자기 대시보드 — 광고 성과가 주인공, 업체 지표(후기·단골·소식)는 그 아래 종속 섹션.
 *
 * 광고 성과는 기간 선택기(7/14/30일) 하나가 아래 전체(KPI·차트·효용·광고별)를 스코프한다.
 * 시계열은 지표별 스몰 멀티플 — 노출/클릭/문의는 스케일 차가 커서 한 플롯에 겹치지 않고
 * 각자 자기 y축을 가진 별도 패널로 나눈다(이중 축 금지).
 */
export default function BizDashboard({ profileId, newsCount }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<BizOwnerReview[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewAvg, setReviewAvg] = useState<number | null>(null);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [reviewListLoading, setReviewListLoading] = useState(true);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [reviewLoadingMore, setReviewLoadingMore] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [businessName, setBusinessName] = useState('');
  // 답글 작성/수정/삭제 + 후기 신고 — BizPublic(공개 프로필) 과 공용(useReviewModeration)
  // F2-6: 답글로 미답변→답변 전환되면 unansweredCount·미답변 필터 목록을 로컬로 동기화
  const reviewMod = useReviewModeration<BizOwnerReview>(profileId, setReviews, (reviewId, becameAnswered) => {
    setUnansweredCount((prev) => Math.max(0, prev + (becameAnswered ? -1 : 1)));
    if (becameAnswered && unansweredOnly) {
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    }
  });
  const [adStats, setAdStats] = useState<BizAdStatsSummary | null>(null);
  const [adStatsLoading, setAdStatsLoading] = useState(true);
  const [adStatsError, setAdStatsError] = useState(false);
  const [period, setPeriod] = useState<BizAdStatsSeriesPeriod>('7d');
  const [seriesData, setSeriesData] = useState<BizAdStatsSeries | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [seriesError, setSeriesError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  // #27(013/016 §8 L5) — 업체 전용 이슈 채널. "광고가 안 나옵니다" 등 계약 관련 이슈를 영업 담당
  // 개인 연락 대신 이 창구로 접수한다 — ad_id 만 넘기면 서버가 계약 컨텍스트를 자동 첨부한다.
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [issueAdId, setIssueAdId] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueResult, setIssueResult] = useState<'success' | 'error' | null>(null);

  const retryAdStats = () => setReloadKey((k) => k + 1);

  const handleSubmitIssue = async () => {
    if (!issueAdId || !issueBody.trim() || issueSubmitting) return;
    setIssueSubmitting(true);
    setIssueResult(null);
    try {
      await createBizIssue({
        adId: issueAdId,
        title: t('biz.dashboard.issueDefaultTitle', { defaultValue: '광고 노출 이슈' }),
        body: issueBody.trim(),
      });
      setIssueResult('success');
      setIssueBody('');
    } catch {
      setIssueResult('error');
    } finally {
      setIssueSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setAdStatsLoading(true);
    setAdStatsError(false);
    fetchBizAdStatsSummary(profileId, '7d')
      .then((res) => {
        if (!cancelled) setAdStats(res);
      })
      .catch(() => {
        if (!cancelled) setAdStatsError(true);
      })
      .finally(() => {
        if (!cancelled) setAdStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setSeriesLoading(true);
    setSeriesError(false);
    setActiveIndex(null);
    fetchBizAdStatsSeries(profileId, period)
      .then((res) => {
        if (!cancelled) setSeriesData(res);
      })
      .catch(() => {
        if (!cancelled) setSeriesError(true);
      })
      .finally(() => {
        if (!cancelled) setSeriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, period, reloadKey]);

  // 업체 프로필(팔로워·업체명) — 필터(unansweredOnly) 와 무관, profileId 변경 시에만 재조회
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBusinessPublicProfile(profileId)
      .then((profile) => {
        if (cancelled) return;
        setFollowerCount(profile.followerCount);
        setBusinessName(profile.name);
      })
      .catch(() => {
        if (cancelled) return;
        setFollowerCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // 후기 목록 — "미답변만" 토글 시 이 목록만 재조회한다(F2-2). reviewTotal(업체 지표 카드)은
  // 필터와 무관한 전체 후기 수를 보여야 하므로 필터 걸린 응답의 total 로는 덮어쓰지 않는다(F2-1).
  useEffect(() => {
    let cancelled = false;
    setReviewListLoading(true);
    fetchBizOwnerReviews(profileId, { limit: REVIEW_PAGE, offset: 0, unansweredOnly })
      .then((reviewRes) => {
        if (cancelled) return;
        setReviews(reviewRes.reviews);
        if (!unansweredOnly) setReviewTotal(reviewRes.total);
        setReviewAvg(reviewRes.avgRating);
        setUnansweredCount(reviewRes.unansweredCount);
        setReviewHasMore(reviewRes.hasMore);
      })
      .catch(() => {
        if (cancelled) return;
        setReviews([]);
        if (!unansweredOnly) setReviewTotal(0);
        setReviewAvg(null);
        setReviewHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setReviewListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, unansweredOnly]);

  const handleMoreReviews = async () => {
    if (reviewLoadingMore) return;
    setReviewLoadingMore(true);
    try {
      const res = await fetchBizOwnerReviews(profileId, {
        limit: REVIEW_PAGE, offset: reviews.length, unansweredOnly,
      });
      setReviews((prev) => [...prev, ...res.reviews]);
      if (!unansweredOnly) setReviewTotal(res.total);
      setReviewAvg(res.avgRating);
      setUnansweredCount(res.unansweredCount);
      setReviewHasMore(res.hasMore);
    } finally {
      setReviewLoadingMore(false);
    }
  };

  /** 증감 — 색만으로 방향을 말하지 않는다(화살표 + 부호 동반). 직전값이 0이면 비율 계산 불가라 생략 */
  const renderDelta = (current: number, prev: number, days: number) => {
    if (prev <= 0) return null;
    const pct = ((current - prev) / prev) * 100;
    const up = pct >= 0;
    const rounded = Math.abs(pct) >= 10 ? Math.abs(pct).toFixed(0) : Math.abs(pct).toFixed(1);
    const text = `${up ? '+' : '−'}${rounded}%`;
    return (
      <span
        className={up ? styles.deltaUp : styles.deltaDown}
        title={t('biz.dashboard.adPerfVsPrev', { days, defaultValue: '직전 {{days}}일 대비' })}
      >
        {up ? <ArrowUp size={11} strokeWidth={3} aria-hidden="true" /> : <ArrowDown size={11} strokeWidth={3} aria-hidden="true" />}
        {text}
      </span>
    );
  };

  const renderTrend = (data: BizAdStatsSeries) => {
    const panels: { key: string; label: string; color: string; pick: (p: BizAdStatsSeriesPoint) => number }[] = [
      {
        key: 'impressions',
        label: t('biz.dashboard.adPerfImpressions', { defaultValue: '노출' }),
        color: 'var(--brand-300)',
        pick: (p) => p.impressions,
      },
      {
        key: 'clicks',
        label: t('biz.dashboard.adPerfClicks', { defaultValue: '클릭' }),
        color: 'var(--brand-500)',
        pick: (p) => p.clicks,
      },
      {
        key: 'ctaPrimary',
        label: t('biz.dashboard.adPerfInquiries', { defaultValue: '문의' }),
        color: 'var(--brand-700)',
        pick: (p) => p.ctaPrimary,
      },
    ];
    const first = data.series[0];
    const last = data.series[data.series.length - 1];
    const active = activeIndex != null ? data.series[activeIndex] : null;

    return (
      <>
        <div className={styles.trendHead}>
          <h4 className={styles.cardTitle}>{t('biz.dashboard.adPerfTrendTitle', { defaultValue: '일별 추이' })}</h4>
          <p className={styles.readout} aria-live="polite">
            {active
              ? `${dayLabel(active.date)} · ${panels.map((p) => `${p.label} ${formatNum(p.pick(active))}`).join(' · ')}`
              : `${dayLabel(first.date)} – ${dayLabel(last.date)}`}
          </p>
        </div>
        {panels.map((p) => {
          const values = data.series.map(p.pick);
          const max = Math.max(...values);
          return (
            <div key={p.key} className={styles.panel}>
              <div className={styles.panelHead}>
                <span className={styles.panelKey} style={{ background: p.color }} aria-hidden="true" />
                <span className={styles.panelLabel}>{p.label}</span>
                <span className={styles.panelMax}>
                  {t('biz.dashboard.adPerfDailyMax', { value: formatNum(max), defaultValue: '일 최대 {{value}}' })}
                </span>
              </div>
              <MiniAreaChart
                values={values}
                color={p.color}
                activeIndex={activeIndex}
                onActive={setActiveIndex}
                ariaLabel={`${p.label} — ${dayLabel(first.date)} ~ ${dayLabel(last.date)}`}
              />
              <div className={styles.xAxis}>
                <span>{dayLabel(first.date)}</span>
                <span>{dayLabel(last.date)}</span>
              </div>
            </div>
          );
        })}
        <p className={styles.chartHint}>
          {t('biz.dashboard.adPerfChartHint', { defaultValue: '그래프를 누르면 그날의 값을 볼 수 있어요' })}
        </p>
        <button type="button" className={styles.tableToggle} onClick={() => setTableOpen((v) => !v)}>
          {tableOpen
            ? t('biz.dashboard.adPerfTableHide', { defaultValue: '표 닫기' })
            : t('biz.dashboard.adPerfTableShow', { defaultValue: '일별 표로 보기' })}
        </button>
        {tableOpen && (
          <div className={styles.tableWrap}>
            <table className={styles.dailyTable}>
              <thead>
                <tr>
                  <th scope="col">{t('biz.dashboard.adPerfTableDate', { defaultValue: '날짜' })}</th>
                  {panels.map((p) => (
                    <th key={p.key} scope="col">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.series.map((point) => (
                  <tr key={point.date}>
                    <th scope="row">{dayLabel(point.date)}</th>
                    {panels.map((p) => (
                      <td key={p.key}>{formatNum(p.pick(point))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderSpendValue = (data: BizAdStatsSeries) => {
    const rows = [
      {
        key: 'impressions',
        color: 'var(--brand-300)',
        label: t('biz.dashboard.adPerfImpressions', { defaultValue: '노출' }),
        count: data.totals.impressions,
        unitLabel: t('biz.dashboard.adPerfCostPerMille', { defaultValue: '노출 1,000회당' }),
        unitCost: data.cpmVnd,
      },
      {
        key: 'clicks',
        color: 'var(--brand-500)',
        label: t('biz.dashboard.adPerfClicks', { defaultValue: '클릭' }),
        count: data.totals.clicks,
        unitLabel: t('biz.dashboard.adPerfCostPerClick', { defaultValue: '클릭당' }),
        unitCost: data.cpcVnd,
      },
      {
        key: 'ctaPrimary',
        color: 'var(--brand-700)',
        label: t('biz.dashboard.adPerfInquiries', { defaultValue: '문의' }),
        count: data.totals.ctaPrimary,
        unitLabel: t('biz.dashboard.adPerfCostPerInquiry', { defaultValue: '문의 1건당' }),
        unitCost: data.cpaVnd,
      },
    ];
    return (
      <div className={styles.valueCard}>
        <div className={styles.valueHead}>
          <span className={styles.valueHeadLabel}>
            {t('biz.dashboard.adPerfSpendLabel', { defaultValue: '이 기간 광고비' })}
          </span>
          <span className={`num ${styles.valueSpend}`}>{formatVnd(data.spendVnd)}</span>
        </div>
        <p className={styles.valueGotHead}>{t('biz.dashboard.adPerfGotHead', { defaultValue: '이 돈으로 얻은 것' })}</p>
        <ul className={styles.valueList}>
          {rows.map((r) => (
            <li key={r.key} className={styles.valueRow}>
              <span className={styles.panelKey} style={{ background: r.color }} aria-hidden="true" />
              <span className={styles.valueRowLabel}>{r.label}</span>
              <span className={styles.valueRowCount}>{formatNum(r.count)}</span>
              <span className={styles.valueRowCost}>
                {r.unitCost != null ? `${r.unitLabel} ${formatVnd(r.unitCost)}` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderByAd = (data: BizAdStatsSeries) => {
    const rows = [...data.byAd].sort((a, b) => b.impressions - a.impressions);
    const maxPrimary = Math.max(0, ...rows.map((r) => r.ctaPrimary));
    return (
      <div className={styles.adList}>
        {rows.map((ad) => {
          const ctr = ad.impressions >= data.minSampleForRatio ? (ad.clicks / ad.impressions) * 100 : null;
          const barPct = maxPrimary > 0 ? (ad.ctaPrimary / maxPrimary) * 100 : 0;
          const badge = ad.isEnded
            ? t('biz.dashboard.adPerfEndedBadge', { defaultValue: '게시 종료' })
            : ad.reviewStatus === 'PENDING'
              ? t('biz.dashboard.adPerfAdPending', { defaultValue: '심사 중' })
              : ad.reviewStatus === 'REJECTED'
                ? t('biz.dashboard.adPerfAdRejected', { defaultValue: '반려' })
                : null;
          return (
            <article key={ad.adId} className={styles.adRow}>
              <div className={styles.adRowHead}>
                <span className={styles.adTitle}>{ad.title}</span>
                {badge && <span className={styles.adBadge}>{badge}</span>}
              </div>
              <div className={styles.adMetrics}>
                <span>
                  {t('biz.dashboard.adPerfImpressions', { defaultValue: '노출' })}{' '}
                  <b className="num">{formatNum(ad.impressions)}</b>
                </span>
                <span>
                  {t('biz.dashboard.adPerfClicks', { defaultValue: '클릭' })}{' '}
                  <b className="num">{formatNum(ad.clicks)}</b>
                </span>
                <span>
                  {t('biz.dashboard.adPerfInquiries', { defaultValue: '문의' })}{' '}
                  <b className="num">{formatNum(ad.ctaPrimary)}</b>
                </span>
              </div>
              {maxPrimary > 0 && (
                <div className={styles.adBarTrack}>
                  <div
                    className={styles.adBarFill}
                    style={{ width: ad.ctaPrimary > 0 ? `max(2px, ${barPct}%)` : 0 }}
                  />
                </div>
              )}
              <div className={styles.adFoot}>
                {ctr != null && (
                  <span>
                    {t('biz.dashboard.adPerfCtr', { defaultValue: '클릭률(CTR)' })} {ctr.toFixed(1)}%
                  </span>
                )}
                <span>
                  {t('biz.dashboard.adPerfSpendLabel', { defaultValue: '이 기간 광고비' })} {formatVnd(ad.spendVnd)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderAdPerf = () => {
    const firstLoad = (adStatsLoading && !adStats) || (seriesLoading && !seriesData);
    if (firstLoad) {
      return (
        <>
          <div className={styles.adPerfNumRow}>
            <div className={`shimmer ${styles.adPerfNumSkeleton}`} />
            <div className={`shimmer ${styles.adPerfNumSkeleton}`} />
            <div className={`shimmer ${styles.adPerfNumSkeleton}`} />
          </div>
          <div className={`shimmer ${styles.chartSkeleton}`} />
        </>
      );
    }

    if (adStatsError || seriesError || !adStats) {
      return (
        <StateBlock
          icon={AlertCircle}
          tone="error"
          title={t('biz.dashboard.adPerfErrorTitle', { defaultValue: '광고 성과를 불러오지 못했어요' })}
          actionLabel={t('common.retry', { defaultValue: '다시 시도' })}
          onAction={retryAdStats}
        />
      );
    }

    if (adStats.state === 'no_ads') {
      return (
        <StateBlock
          icon={Megaphone}
          title={t('biz.dashboard.adPerfEmptyNoAdsTitle', { defaultValue: '아직 광고가 없어요' })}
          desc={t('biz.dashboard.adPerfEmptyNoAdsDesc', {
            defaultValue: '광고를 시작하면 노출·클릭·문의 성과를 여기서 확인할 수 있어요',
          })}
          actionLabel={t('biz.dashboard.adPerfEmptyNoAdsCta', { defaultValue: '광고 시작하기' })}
          onAction={() => navigate('/biz/ads/new')}
        />
      );
    }

    if (adStats.state === 'pending') {
      return (
        <StateBlock
          icon={Megaphone}
          title={t('biz.dashboard.adPerfPendingTitle', { defaultValue: '심사 중이에요' })}
          desc={t('biz.dashboard.adPerfPendingDesc', { defaultValue: '승인되면 노출이 시작돼요' })}
        />
      );
    }

    if (adStats.state === 'warming_up') {
      return (
        <StateBlock
          icon={Megaphone}
          title={t('biz.dashboard.adPerfWarmingTitle', { defaultValue: '집계 중이에요' })}
          desc={t('biz.dashboard.adPerfWarmingDesc', { defaultValue: '첫 성과는 게시 다음 날부터 보여드려요' })}
        />
      );
    }

    if (!seriesData) return null;

    // 선택 기간에 데이터가 아예 없으면 빈 차트를 그리지 않고 빈 상태로 대체한다
    if (seriesData.totals.impressions === 0) {
      return (
        <StateBlock
          icon={BarChart3}
          title={t('biz.dashboard.adPerfNoRangeDataTitle', { defaultValue: '이 기간엔 성과가 없어요' })}
          desc={t('biz.dashboard.adPerfNoRangeDataDesc', { defaultValue: '기간을 더 넓게 잡아보세요' })}
        />
      );
    }

    // low_sample / normal — 절대 숫자 3개(노출·클릭·문의)는 공통, 비율·비용은 표본 게이트 통과 시에만
    const seriesState: BizAdStatsSummary['state'] =
      seriesData.totals.impressions < seriesData.minSampleForRatio ? 'low_sample' : 'normal';
    const days = seriesData.periodDays;

    return (
      <>
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>
              <span className={styles.panelKey} style={{ background: 'var(--brand-300)' }} aria-hidden="true" />
              {t('biz.dashboard.adPerfImpressions', { defaultValue: '노출' })}
            </span>
            <span className={`num ${styles.kpiValue}`}>{formatNum(seriesData.totals.impressions)}</span>
            {renderDelta(seriesData.totals.impressions, seriesData.previous.impressions, days)}
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>
              <span className={styles.panelKey} style={{ background: 'var(--brand-500)' }} aria-hidden="true" />
              {t('biz.dashboard.adPerfClicks', { defaultValue: '클릭' })}
            </span>
            <span className={`num ${styles.kpiValue}`}>{formatNum(seriesData.totals.clicks)}</span>
            {renderDelta(seriesData.totals.clicks, seriesData.previous.clicks, days)}
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>
              <span className={styles.panelKey} style={{ background: 'var(--brand-700)' }} aria-hidden="true" />
              {t('biz.dashboard.adPerfInquiries', { defaultValue: '문의' })}
            </span>
            <span className={`num ${styles.kpiValue}`}>{formatNum(seriesData.totals.ctaPrimary)}</span>
            {renderDelta(seriesData.totals.ctaPrimary, seriesData.previous.ctaPrimary, days)}
          </div>
        </div>
        <p className={styles.kpiFoot}>{t('biz.dashboard.adPerfVsPrev', { days, defaultValue: '직전 {{days}}일 대비' })}</p>

        {seriesState === 'low_sample' && (
          <p className={styles.adPerfNotice}>
            {t('biz.dashboard.adPerfLowSampleNotice', { defaultValue: '표본이 적어 비율은 아직 보여드리지 않아요' })}
          </p>
        )}

        {seriesState === 'normal' && (
          <>
            <div className={styles.adPerfRatioRow}>
              {seriesData.ctr != null && (
                <span>
                  {t('biz.dashboard.adPerfCtr', { defaultValue: '클릭률(CTR)' })} {seriesData.ctr.toFixed(1)}%
                </span>
              )}
              {seriesData.cvr != null && (
                <span>
                  {t('biz.dashboard.adPerfCvr', { defaultValue: '전환율(CVR)' })} {seriesData.cvr.toFixed(1)}%
                </span>
              )}
            </div>
            <div className={styles.adPerfBreakdownRow}>
              <span>
                {t('biz.dashboard.adPerfReach', { defaultValue: '도달' })} {formatNum(seriesData.totals.reach)}
              </span>
              <span>
                {t('biz.dashboard.adPerfFollowCount', { defaultValue: '단골' })}{' '}
                {formatNum(seriesData.totals.ctaFollow)}
              </span>
              <span>
                {t('biz.dashboard.adPerfFavoriteCount', { defaultValue: '찜' })}{' '}
                {formatNum(seriesData.totals.ctaFavorite)}
              </span>
            </div>
          </>
        )}

        <div className={styles.trendCard}>{renderTrend(seriesData)}</div>

        {seriesState === 'normal' && renderSpendValue(seriesData)}

        <h4 className={styles.byAdTitle}>{t('biz.dashboard.adPerfByAdTitle', { defaultValue: '광고별 성과' })}</h4>
        {renderByAd(seriesData)}
      </>
    );
  };

  if (loading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.statRow}>
          <div className={`shimmer ${styles.statSkeleton}`} />
          <div className={`shimmer ${styles.statSkeleton}`} />
          <div className={`shimmer ${styles.statSkeleton}`} />
        </div>
        <div className={`shimmer ${styles.listSkeleton}`} />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.adPerfTitleRow}>
        <h3 className={styles.sectionTitleFlush}>{t('biz.dashboard.adPerfTitle', { defaultValue: '광고 성과' })}</h3>
        {adStats?.isEnded && (
          <span className={styles.adPerfBadge}>{t('biz.dashboard.adPerfEndedBadge', { defaultValue: '게시 종료' })}</span>
        )}
        {/* #27 — 광고주가 신고 버튼 대신 영업 담당 개인 연락으로 새는 것을 막는 창구 */}
        <button
          type="button"
          className={styles.issueToggleBtn}
          onClick={() => {
            setIssueFormOpen((v) => !v);
            setIssueResult(null);
          }}
        >
          <AlertCircle size={13} strokeWidth={2.2} />
          {t('biz.dashboard.issueButton', { defaultValue: '이슈 신고' })}
        </button>
      </div>

      {issueFormOpen && (
        <div className={styles.issueForm}>
          {(seriesData?.byAd?.length ?? 0) === 0 ? (
            <p className={styles.issueEmptyNotice}>
              {t('biz.dashboard.issueNoAds', { defaultValue: '등록된 광고가 없어 이슈를 제출할 수 없습니다.' })}
            </p>
          ) : (
            <>
              <label className={styles.issueLabel} htmlFor="biz-issue-ad-select">
                {t('biz.dashboard.issueSelectAdLabel', { defaultValue: '대상 광고' })}
              </label>
              <select
                id="biz-issue-ad-select"
                className={styles.issueSelect}
                value={issueAdId}
                onChange={(e) => setIssueAdId(e.target.value)}
              >
                <option value="">{t('biz.dashboard.issueSelectAdPlaceholder', { defaultValue: '광고를 선택하세요' })}</option>
                {seriesData?.byAd.map((a) => (
                  <option key={a.adId} value={a.adId}>
                    {a.title}
                  </option>
                ))}
              </select>
              <textarea
                className={styles.issueTextarea}
                placeholder={t('biz.dashboard.issueBodyPlaceholder', {
                  defaultValue: '예: 지난주부터 광고가 노출되지 않습니다.',
                })}
                value={issueBody}
                onChange={(e) => setIssueBody(e.target.value)}
                rows={3}
              />
              <button
                type="button"
                className={styles.issueSubmitBtn}
                onClick={handleSubmitIssue}
                disabled={!issueAdId || !issueBody.trim() || issueSubmitting}
              >
                {t('biz.dashboard.issueSubmit', { defaultValue: '제출' })}
              </button>
              {issueResult === 'success' && (
                <p className={styles.issueSuccessNotice}>
                  {t('biz.dashboard.issueSuccess', { defaultValue: '접수되었습니다. 곧 담당자가 확인합니다.' })}
                </p>
              )}
              {issueResult === 'error' && (
                <p className={styles.issueErrorNotice}>
                  {t('biz.dashboard.issueError', { defaultValue: '제출에 실패했습니다. 다시 시도해 주세요.' })}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {/* 기간 필터는 한 줄, 아래 광고 성과 전체를 스코프한다 (차트별 필터 금지) */}
      <div className={styles.rangeRow} role="group" aria-label={t('biz.dashboard.adPerfRangeGroup', { defaultValue: '조회 기간' })}>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={r === period ? `${styles.rangeBtn} ${styles.rangeBtnOn}` : styles.rangeBtn}
            aria-pressed={r === period}
            onClick={() => setPeriod(r)}
          >
            {t(`biz.dashboard.adPerfRange${r}`, { defaultValue: r === '7d' ? '7일' : r === '14d' ? '14일' : '30일' })}
          </button>
        ))}
      </div>
      {/* 재조회 중엔 스켈레톤으로 갈아치우지 않고 이전 렌더를 흐리게 유지 — 레이아웃 점프 방지 */}
      <div className={seriesLoading && seriesData ? `${styles.adPerfBody} ${styles.refetching}` : styles.adPerfBody}>
        {renderAdPerf()}
      </div>

      <h3 className={styles.sectionTitle}>{t('biz.dashboard.bizStatsTitle', { defaultValue: '업체 지표' })}</h3>
      <div className={styles.statRow}>
        <div className={styles.statCard}>
          <Star size={16} strokeWidth={2} className={styles.statIcon} />
          <span className={styles.statValue}>{reviewAvg != null ? reviewAvg.toFixed(1) : '—'}</span>
          <span className={styles.statLabel}>
            {t('biz.dashboard.reviewStat', { count: reviewTotal, defaultValue: '후기 {{count}}' })}
          </span>
        </div>
        <div className={styles.statCard}>
          <Users size={16} strokeWidth={2} className={styles.statIcon} />
          <span className={styles.statValue}>{followerCount ?? 0}</span>
          <span className={styles.statLabel}>{t('biz.dashboard.followerStat', { defaultValue: '단골' })}</span>
        </div>
        <div className={styles.statCard}>
          <Newspaper size={16} strokeWidth={2} className={styles.statIcon} />
          <span className={styles.statValue}>{newsCount ?? '—'}</span>
          <span className={styles.statLabel}>{t('biz.dashboard.newsStat', { defaultValue: '소식' })}</span>
        </div>
      </div>

      <div className={styles.reviewSectionHead}>
        <h3 className={styles.sectionTitle}>{t('biz.dashboard.recentReviews', { defaultValue: '최근 후기' })}</h3>
        <button
          type="button"
          className={unansweredOnly ? styles.filterToggleActive : styles.filterToggle}
          onClick={() => setUnansweredOnly((v) => !v)}
        >
          {t('biz.dashboard.unansweredOnlyFilter', { count: unansweredCount, defaultValue: '미답변만 ({{count}})' })}
        </button>
      </div>
      {reviewListLoading ? (
        <div className={`shimmer ${styles.listSkeleton}`} />
      ) : reviews.length === 0 ? (
        <StateBlock
          icon={MessageSquare}
          title={
            unansweredOnly
              ? t('biz.dashboard.unansweredEmptyTitle', { defaultValue: '미답변 후기가 없어요' })
              : t('biz.dashboard.reviewEmptyTitle', { defaultValue: '아직 후기가 없어요' })
          }
          desc={t('biz.dashboard.reviewEmptyDesc', { defaultValue: '고객이 후기를 남기면 여기에 표시돼요' })}
        />
      ) : (
        <div className={styles.reviewList}>
          {reviews.map((r) => (
            <article key={r.id} className={styles.reviewCard}>
              <div className={styles.reviewHead}>
                <span className={styles.reviewNick}>{r.reviewerNickname ?? '—'}</span>
                <span className={styles.reviewStars} aria-label={`${r.rating}/5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={12}
                      strokeWidth={0}
                      fill="currentColor"
                      className={n <= r.rating ? styles.starOn : styles.starOff}
                    />
                  ))}
                </span>
                <span className={styles.reviewTime}>{formatRelativeTime(r.createdAt)}</span>
              </div>
              {r.hidden ? (
                <p className={styles.reviewBodyHidden}>
                  {t('biz.dashboard.reviewHiddenNotice', { defaultValue: '운영자 조치로 숨겨진 후기예요' })}
                </p>
              ) : (
                <p className={styles.reviewBody}>{r.body}</p>
              )}
              {r.isReportedByMe && (
                <span className={styles.reportedBadge}>
                  {t('biz.dashboard.reportedByMeBadge', { defaultValue: '내가 신고함' })}
                </span>
              )}
              <ReviewActionRow
                review={r}
                businessName={businessName}
                isOwner
                isMine={false}
                onReply={reviewMod.handleOpenReply}
                onDeleteReply={reviewMod.handleDeleteReply}
                onDeleteMine={() => {}}
                onReport={reviewMod.handleOpenReport}
              />
            </article>
          ))}
          {reviewHasMore && (
            <button
              type="button"
              className={styles.moreBtn}
              onClick={handleMoreReviews}
              disabled={reviewLoadingMore}
            >
              {t('biz.review.more', { defaultValue: '후기 더보기' })}
            </button>
          )}
        </div>
      )}

      <ReviewModerationSheets {...reviewMod.sheetProps} />
    </div>
  );
}

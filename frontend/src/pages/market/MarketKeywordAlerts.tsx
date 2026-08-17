import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bell, Check, Pencil, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { fetchAppConfig } from '@/api/appVersion';
import {
  addKeywordAlert,
  fetchKeywordAlerts,
  removeKeywordAlert,
  updateKeywordAlert,
  type KeywordAlert,
} from '@/api/market';
import styles from './MarketKeywordAlerts.module.css';

/**
 * 키워드 알림 관리 — 전용 페이지 (대표 결정 D-4, 2026-08-17).
 *
 * 종전엔 `MarketMain.tsx` 바텀시트 하나가 등록·목록·삭제를 전부 담당했다(W2 감사).
 * `ProfileCard→UserProfile` 페이지 승격 선례(커밋 4762726)와 같은 원칙 — 등록 폼 +
 * 잠재적으로 긴 목록 + 개별 수정/삭제가 있는 화면은 시트가 아니라 페이지다.
 *
 * 결함 4건(W2 §⑤-부가) 대응: 로딩 스켈레톤, 조회 실패를 빈 목록으로 위장하지 않고
 * StateBlock(tone="error")+재시도로 분리, 등록/수정/삭제 성공 토스트, 개수 카운터.
 */
export default function MarketKeywordAlerts() {
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);

  const [keywords, setKeywords] = useState<KeywordAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [maxCount, setMaxCount] = useState(20);
  const [newKw, setNewKw] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchAppConfig().then((cfg) => setMaxCount(cfg.keywordAlertMaxCount)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    fetchKeywordAlerts(userId)
      .then(setKeywords)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [userId, refreshKey]);

  // 백엔드 실측 에러 계약(min_length/max_count 등의 code)을 err.message 에서 구분한다 —
  // MarketDetail.tsx 의 active_appointment 판별과 동일한 정규식 패턴(코드베이스 관용구 재사용).
  const describeError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : '';
    if (/"code":\s*"keyword_too_short"/.test(msg)) {
      const m = /"min_length":\s*(\d+)/.exec(msg);
      return t('market.keywordTooShort', { min: m ? Number(m[1]) : '', defaultValue: '키워드가 너무 짧아요' });
    }
    if (/"code":\s*"banned_keyword"/.test(msg)) {
      return t('market.keywordBanned', { defaultValue: '등록할 수 없는 단어가 포함되어 있어요' });
    }
    if (/"code":\s*"keyword_alert_limit"/.test(msg)) {
      const m = /"max_count":\s*(\d+)/.exec(msg);
      return t('market.keywordLimitReached', { max: m ? Number(m[1]) : maxCount, defaultValue: '최대 개수에 도달했어요' });
    }
    return t('market.alertError', { defaultValue: '알림 처리 실패' });
  };

  const handleAdd = async () => {
    if (!userId || adding) return;
    const kw = newKw.trim();
    if (!kw) return;
    setAdding(true);
    const before = keywords;
    try {
      const a = await addKeywordAlert(userId, kw);
      const isDuplicate = before.some((x) => x.id === a.id);
      setKeywords((prev) => (prev.some((x) => x.id === a.id) ? prev : [a, ...prev]));
      setNewKw('');
      toast.success(
        isDuplicate
          ? t('market.keywordDuplicate', { defaultValue: '이미 등록된 키워드예요' })
          : t('market.keywordAdded', { defaultValue: '키워드를 추가했어요' }),
      );
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (a: KeywordAlert) => {
    setEditingId(a.id);
    setEditValue(a.keyword);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!userId || savingEdit) return;
    const kw = editValue.trim();
    if (!kw) return;
    setSavingEdit(true);
    try {
      const updated = await updateKeywordAlert(id, userId, kw);
      const mergedIntoExisting = updated.id !== id;
      setKeywords((prev) =>
        mergedIntoExisting
          // 서버가 정규화 결과가 겹치는 기존 row 를 idempotent 하게 반환한 경우 —
          // 수정 대상 row(id) 를 제거하고 그 기존 row(updated)로 병합해 중복 id 를 만들지 않는다.
          ? prev.filter((x) => x.id !== id).map((x) => (x.id === updated.id ? updated : x))
          : prev.map((x) => (x.id === id ? updated : x)),
      );
      setEditingId(null);
      toast.success(
        mergedIntoExisting
          ? t('market.keywordDuplicate', { defaultValue: '이미 등록된 키워드예요' })
          : t('market.keywordUpdated', { defaultValue: '키워드를 수정했어요' }),
      );
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!userId) return;
    try {
      await removeKeywordAlert(id, userId);
      setKeywords((prev) => prev.filter((x) => x.id !== id));
      if (editingId === id) cancelEdit();
      toast.success(t('market.keywordRemoved', { defaultValue: '키워드를 삭제했어요' }));
    } catch {
      toast.error(t('market.alertError', { defaultValue: '알림 처리 실패' }));
    }
  };

  return (
    <div className={styles.root}>
      <TopBar title={t('market.keywordAlerts', { defaultValue: '키워드 알림' })} />
      <div className={styles.body}>
        <p className={styles.desc}>
          {t('market.keywordAlertsDesc', { defaultValue: '키워드와 맞는 매물이 올라오면 알려드려요' })}
        </p>

        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={newKw}
            onChange={(e) => setNewKw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('market.keywordPlaceholder', { defaultValue: '예: 헬멧, 타이어' })}
            maxLength={60}
          />
          <Button onClick={handleAdd} fullWidth={false} disabled={!newKw.trim() || adding} loading={adding}>
            {t('market.keywordAdd', { defaultValue: '추가' })}
          </Button>
        </div>

        {!loading && !loadError && (
          <p className={styles.count}>
            {t('market.keywordCount', { count: keywords.length, max: maxCount, defaultValue: `${keywords.length}/${maxCount}개 등록됨` })}
          </p>
        )}

        <div className={styles.list}>
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skelRow}`} />)
          ) : loadError ? (
            <div className={styles.stateWrap}>
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('market.keywordLoadError', { defaultValue: '키워드 알림을 불러오지 못했어요' })}
                actionLabel={t('common.retry')}
                onAction={() => setRefreshKey((k) => k + 1)}
              />
            </div>
          ) : keywords.length === 0 ? (
            <div className={styles.stateWrap}>
              <StateBlock icon={Bell} title={t('market.keywordEmpty', { defaultValue: '등록한 키워드가 없어요' })} />
            </div>
          ) : (
            keywords.map((a) => (
              <div key={a.id} className={styles.row}>
                {editingId === a.id ? (
                  <>
                    <input
                      className={styles.editInput}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(a.id)}
                      maxLength={60}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => handleSaveEdit(a.id)}
                      disabled={!editValue.trim() || savingEdit}
                      aria-label={t('common.save')}
                    >
                      <Check size={18} strokeWidth={2.4} />
                    </button>
                    <button type="button" className={styles.iconBtn} onClick={cancelEdit} aria-label={t('common.cancel')}>
                      <X size={18} strokeWidth={2.4} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={styles.keyword}>{a.keyword}</span>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => startEdit(a)}
                      aria-label={t('market.keywordEdit', { defaultValue: '수정' })}
                    >
                      <Pencil size={16} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => handleRemove(a.id)}
                      aria-label={t('market.keywordRemove', { defaultValue: '삭제' })}
                    >
                      <X size={18} strokeWidth={2.4} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

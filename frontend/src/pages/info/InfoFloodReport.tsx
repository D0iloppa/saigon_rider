import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Check, Gift, LocateFixed, MapPin } from 'lucide-react';
import { floodApi } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { parseCoordsFromQuery, type Coords } from '@/lib/infoCoords';
import { requireServiceLocation, type LocationGateReason } from '@/lib/serviceLocation';
import { inServiceArea } from '@/lib/serviceArea';
import LocationGateBlock from '@/components/location/LocationGateBlock';
import { findNearestDistrict } from '@/components/maps/district-data';
import { getDepth } from '@/components/flood/flood-tokens';
import sys from '@/styles/system.module.css';
import styles from './InfoFloodReport.module.css';

type DepthLevel = 'ankle' | 'knee' | 'thigh' | 'above';

const DEPTH_CODES: DepthLevel[] = ['ankle', 'knee', 'thigh', 'above'];

export default function InfoFloodReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();

  // 쿼리로 넘어온 좌표(침수지도 '여기 제보')도 권역 판정을 통과해야 한다 — 제보는 좌표가
  // DB 에 영속되는 **기록형** 화면이라 권역 밖 좌표가 들어가면 지도에 핀이 찍히고 복구 수단이
  // 어드민 수동 삭제뿐이다(260813 정책안 §1 기록형 / 결함 #7).
  const [coords, setCoords] = useState<Coords | null>(() => {
    const q = parseCoordsFromQuery(search);
    return q && inServiceArea(q.lat, q.lng) ? q : null;
  });
  const [gateReason, setGateReason] = useState<LocationGateReason | null>(() => {
    const q = parseCoordsFromQuery(search);
    return q && !inServiceArea(q.lat, q.lng) ? 'outside_area' : null;
  });
  const [locating, setLocating] = useState(false);
  const [depth, setDepth] = useState<DepthLevel | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const locationDistrict = coords ? findNearestDistrict(coords.lat, coords.lng) : null;

  const baseXP = 30;
  const photoXP = hasPhoto ? 10 : 0;
  const confirmXP = 10;
  const totalXP = baseXP + photoXP + confirmXP;

  const depthLabel = (d: DepthLevel) =>
    t(`info.flood.depth${d.charAt(0).toUpperCase()}${d.slice(1)}`, d);

  async function handleLocate() {
    if (locating) return;
    setLocating(true);
    const result = await requireServiceLocation();
    if (result.ok) {
      setCoords(result.coords);
      setGateReason(null);
    } else {
      setCoords(null);
      setGateReason(result.reason);
    }
    setLocating(false);
  }

  async function handleSubmit() {
    if (!depth || submitting || !coords) return;
    // 마지막 방어선 — 어떤 경로로 들어온 좌표든 권역 밖이면 저장하지 않는다.
    if (!inServiceArea(coords.lat, coords.lng)) {
      setCoords(null);
      setGateReason('outside_area');
      // 조용히 거절하면 "버튼이 아무 일도 안 한다"로 읽힌다(코드리뷰 지적 2026-08-13).
      toast.neutral(t('locationGate.outside_area.title'));
      return;
    }
    setSubmitting(true);
    try {
      await floodApi.report({
        lat: coords.lat,
        lng: coords.lng,
        depth_level: depth,
      });
      setDone(true);
      setTimeout(() => navigate(-1), 800);
    } catch (err) {
      toast.error(extractDetail(err, t('info.flood.reportError', '제보에 실패했어요')));
    } finally {
      setSubmitting(false);
    }
  }

  const saveBtn = (
    <button
      className={styles.saveBtn}
      onClick={handleSubmit}
      disabled={!depth || submitting || !coords}
    >
      {t('common.save')}
    </button>
  );

  return (
    <div className={sys.page}>
      <TopBar
        title={t('info.flood.reportTitle')}
        onBack={() => navigate(-1)}
        rightContent={saveBtn}
      />

      <div className={`${sys.scroll} ${styles.scroll}`}>
        {/* Location card — GPS 는 아래 명시 버튼에서만 측정 */}
        <div className={styles.locationCard}>
          <div className={styles.locationRow}>
            <MapPin size={15} strokeWidth={2.2} className={styles.locationPin} />
            <span className={styles.locationLabel}>
              {coords ? t('info.flood.locationSelected') : t('info.flood.locationRequired')}
            </span>
          </div>
          <div className={styles.locationName}>
            {locationDistrict
              ? `${locationDistrict.oldDistrict} · ${locationDistrict.nameVi}`
              : coords
              ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
              : t('info.flood.locationRequiredDesc')}
          </div>
          {gateReason ? (
            <LocationGateBlock reason={gateReason} onRetry={handleLocate} />
          ) : (
            <button
              type="button"
              className={`${sys.chipBtn} ${styles.locateBtn}`}
              onClick={handleLocate}
              disabled={locating}
            >
              <LocateFixed size={14} strokeWidth={2.2} />
              {locating ? t('info.flood.locationLocating') : t('info.flood.useCurrentLocation')}
            </button>
          )}
        </div>

        {/* Depth selection — 침수지도 제보 시트와 동일 문법 (flood-tokens 색) */}
        <div className={styles.depthTitle}>{t('info.flood.depthQuestion')}</div>
        <div className={styles.depthGrid}>
          {DEPTH_CODES.map((code) => {
            const token = getDepth(code);
            const selected = depth === code;
            return (
              <button
                key={code}
                type="button"
                className={`${styles.depthBtn} ${selected ? styles.depthBtnSel : ''}`}
                style={selected ? { borderColor: token.fillColor, background: `${token.fillColor}14` } : undefined}
                onClick={() => setDepth(code)}
              >
                <span className={styles.depthDot} style={{ background: token.fillColor }} />
                <span className={styles.depthLabel}>{depthLabel(code)}</span>
                {selected && <Check size={14} strokeWidth={2.5} style={{ color: token.color }} />}
              </button>
            );
          })}
        </div>

        {/* Photo */}
        <div className={styles.photoTitle}>{t('info.flood.photoOption')}</div>
        <button
          type="button"
          className={`${styles.photoBox} ${hasPhoto ? styles.photoBoxActive : ''}`}
          onClick={() => setHasPhoto((v) => !v)}
        >
          <Camera size={18} strokeWidth={2} />
          <span className={styles.photoLabel}>
            {hasPhoto ? t('info.flood.photoAdded') : t('info.flood.addPhoto')}
          </span>
        </button>

        <div className={styles.divider} />

        {/* XP Reward box (리워드 골드 톤) */}
        <div className={styles.gpBox}>
          <div className={styles.gpTitle}>
            <Gift size={14} strokeWidth={2.2} />
            {t('info.flood.xpTitle')}
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.flood.xpReport')}</span>
            <span className={`${styles.gpAmount} num`}>+{baseXP} XP</span>
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.flood.xpAddPhoto')}</span>
            <span className={`${hasPhoto ? styles.gpAmount : styles.gpDim} num`}>
              +10 XP{!hasPhoto ? ` ${t('info.flood.xpPhotoSkipped')}` : ''}
            </span>
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.flood.xpConfirm')}</span>
            <span className={`${styles.gpAmount} num`}>+{confirmXP} XP</span>
          </div>
          <div className={`${styles.gpRow} ${styles.gpTotal}`}>
            <span>{t('info.flood.xpNow')}</span>
            <span className="num">{totalXP} XP</span>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className={styles.ctaWrap}>
        <button
          className={`${styles.cta} ${done ? styles.ctaDone : ''}`}
          onClick={handleSubmit}
          disabled={!depth || submitting || !coords}
        >
          {done
            ? t('info.flood.ctaDone')
            : submitting
            ? t('info.flood.ctaSubmitting')
            : t('info.flood.ctaSubmit')}
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Heart, MapPin, MessageSquareQuote, Plus, RotateCw, SlidersHorizontal, Store, Users, X, ZoomIn } from 'lucide-react';
import SaigonMapV5, { findWardAt, L3_ENABLED } from '@/components/maps/SaigonMapV5';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import DraggableSheet, { type DraggableSheetHandle } from '@/components/ride/DraggableSheet';
import { AppImage } from '@/components/ui/AppImage';
import { SearchBox } from '@/components/ui/SearchBox';
import { StarIcon } from '@/components/ui/StarIcon';
import { useLocationStore, useSelectedRegion } from '@/store/useLocationStore';
import { useUserStore } from '@/store/useUserStore';
import { fetchBizMapItems, fetchBizCategories, fetchBizFavorites, bizCategoryLabel, type BizMapItem, type BizCategory } from '@/api/biz';
import { isNewsUnread, markBizNewsRead } from '@/lib/bizNewsRead';
import { toast } from '@/components/ui/Toast';
import { BIZ_CAT_ICON_PATH, BIZ_CAT_COLOR, BIZ_CAT_COLOR_FALLBACK } from '@/components/maps/bizCategoryIcons';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { fetchPoiMapItems, type PoiMapItem } from '@/api/poi';
import { buildPoiLayer } from '@/components/maps/poiLayer';
import { PostPanel, type PanelItem } from '@/pages/map/PostPanel';
import BizReviewPickerSheet from '@/pages/map/BizReviewPickerSheet';
import BizReviewSheet from '@/pages/biz/BizReviewSheet';
import { useBizViewerCount } from '@/hooks/useBizViewerCount';
import { formatRelativeTime } from '@/lib/format';
import { haversineM } from '@/lib/polyline';
import { requestDeviceLocation } from '@/lib/serviceLocation';
import BizRichCard from './BizRichCard';
import styles from './NeighborhoodMap.module.css';

type BrowseMode = 'viewport' | 'region';
const HCMC_BBOX = { minLat: 10.40, maxLat: 11.10, minLng: 106.40, maxLng: 107.00 };
// 업체 핀 색 (마커 위계 역전, 2026-07-21) — 업체가 지도 주 콘텐츠이므로 카테고리 색
// 원형 마커 + 흰 글리프로 부상시킨다 (Google place marker / 당근 카테고리 핀 관례).
// 미지정/미지 카테고리는 브랜드 오렌지 폴백(기존 BIZ_COLOR 와 동일 값). ※ 색은 시작값.
const bizCatColor = (category: string | null | undefined) =>
  (category && BIZ_CAT_COLOR[category]) || BIZ_CAT_COLOR_FALLBACK;
// 자동 말풍선 (2026-07-11) — 뷰포트 세로 스팬이 이 값 이하일 때만 중앙 근접 업체를 터치 없이
// 활성화한다. 세로 폰(≈2.16:1)에서 lat 스팬은 lng 스팬의 2배+ 로 복원되므로 0.03(가로 ≈1.5km,
// 동 단위 줌인)으로 잡는다. 반경은 뷰포트 스팬 대비 정규화 거리(0.5=화면 가장자리).
const AUTO_BUBBLE_MAX_LAT_SPAN = 0.03;
const AUTO_BUBBLE_CENTER_RADIUS = 0.25;
// 업체 탭 카테고리 칩 줄 높이 — 지도 확대/축소 버튼을 그 아래로 밀어내는 데 사용
const CATEGORY_CHIPS_HEIGHT = 42;
// SearchBox 높이(44px) + searchOverlay 상단 여백(10px) — 지도 확대/축소 버튼이 검색창 아래로 오도록
const SEARCH_BAR_HEIGHT = 54;
// 검색범위(query bbox) 상단 크롭 전용 여유값 — 실측한 검색바/칩 줄 하단 경계에 살짝 더 얹어
// 마커가 크롬 가장자리에 바짝 붙지 않게 한다.
const QUERY_TOP_INSET_PAD = 8;
const RECENT_SEARCH_KEY = 'sr_map_recent_searches';
const RECENT_SEARCH_MAX = 8;
// 마지막 뷰포트 기억 — 재진입 시 복원용 (측정이 아닌 "기억"이라 GPS 원칙 위반 아님)
const VIEWPORT_KEY = 'sgr.map.viewport';
// 콜드 앱 진입(세션 첫 마운트)은 게이트 줌으로 리셋, 세션 내 재마운트(탭 전환/뒤로가기
// 복귀)에서만 저장 뷰포트 복원 — 도일 결정 2026-07-15. 모듈 스코프 플래그는 콜드 런치 시
// JS 컨텍스트가 새로 뜨며 false 로 초기화되므로 "콜드 vs 세션 내"를 구분한다.
let mapSessionEntered = false;
// BizPublic(/biz/:id) 이동 직전 지도 컨텍스트 스냅샷 — 뒤로가기(POP) 복귀 시 1회 소비
// (MarketMain mkt_filter_v2 미러). 뷰포트는 VIEWPORT_KEY 가 별도로 복원하므로 담지 않는다.
// 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 저장/복원 비활성.
// 키 상수는 과거 세션 잔존 키 정리 이펙트가 계속 사용한다.
const BIZ_RETURN_KEY = 'sgr.map.bizReturn';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

type LatLngBbox = { N: number; S: number; E: number; W: number };

// region(동 선택) 모드에서 업체 bbox 조회용 — 폴리곤 외접 bbox (내부 여부는 regionContains로 재필터)
function regionBbox(r: SelectedRegion): LatLngBbox {
  if (r.poly.length < 3) {
    const d = 0.01;
    return { N: r.lat + d, S: r.lat - d, E: r.lng + d, W: r.lng - d };
  }
  const lats = r.poly.map((p) => p.lat);
  const lngs = r.poly.map((p) => p.lng);
  return { N: Math.max(...lats), S: Math.min(...lats), E: Math.max(...lngs), W: Math.min(...lngs) };
}

function loadSavedViewport(): LatLngBbox | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWPORT_KEY) ?? 'null') as Partial<LatLngBbox> | null;
    if (
      v &&
      typeof v.N === 'number' && typeof v.S === 'number' &&
      typeof v.E === 'number' && typeof v.W === 'number' &&
      Number.isFinite(v.N) && Number.isFinite(v.S) &&
      Number.isFinite(v.E) && Number.isFinite(v.W) &&
      v.N > v.S && v.E > v.W
    ) {
      return { N: v.N, S: v.S, E: v.E, W: v.W };
    }
  } catch {
    // 손상된 저장값은 무시하고 기본(전역) 진입
  }
  return null;
}

// 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성 (로직 보존)
// type BizReturnUi =
//   | { kind: 'postPanel'; bizId: string; carouselIndex: number }
//   | { kind: 'bubble'; bizId: string }
//   | { kind: 'none' };
//
// interface BizReturnSnapshot {
//   tab: Tab;
//   bizCategory: string | null;
//   favOnly: boolean;
//   ui: BizReturnUi;
//   savedAt: number;
// }
//
// function readBizReturnSnapshot(): BizReturnSnapshot | null {
//   try {
//     const s = sessionStorage.getItem(BIZ_RETURN_KEY);
//     return s ? (JSON.parse(s) as BizReturnSnapshot) : null;
//   } catch {
//     return null;
//   }
// }

function loadRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 동네지도 지도 모드 (SGR-287) — 온디맨드 풀스크린 지도 + 하단 드래거블 시트.
 * GPS 기준 동 자동 진입 → 전체 depth3 오버레이 → 블록 탭으로 구역 필터링.
 */
interface Props {
  onExitMap?: () => void;
  initialQuery?: string;
  initialBizCategory?: string | null;
  lightweight?: boolean;
  // P1-5: 목록(NeighborhoodMap)에서 고른 로컬 selectedRegion 을 지도 진입 시 1회 시드한다.
  // 전역 useSelectedRegion(useLocationStore)보다 우선하는 "로컬 초기값"일 뿐 — 전역 스토어에는
  // 쓰지 않는다(다른 화면 위치 오염 방지, 과거 사고 패턴). 미전달 시 기존 동작과 동일.
  initialRegion?: SelectedRegion | null;
}

// 로딩 표시 디바운스 — active 가 showDelay(ms) 이상 지속될 때만 켜고, 한 번 켜지면 minVisible(ms)
// 동안 유지한다. 페이지네이션 fetch 가 매 페이지마다 bizLoading 을 토글해도 헤더 스피너가
// 껌뻑이지 않게 하는 표시-전용 가드다 (fetch/페이지네이션 로직은 불변).
function useDelayedFlag(active: boolean, showDelay = 250, minVisible = 400): boolean {
  const [shown, setShown] = useState(false);
  const shownAtRef = useRef(0);
  useEffect(() => {
    if (active) {
      if (shown) return;
      const timer = setTimeout(() => { shownAtRef.current = Date.now(); setShown(true); }, showDelay);
      return () => clearTimeout(timer);
    }
    if (shown) {
      const remain = Math.max(0, minVisible - (Date.now() - shownAtRef.current));
      const timer = setTimeout(() => setShown(false), remain);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [active, shown, showDelay, minVisible]);
  return shown;
}

export default function NeighborhoodMapCanvas({
  onExitMap,
  initialQuery = '',
  initialBizCategory = null,
  lightweight = false,
  initialRegion = null,
}: Props) {
  const { t, i18n } = useTranslation();
  // ── L3 상세지도(건물 depth3 + POI 참조 레이어) 부활 게이트 ──────────────────
  // L3_ENABLED(true=부활 기본값)이 켜지면 SaigonMapV5 를 비-lightweight 로 구동해
  // depth3 상세 레이어를 로드/렌더하고, POI 참조 레이어도 조회·렌더한다.
  // 끄려면 SaigonMapV5.tsx 상단의 L3_ENABLED 를 false 로 → 여기서 childLightweight 가
  // 원래 lightweight prop 으로 폴백해 오버홀 기본(경량 L1/L2, POI 없음)으로 되돌아간다.
  // (지도 도구 UI [♥/+] 는 원래 lightweight prop 을 그대로 따르므로 이 게이트와 무관.)
  const childLightweight = L3_ENABLED ? false : lightweight;
  const navigate = useNavigate();
  // 상세 3종(업체/매물/피드) 진입은 backgroundLocation state 로 오버레이 렌더 (App.tsx 라우트-모달)
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useUserStore((s) => s.user);
  // 단일 SoT — 지역 선택은 useLocationStore(동네지도가 기준). 'region'(선택 동) ↔ 'all'(전체).
  const selectRegion = useLocationStore((s) => s.selectRegion);
  const selectAll = useLocationStore((s) => s.selectAll);
  const globalSelectedRegion = useSelectedRegion(user?.id);
  // initialRegion 은 마운트 시점 1회 시드값만 — 전역 스토어에는 쓰지 않는다(prop 미전달 시
  // localRegionSeed 는 null 이라 selectedRegion === globalSelectedRegion, 기존 동작과 동일).
  const [localRegionSeed, setLocalRegionSeed] = useState<SelectedRegion | null>(initialRegion);
  const selectedRegion = localRegionSeed ?? globalSelectedRegion;
  const storedCoords = selectedRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : null;

  // BizPublic 뒤로가기(POP) 복귀에서만 스냅샷을 읽는다 — 탭바 신규 진입(PUSH/REPLACE)은
  // 기본 상태로 시작. 마운트 이펙트에서 진입 종류와 무관하게 즉시 삭제해 재적용을 차단한다.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // const [returnSnapshot] = useState(() => (navigationType === 'POP' ? readBizReturnSnapshot() : null));
  // mode 는 스토어의 선택 지역에서 파생 — 선택 동이 있으면 'region', 없으면 'viewport'(전체 탐색).
  const mode: BrowseMode = selectedRegion ? 'region' : 'viewport';
  const [bizItems, setBizItems] = useState<BizMapItem[]>([]);
  // POI 상시 참조 레이어 (Phase A-2) — 탭 배타 마커(biz/feed)와 독립.
  // 이름 라벨 상시 노출·탭 동작 없음이라 selection 상태가 필요 없다.
  const [poiItems, setPoiItems] = useState<PoiMapItem[]>([]);
  const [bizCategories, setBizCategories] = useState<BizCategory[]>([]);
  const [bizCategory, setBizCategory] = useState<string | null>(initialBizCategory);
  const [bizLoading, setBizLoading] = useState(false);
  // 진입 시 GPS 1회 — 리치 가게 카드 거리 표기 기준점(리스트와 동일 로직). 거부/실패 시 거리만 생략.
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  // 좌측 ♥ 버튼 = "찜한 업체만 보기" 토글 필터 (카테고리 칩과 AND 교집합, visibleBiz 에서 적용)
  const [favOnly, setFavOnly] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  // 좌측 + 버튼 = 글쓰기 컨텍스트 메뉴 (후기쓰기/장소 제안하기)
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 후기쓰기 플로우 — 대상 업체(작성 시트) / 후보 목록(선택 스텝). 둘 다 지도 위 오버레이라
  // 뒤로가기 스냅샷(sgr.map.bizReturn)·시트 상태와 무관하다.
  const [reviewTarget, setReviewTarget] = useState<{ id: string; name: string } | null>(null);
  const [reviewPickerItems, setReviewPickerItems] = useState<BizMapItem[] | null>(null);
  const [bizError, setBizError] = useState(false);
  const [poiError, setPoiError] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 말풍선 데이터 = BizMapItem.latestNews (business_news 실데이터, 2026-07-11).
  // 소식이 없는 업체는 소개 카피(업종·주소)로 폴백한다.
  const [selectedBiz, setSelectedBiz] = useState<BizMapItem | null>(null);
  // 포스트 패널 (W2, 당근 레퍼런스) — 핀 "직접 터치" 시 바텀시트를 대체하는 캐러셀.
  // 업체 항목은 열 때 스냅샷으로 고정(대표 결정 2026-07-11) — 캐러셀이 유발한
  // recenter→bbox→visibleBiz 재계산이 다시 순서를 흔드는 피드백 루프 방지.
  // 매물/피드 항목(패키지 C)은 반대로 지도 이동(사용자 팬/줌) 시 재구성한다 — 아래 재검색
  // 이펙트 참조. selectedBiz(자동 말풍선)와 상태를 공유하지 않는다.
  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState<PanelItem[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [postPanelHeight, setPostPanelHeight] = useState(0);
  // 읽음 처리 직후 같은 데이터로도 markers(badge) 재계산을 트리거 (W4)
  const [readVersion, setReadVersion] = useState(0);
  const focusPointRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  const zoomInRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // [X]로 닫은 업체는 다음 지도 조작(새 bbox 커밋)까지 자동 말풍선 1회 억제 (대표 결정 2026-07-11)
  const suppressAutoBubbleIdRef = useRef<string | null>(null);
  // 뒤로가기 복원 2단계(선택 UI) — 업체 데이터는 bbox fetch 후에야 도착하므로 보류해 두고,
  // 첫 fetch 완료 시 1회 소비한다 (MarketMain scrollRestoredRef 패턴).
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // const pendingUiRestoreRef = useRef<Exclude<BizReturnUi, { kind: 'none' }> | null>(
  //   returnSnapshot && returnSnapshot.ui.kind !== 'none' ? returnSnapshot.ui : null,
  // );
  // "fetch 가 실제로 완료됐는가" 표시 — 게이트/탭 전환의 setBizItems([]) 와 구분한다
  const bizFetchedRef = useRef(false);
  const focusedItem = postPanelOpen ? carouselItems[carouselIndex] ?? null : null;
  const focusedBiz = focusedItem?.kind === 'biz' ? focusedItem.biz : null;
  const suppressPanelRebuildRef = useRef(false);
  const viewerCount = useBizViewerCount(focusedBiz?.id ?? null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(0);
  const [sheetSnap, setSheetSnap] = useState<'full' | 'mid' | 'collapsed'>('collapsed');
  // 검색범위(query bbox) 하단 크롭 전용 — sheetVisibleHeight는 시트가 펼쳐지면(mid/full) 커지는
  // "현재" 실측값이라 그대로 못 쓴다. collapsed 스냅으로 정착할 때의 실측값(=DraggableSheet
  // peek, 헤더 행 높이 — DraggableSheet.tsx:98,105 offsetOf('collapsed')와 동일 소스)만 캡처해
  // 시트가 펼쳐져도 하단 경계를 최소화 높이로 고정한다(대표 명시 요구).
  const [collapsedSheetHeight, setCollapsedSheetHeight] = useState(0);
  useEffect(() => {
    if (sheetSnap === 'collapsed') setCollapsedSheetHeight(sheetVisibleHeight);
  }, [sheetSnap, sheetVisibleHeight]);

  // 진입 시 GPS 1회 — 리치 가게 카드 거리 표기 기준점(NeighborhoodMap 리스트와 동일 로직).
  useEffect(() => {
    let cancelled = false;
    requestDeviceLocation()
      .then((pos) => {
        if (!cancelled) setUserPos({ lat: pos.lat, lng: pos.lng });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const locateRef = useRef<(() => void) | null>(null);
  const emitBboxRef = useRef<(() => void) | null>(null);
  const searchFitRef = useRef<((points: { lat: number; lng: number }[]) => void) | null>(null);
  const [viewportBbox, setViewportBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const [showDistrictBadges, setShowDistrictBadges] = useState(true);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // 지역선택 해제(resetToViewport) 동기 emit 창에서만 true — handleBboxChange가 디바운스·
  // mode 가드 없이 현재 뷰포트 bbox를 즉시 커밋하게 한다 (500ms 공백 동안 0건 깜빡임 방지)
  const bboxImmediateRef = useRef(false);
  // 마운트 시 1회만 읽는다 — 이후 저장은 handleBboxChange 디바운스가 담당.
  // 콜드 진입(세션 첫 마운트)은 저장 뷰포트를 무시하고 게이트 줌으로 진입한다.
  const [savedViewport] = useState<LatLngBbox | null>(() => {
    if (!mapSessionEntered) { mapSessionEntered = true; return null; }
    return loadSavedViewport();
  });

  // 검색 — 업체명 검색 전용(피드는 키워드 검색 미지원, 매물 탭은 마켓으로 이전됨).
  // 검색은 전체화면 패널(당근 패턴)에서 입력받고, 패널을 닫으면 지도가 결과를 보여줌 — 지도 화면
  // 자체는 바텀시트를 강제로 올리는 등 검색 중 레이아웃을 바꾸지 않는다.
  // searchQuery = 패널 입력 draft, submittedQuery = 실제 검색 확정값(Enter/최근검색 탭).
  // 패널이 결과를 보여주지 않으므로 타이핑 중 라이브 검색은 무의미 — 제출 시점에만 fetch한다
  // (뒤로가기로 취소했는데 검색모드로 전환돼 버리던 문제 + 안 보이는 fetch/지도 re-fit 제거).
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [bizSearchResults, setBizSearchResults] = useState<BizMapItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const isSearching = submittedQuery.length > 0;

  // 패널이 열리는 "그 순간"의 .root 높이를 한 번만 캡처해 고정한다 — 이후 키보드가 뜨면서
  // 100dvh가 줄어들어도(WKWebView가 interactive-widget=resizes-visual을 지원 안 할 수 있음)
  // 패널 자체는 이 픽셀값 그대로 유지되고, 키보드는 그 위에 순수 오버레이로만 뜬다.
  const rootRef = useRef<HTMLDivElement>(null);
  const [lockedPanelHeight, setLockedPanelHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (searchPanelOpen) setLockedPanelHeight(rootRef.current?.clientHeight ?? null);
  }, [searchPanelOpen]);

  // 검색범위(query bbox) 상단 크롭 전용 — searchOverlay/chipsOverlay는 상태바 높이(플랫폼별로
  // 다름, --status-bar-height)만큼 아래에서 시작하는데, 상수(SEARCH_BAR_HEIGHT/
  // CATEGORY_CHIPS_HEIGHT)는 그 상태바 여백을 포함하지 않아 실제 칩 줄 하단보다 위에서
  // 크롭돼 칩에 가린 마커가 검색범위에 잡히는 버그가 있었다. .root 기준 실측 좌표로 잡아
  // 플랫폼과 무관하게 항상 정확한 값을 쓴다. topInsetPx(라벨 디클러터 중앙 보정·줌 컨트롤
  // 배치용, SaigonMapV5 참조)와는 별개 채널 — 저 값은 그대로 둔다.
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const chipsOverlayRef = useRef<HTMLDivElement>(null);
  const [queryTopInsetPx, setQueryTopInsetPx] = useState(SEARCH_BAR_HEIGHT);
  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      const bottomEl = !isSearching ? chipsOverlayRef.current : searchOverlayRef.current;
      if (!root || !bottomEl) return;
      const bottom = bottomEl.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
      setQueryTopInsetPx(Math.max(0, bottom + QUERY_TOP_INSET_PAD));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (searchOverlayRef.current) ro.observe(searchOverlayRef.current);
    if (chipsOverlayRef.current) ro.observe(chipsOverlayRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [isSearching]);

  // 시트 드래그 매 프레임 visible height — React setState 대신 CSS 변수만 기록(프레임당 DOM 1회,
  // 리렌더 0회). mapTools 의 bottom 이 이 변수를 따라가고, React 상태(sheetVisibleHeight)는
  // onVisibleHeightSettle 로 스냅 정착 시에만 커밋된다 → bottomInsetPx(지도 viewBox 클램프)도
  // 정착 시 1회만 갱신 (드래그 중 매 프레임 지도 전체 리페인트 방지).
  // 변수는 화면 루트가 아니라 유일 소비자인 mapTools 요소에 직접 기록한다 — 루트에 쓰면 커스텀
  // 프로퍼티 무효화가 SVG 지도 전체 서브트리 스타일 리캘크를 유발해(계측 +25ms/frame) 역효과.
  const sheetVisibleHLiveRef = useRef(0);
  const mapToolsRef = useRef<HTMLDivElement | null>(null);
  // 콜백 ref — mapTools 는 isSearching 등으로 언마운트/재마운트되므로, 재마운트 시점에 최신
  // 라이브 값으로 변수를 1회 시드해 stale(기본값 0px) 위치로 그려지는 프레임을 막는다.
  const setMapToolsRef = useCallback((el: HTMLDivElement | null) => {
    mapToolsRef.current = el;
    el?.style.setProperty('--sheet-visible-h', `${sheetVisibleHLiveRef.current}px`);
  }, []);
  // 줌힌트 필(우측 floating)도 mapTools 와 동일한 변수 추적 대상 — 소비자 2곳에 각각 기록
  const zoomPillRef = useRef<HTMLButtonElement | null>(null);
  const setZoomPillRef = useCallback((el: HTMLButtonElement | null) => {
    zoomPillRef.current = el;
    el?.style.setProperty('--sheet-visible-h', `${sheetVisibleHLiveRef.current}px`);
  }, []);
  const handleSheetVisibleHeightLive = useCallback((h: number) => {
    sheetVisibleHLiveRef.current = h;
    mapToolsRef.current?.style.setProperty('--sheet-visible-h', `${h}px`);
    zoomPillRef.current?.style.setProperty('--sheet-visible-h', `${h}px`);
  }, []);

  const addRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) => {
      const next = [keyword, ...prev.filter((k) => k !== keyword)].slice(0, RECENT_SEARCH_MAX);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((k) => k !== keyword);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCH_KEY);
  }, []);

  // 뒤로가기 = 검색 취소: 패널을 닫고 draft를 확정값으로 되돌린다(타이핑만 하고 나가도 흔적 없음)
  const closeSearchPanel = useCallback(() => {
    setSearchPanelOpen(false);
    setSearchQuery(submittedQuery);
  }, [submittedQuery]);

  const submitSearch = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    setSearchQuery(trimmed);
    setSubmittedQuery(trimmed);
    if (trimmed) addRecentSearch(trimmed);
    setSearchPanelOpen(false);
    setPostPanelOpen(false); // 검색 확정 = 새 탐색 컨텍스트 — 포스트 패널 해제 (W2)
  }, [addRecentSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSubmittedQuery('');
    // 검색 해제 = 검색 결과 핀(forceMarkers) 소멸 — 그 핀으로 연 매물/피드 팝업도 함께 닫는다
    // (게이트 미통과 줌아웃에서는 뷰포트 핀이 없어 고아 팝업이 잔존, 패키지 C 리뷰 MINOR).
    // 업체 팝업은 기존 동작 유지(열림 중 후보 동결 — 검색 해제와 무관하게 잔존).
    if (focusedItem && focusedItem.kind !== 'biz') {
      suppressPanelRebuildRef.current = false;
      setPostPanelOpen(false);
      setCarouselItems([]);
      setCarouselIndex(0);
    }
  }, [focusedItem]);

  // 의도적으로 visualViewport를 추적하지 않는다 — 키보드가 뜨든 말든 패널 크기는 100dvh 고정,
  // 키보드는 그 위에 순수 오버레이로만 뜨게 한다(탭바 포함 화면 전체를 항상 덮어야 함).

  useEffect(() => {
    if (!submittedQuery) {
      setBizSearchResults([]); setSearchError(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(false);
    // N-2: 100 이면 101번째부터 검색결과에서 조용히 사라진다 — NeighborhoodMap 과 동일하게 상향.
    fetchBizMapItems({ ...HCMC_BBOX, q: submittedQuery, signal: controller.signal, maxItems: 1000 })
      .then((items) => {
        if (cancelled) return;
        setSearchError(false);
        setBizSearchResults(items);
        const points = items.map((b) => ({ lat: b.lat, lng: b.lng }));
        if (points.length > 0) searchFitRef.current?.(points);
      })
      .catch((error) => {
        if (!cancelled && !isAbortError(error)) {
          setSearchError(true);
          setBizSearchResults([]);
        }
      })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [submittedQuery, reloadSeq]);

  // region 모드에서는 bbox emit을 소비하지 않는다 — 시트 높이 변화·팬 등으로 들어온 bbox가
  // handleRegionSelect가 비워둔 viewportBbox를 몰래 되살려, 이후 뷰포트 모드 전환 시
  // 가이드(빈 상태) 대신 필터 결과가 바로 뜨는 문제가 있었음. ref로 최신 mode를 읽는다.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // 줌 게이트 판정을 fetch 이펙트에서 ref로 읽는다 — state를 deps에 넣으면 게이트를
  // 넘는 순간(배지 플래그가 먼저 뒤집히고 bbox 커밋은 500ms 뒤) 낡은 광역 bbox로
  // 즉시 한 번 fetch가 나가는 낭비가 생김. bbox 커밋 시점에만 최신 게이트를 확인한다.
  const showDistrictBadgesRef = useRef(showDistrictBadges);
  showDistrictBadgesRef.current = showDistrictBadges;

  // 크롭 이전(raw) bbox — SaigonMapV5.onRawViewportChange 가 onBboxChange(크롭된 fetch/카운트/
  // 리스트/마커용)와 같은 tick에 "먼저" emit한다(SaigonMapV5.tsx 순서 보장). (N+S)/2가 실제
  // 컨테이너 기하 중심과 일치하는 유일한 채널 — 뷰포트
  // 저장(VIEWPORT_KEY)·커밋된 중심(viewportRawBbox)이 모두 이 값을 쓴다. 크롭 bbox(bboxFilter)는
  // 여전히 fetch/카운트/리스트/마커 전용으로 남는다 — 이 raw 채널과 절대 섞지 않는다.
  const latestRawBboxRef = useRef<LatLngBbox | null>(null);
  const handleRawBboxChange = useCallback((bbox: LatLngBbox) => {
    latestRawBboxRef.current = bbox;
  }, []);

  // 커밋된(디바운스 정착) raw bbox — viewportCenter/centerWard/줌인 타겟처럼 "지금 당장"이
  // 아니라 이동이 멎은 시점의 중심이 필요한 소비자용. viewportBbox(크롭)와 동일한 커밋
  // 타이밍(즉시/500ms 디바운스)으로 커밋하되 소스만 raw.
  const [viewportRawBbox, setViewportRawBbox] = useState<LatLngBbox | null>(null);

  const handleBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    if (bboxImmediateRef.current) {
      // 지역선택 해제 직후 동기 emit — 호출자(resetToViewport)가 viewport 전환을 이미
      // 확정했으므로 modeRef 가드(아직 'region')를 우회해 즉시 커밋한다. 디바운스 경로와
      // 동일하게 뷰포트 저장·말풍선 억제 해제까지 수행.
      // VIEWPORT_KEY는 raw bbox로 저장 — 크롭 bbox를 저장하면 재진입 복원 시 중심이 밀린다.
      try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(latestRawBboxRef.current ?? bbox)); } catch { /* quota 등 저장 실패 무시 */ }
      suppressAutoBubbleIdRef.current = null;
      suppressPanelRebuildRef.current = false;
      setViewportBbox(bbox);
      setViewportRawBbox(latestRawBboxRef.current);
      return;
    }
    clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => {
      // 뷰포트 기억: 이동/줌이 멎은 시점의 뷰포트를 저장 → 재진입 시 복원 (raw bbox — 위와 동일 이유)
      try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(latestRawBboxRef.current ?? bbox)); } catch { /* quota 등 저장 실패 무시 */ }
      suppressAutoBubbleIdRef.current = null; // 새 조작 = 억제 해제
      if (modeRef.current !== 'region') {
        suppressPanelRebuildRef.current = false;
        setViewportBbox(bbox);
        setViewportRawBbox(latestRawBboxRef.current);
      }
    }, 500);
  }, []);

  // polyActive=true(내 위치 필터 ON)에는 선택 ward polygon 필터를 사용하고,
  // OFF 상태에서는 현재 지도 viewport 기준으로 주변 동네까지 함께 노출한다.
  const bboxFilter = useMemo(() => (mode === 'viewport' ? viewportBbox : null), [mode, viewportBbox]);
  // raw bbox 쪽 viewport 모드 게이트 — bboxFilter(크롭, fetch/카운트/리스트/마커 전용)와 동일한
  // mode 조건이지만 소스는 viewportRawBbox(raw, 중심 계산 전용).
  const rawBboxFilter = useMemo(() => (mode === 'viewport' ? viewportRawBbox : null), [mode, viewportRawBbox]);

  // 커밋된 뷰포트의 중심 — ward 판별·핀 fetch 이펙트·줌인 타겟이 공용한다. raw bbox 기준
  // (bboxFilter는 크롭돼 있어 (N+S)/2가 실제 컨테이너 중심과 어긋난다 — 회귀 수정).
  const viewportCenter = useMemo(
    () => (rawBboxFilter ? { lat: (rawBboxFilter.N + rawBboxFilter.S) / 2, lng: (rawBboxFilter.E + rawBboxFilter.W) / 2 } : null),
    [rawBboxFilter],
  );
  // 지도 중심이 속한 ward (viewport 모드 전용 — region 모드는 bboxFilter=null 이라 자동 null).
  // 접힘 헤더 뱃지·리스트 상단 제목의 지역명 라벨로만 쓰인다. 커버리지 밖이면 null.
  const centerWard = useMemo(
    () => (viewportCenter ? findWardAt(viewportCenter.lat, viewportCenter.lng) : null),
    [viewportCenter],
  );

  // 업체 카테고리 (DB화, W3-FE) — 마운트 시 1회 fetch. 실패 시 빈 배열(칩 행에 '전체'와
  // [더보기]만 남아도 동작).
  useEffect(() => {
    if (bizCategories.length > 0) return;
    fetchBizCategories().then(setBizCategories).catch(() => setBizCategories([]));
  }, [bizCategories.length]);

  // sessionStorage 잔존 스냅샷 키 정리 (1회) — 과거 세션에서 저장된 키가 남아있으면 제거.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 복원 분기 비활성
  useEffect(() => {
    sessionStorage.removeItem(BIZ_RETURN_KEY);
    // if (returnSnapshot?.favOnly) {
    //   fetchBizFavorites()
    //     .then((favs) => setFavIds(new Set(favs.map((f) => f.id))))
    //     .catch(() => setFavIds(new Set()));
    // }
  }, []);

  // 카테고리 페이지(/map/categories)에서 넘어온 ?category= 1회 소비 — MarketMain
  // ?lat=&lng= 패턴 미러: 소비 즉시 제거해 리로드/뒤로가기 시 재적용되지 않게 한다.
  useEffect(() => {
    const cat = searchParams.get('category');
    if (!cat) return;
    setBizCategory(cat);
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // 업체 핀 레이어 (SGR-323, G-1) — 매물·피드와 동일한 줌 게이트를 지키며(결정사항 2),
  // region 모드에서는 폴리곤 외접 bbox로 조회한다.
  useEffect(() => {
    if (isSearching) return;
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setBizItems([]);
      setBizError(false);
      return;
    }
    const bbox = bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
    if (!bbox) { setBizItems([]); setBizError(false); return; }
    let cancelled = false;
    const controller = new AbortController();
    setBizLoading(true);
    setBizError(false);
    fetchBizMapItems({
      minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
      category: bizCategory ?? undefined,
      signal: controller.signal,
    })
      .then((items) => { if (!cancelled) { bizFetchedRef.current = true; setBizError(false); setBizItems(items); } })
      .catch((error) => {
        if (!cancelled && !isAbortError(error)) {
          bizFetchedRef.current = true;
          setBizError(true);
          setBizItems([]);
        }
      })
      .finally(() => { if (!cancelled) setBizLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [bboxFilter, reloadSeq, selectedRegion, isSearching, bizCategory]);

  // POI 상시 참조 레이어 (Phase A-2) — biz 핀 조회 이펙트 미러, 항상 조회한다.
  useEffect(() => {
    if (childLightweight) {
      setPoiItems([]);
      setPoiError(false);
      return;
    }
    if (isSearching) return;
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setPoiItems([]);
      setPoiError(false);
      return;
    }
    const bbox = bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
    if (!bbox) { setPoiItems([]); setPoiError(false); return; }
    let cancelled = false;
    const controller = new AbortController();
    setPoiError(false);
    fetchPoiMapItems({ minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E, signal: controller.signal })
      .then((items) => { if (!cancelled) { setPoiError(false); setPoiItems(items); } })
      .catch((error) => {
        if (!cancelled && !isAbortError(error)) {
          setPoiError(true);
          setPoiItems([]);
        }
      });
    return () => { cancelled = true; controller.abort(); };
  }, [bboxFilter, reloadSeq, selectedRegion, isSearching, childLightweight]);

  const visibleBiz = useMemo(() => {
    const base = bboxFilter
      ? bizItems.filter((b) =>
          b.lat >= bboxFilter.S && b.lat <= bboxFilter.N &&
          b.lng >= bboxFilter.W && b.lng <= bboxFilter.E,
        )
      : selectedRegion
        ? bizItems.filter((b) => regionContains(selectedRegion, b.lat, b.lng))
        : bizItems;
    // ♥ 찜 필터 — 카테고리 칩(서버 조회 시점 필터)과 AND 교집합
    return favOnly ? base.filter((b) => favIds.has(b.id)) : base;
  }, [bboxFilter, bizItems, selectedRegion, favOnly, favIds]);

  // depth2/3 마커 (선택 영역 기준) — 검색 중엔 위치 필터 무시하고 검색 결과만 표시.
  // 핀 레이어 배열 구조 (SGR-323): feed/biz 모두 탭 배타 — biz 핀도 biz 탭에서만 노출.
  // 향후 info 계열 흡수 시 레이어 추가로 확장한다 (결정사항 1).
  const markers = useMemo<MapMarkerV2[]>(() => {
    // 캐러셀(포스트 패널) 열림 중 eager injection — 플리킹 recenter 대상이 직전 커밋 bbox 의
    // fetch 결과 밖이면 디바운스+RTT 후에야 핀이 뜨므로, 캐러셀 아이템을 동일 매핑으로 즉시
    // 합류시킨다. 기존 visible 파생 마커 우선, 캐러셀 파생은 id 부재분만 추가 (이중 핀 방지).
    const withCarouselMarkers = (base: MapMarkerV2[]): MapMarkerV2[] => {
      if (!postPanelOpen || carouselItems.length === 0) return base;
      const seen = new Set(base.map((m) => m.id));
      const extra: MapMarkerV2[] = [];
      for (const it of carouselItems) {
        if (it.kind === 'biz') {
          const b = it.biz;
          const id = `biz:${b.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          extra.push({
            id, lat: b.lat, lng: b.lng, kind: 'biz', color: bizCatColor(b.category), r: 1.6, label: b.name,
            icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
            selected: focusedBiz?.id === b.id,
            badge: isNewsUnread(b.id, b.latestNews?.createdAt),
            onClick: () => handleBizMarkerClick(b),
          });
        }
      }
      return extra.length > 0 ? [...base, ...extra] : base;
    };
    // POI 상시 참조 레이어 (Phase A-2) — 매물/피드/업체 탭 배타 구조와 무관하게 항상 표시.
    // L3 상세지도 부활 게이트(childLightweight, 상단 L3_ENABLED 파생)로 켜고 끈다.
    // 마커 빌드는 buildPoiLayer(renderPoiLayer 역할)로 분리. ※ r/색은 시작값, 실기 조정 대상.
    const poiMarkers: MapMarkerV2[] = childLightweight ? [] : buildPoiLayer(poiItems, i18n.language);
    // z-order: POI(배경 지표)를 배열 앞에 깔아 업체/콘텐츠 마커가 항상 위에 그려지게 한다.
    if (isSearching) {
      return [...poiMarkers, ...withCarouselMarkers(bizSearchResults.map((b) => ({
        id: `biz:${b.id}`, lat: b.lat, lng: b.lng, kind: 'biz', color: bizCatColor(b.category), r: 1.6, label: b.name,
        icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
        selected: focusedBiz?.id === b.id,
        badge: isNewsUnread(b.id, b.latestNews?.createdAt),
        onClick: () => handleBizMarkerClick(b),
      })))];
    }
    // 업체 핀 — 색+라벨(상호명)+업종 글리프 (당근 IN-1 변형).
    const bizMarkers: MapMarkerV2[] = visibleBiz.map((b) => ({
      id: `biz:${b.id}`,
      lat: b.lat,
      lng: b.lng,
      kind: 'biz',
      color: bizCatColor(b.category),
      r: 1.6,
      label: b.name,
      icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
      selected: focusedBiz?.id === b.id,
      badge: isNewsUnread(b.id, b.latestNews?.createdAt),
      onClick: () => handleBizMarkerClick(b),
    }));
    return [...poiMarkers, ...withCarouselMarkers(bizMarkers)];
  }, [isSearching, bizSearchResults, visibleBiz, focusedBiz, readVersion, postPanelOpen, carouselItems, poiItems, i18n.language, childLightweight]); // eslint-disable-line react-hooks/exhaustive-deps

  // 지도 탭 지역선택 비활성 (대표 지시 2026-07-25) — 지역 기준은 GPS 근처로 대체.
  // onRegionSelect wiring 제거로 아래 핸들러는 더 이상 호출되지 않는다 — 로직은 부활 대비 보존.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRegionSelect = useCallback((region: SelectedRegion) => {
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    setSelectedId(null);
    setSelectedBiz(null);
    setPostPanelOpen(false);
    if (user) selectRegion(region, user.id);
    // 시트 자동 올림 없음 — 지역 선택은 "지도 탐색 중" 신호지 리스트를 보겠다는 의도가
    // 아니다(UX 원칙: 시트는 사용자 의도로만 이동). 선택 결과는 접힘 헤더 칩/건수로 보인다.
  }, [selectRegion, user]);

  // scrollIntoView는 리스트 내부만이 아니라 모든 스크롤 가능 조상(AppShell 콘텐츠
  // 컨테이너 포함)을 함께 스크롤해 검색 오버레이를 화면 밖으로 밀어내므로,
  // 리스트 컨테이너 스크롤만 직접 계산해 이동시킨다.
  const scrollItemIntoList = (id: string) => {
    const list = listRef.current;
    const item = itemRefs.current[id];
    if (!list || !item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const offset = (itemRect.top - listRect.top) - (listRect.height / 2 - itemRect.height / 2);
    list.scrollTo({ top: list.scrollTop + offset, behavior: 'smooth' });
  };

  // 업체 핀 "직접 터치" (W2) — 시트 스냅 대신 포스트 패널을 연다. 캐러셀 후보 = 같은
  // 소스(검색 중이면 검색 결과, 아니면 뷰포트 업체) 중 최신 소식 보유 업체를 탭한 업체
  // 기준 가까운 순으로. 탭한 업체 자신은 소식이 없어도 항상 선두(폴백 카피 카드).
  // 포스트 패널에서 포커싱된 업체의 최신 소식을 읽음 처리 (W4) — readVersion 이 markers 재계산을 트리거.
  const markBizAsRead = (biz: BizMapItem) => {
    if (biz.latestNews) {
      markBizNewsRead(biz.id, biz.latestNews.createdAt);
      setReadVersion((v) => v + 1);
    }
  };

  const openPostPanel = (biz: BizMapItem) => {
    const source = isSearching ? bizSearchResults : visibleBiz;
    const d2 = (b: BizMapItem) => (b.lat - biz.lat) ** 2 + (b.lng - biz.lng) ** 2;
    const others = source.filter((b) => b.id !== biz.id && b.latestNews).sort((a, b) => d2(a) - d2(b));
    setCarouselItems([biz, ...others].map((b): PanelItem => ({ kind: 'biz', biz: b })));
    setCarouselIndex(0);
    setPostPanelOpen(true);
    setSelectedBiz(null); // 자동 말풍선 상태와 분리 — 패널과 말풍선 이중 노출 방지
    setSelectedId(biz.id);
    focusPointRef.current?.({ lat: biz.lat, lng: biz.lng });
    markBizAsRead(biz);
  };

  const closePostPanel = () => {
    // 닫은 시점의 포커싱 아이템 = 지도 중앙 아이템 — 자동 말풍선이 즉시 재점화하지 않게 억제.
    // biz 와 동일하게 각 레이어 ref 를 무조건 재설정한다(닫힌 레이어는 그 id, 나머지는 null).
    suppressAutoBubbleIdRef.current = focusedBiz?.id ?? null;
    suppressPanelRebuildRef.current = false; // 소비되지 않은 재검색 억제 플래그 정리
    setPostPanelOpen(false);
    setCarouselItems([]);
    setCarouselIndex(0);
    setSelectedId(null);
  };

  // 캐러셀 스냅 → 그 업체 핀으로 지도 recenter(줌 유지) + 하이라이트 (터치와 동일 효과)
  // useCallback: PostPanel 의 IntersectionObserver 이펙트 deps 로 들어가므로, 매 렌더
  // (viewerCount 15s tick 포함) 새 참조가 되면 observer 가 불필요하게 재연결된다 (리뷰 P3).
  const handleCarouselIndex = useCallback((i: number) => {
    setCarouselIndex(i);
    const it = carouselItems[i];
    if (!it || it.kind !== 'biz') return;
    setSelectedId(it.biz.id);
    focusPointRef.current?.({ lat: it.biz.lat, lng: it.biz.lng });
    markBizAsRead(it.biz);
  }, [carouselItems]);

  const handleBizMarkerClick = (biz: BizMapItem) => {
    openPostPanel(biz);
  };

  // BizPublic(/biz/:id) 이동 직전 지도 컨텍스트 스냅샷 (MarketMain saveScroll 미러) —
  // 탭·카테고리 칩·찜 필터와 "열려 있던 UI"(포스트 패널 or 자동 말풍선)를 저장한다.
  // panelBiz = 포스트 패널에서 실제 탭한 카드(포커스 카드와 다를 수 있음).
  // useCallback 필수: bizNewsOverlay useMemo 가 이 함수를 캡처하므로, deps 없이 넘기면
  // selectedBiz 가 안 바뀐 채 칩/찜 상태만 바뀌었을 때 낡은 값이 저장된다.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // const saveBizReturnSnapshot = useCallback((panelBiz?: BizMapItem) => {
  //   const focused = panelBiz ?? focusedBiz;
  //   const ui: BizReturnUi = postPanelOpen && focused
  //     ? { kind: 'postPanel', bizId: focused.id, carouselIndex }
  //     : selectedBiz
  //       ? { kind: 'bubble', bizId: selectedBiz.id }
  //       : { kind: 'none' };
  //   const snap: BizReturnSnapshot = { tab, bizCategory, favOnly, ui, savedAt: Date.now() };
  //   try { sessionStorage.setItem(BIZ_RETURN_KEY, JSON.stringify(snap)); } catch { /* 저장 실패 시 복원만 포기 */ }
  // }, [tab, bizCategory, favOnly, postPanelOpen, focusedBiz, carouselIndex, selectedBiz]);

  // 자동 말풍선 (2026-07-11) — 제스처가 멎어 커밋된 뷰포트(bboxFilter, 500ms 디바운스)가
  // 충분히 줌인 상태면 중앙 부근 최근접 업체 1곳을 터치 없이 활성화하고, 중앙에서 벗어나면
  // 해제한다(다른 핀이 오면 갈아탐). 임계 미만 줌에서는 완전 비활성 — 핀 탭 선택을 보존.
  // selectedBiz 는 ref 로 읽는다: deps 에 넣으면 핀 탭 직후 이 이펙트가 되돌아 선택을 지운다.
  // 시트는 움직이지 않는다 — 자동 활성화는 사용자 의도가 아니다(바텀시트 원칙). 하이라이트·스크롤만.
  const selectedBizRef = useRef(selectedBiz);
  useEffect(() => { selectedBizRef.current = selectedBiz; }, [selectedBiz]);
  useEffect(() => {
    // postPanelOpen 가드: 캐러셀 recenter 가 커밋한 bbox 로 이 이펙트가 재점화해
    // 패널과 말풍선이 같은 업체에 이중 노출되는 것을 차단 (분석 리스크 #2)
    if (isSearching || !bboxFilter || postPanelOpen) return;
    const latSpan = bboxFilter.N - bboxFilter.S;
    if (latSpan > AUTO_BUBBLE_MAX_LAT_SPAN) return;
    const lngSpan = bboxFilter.E - bboxFilter.W;
    const cLat = (bboxFilter.N + bboxFilter.S) / 2;
    const cLng = (bboxFilter.E + bboxFilter.W) / 2;
    let best: BizMapItem | null = null;
    let bestD = Infinity;
    for (const b of visibleBiz) {
      const d = Math.hypot((b.lat - cLat) / latSpan, (b.lng - cLng) / lngSpan);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best && bestD <= AUTO_BUBBLE_CENTER_RADIUS) {
      if (best.id === suppressAutoBubbleIdRef.current) return; // [X]로 닫은 업체 — 다음 조작까지 억제
      if (selectedBizRef.current?.id !== best.id) {
        const target = best;
        setSelectedBiz(target);
        setSelectedId(target.id);
        requestAnimationFrame(() => scrollItemIntoList(target.id));
      }
    } else if (selectedBizRef.current) {
      setSelectedBiz(null);
      setSelectedId(null);
    }
  }, [bboxFilter, visibleBiz, isSearching, postPanelOpen]);

  // 뒤로가기 복원 2단계 (선택 UI) — 업체 fetch 가 실제 완료된 뒤 1회만 소비한다. 대상이
  // 결과에 없으면(뷰포트 밖·삭제) 조용히 스킵. 반드시 자동 말풍선 이펙트 "뒤"에 선언:
  // 같은 커밋에서 둘이 함께 돌 때(이펙트는 선언 순서로 실행) 복원 setState 가 마지막에
  // 적용되고, 다음 커밋에서 selectedBizRef 동기화 → 자동 말풍선 deps 불변이라 안 덮어쓴다.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // useEffect(() => {
  //   const pending = pendingUiRestoreRef.current;
  //   if (!pending || !bizFetchedRef.current) return;
  //   pendingUiRestoreRef.current = null; // 첫 fetch 완료 시점에 무조건 소비 — 한참 뒤 팬 이동에서 재점화 방지
  //   const target = bizItems.find((b) => b.id === pending.bizId);
  //   if (!target) return;
  //   if (pending.kind === 'postPanel') {
  //     // 캐러셀은 최신 fetch 로 재구성(대상 카드 선두) — 원래 인덱스의 이웃 순서는 재현 불가
  //     openPostPanel(target);
  //   } else {
  //     setSelectedBiz(target);
  //     setSelectedId(target.id);
  //   }
  // }, [bizItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // 포커스 아이템(업체 팝업 후보 동결, 대표 결정 2026-07-11)은 ref 로 읽는다 — 캐러셀
  // 리렌더와 무관하게 최신 값을 다른 이펙트가 참조할 수 있게 한다.
  const focusedItemRef = useRef(focusedItem);
  useEffect(() => { focusedItemRef.current = focusedItem; }, [focusedItem]);

  // 줌 게이트 이탈 — 업체 핀이 소멸하는 줌아웃(구 집계 배지 상태)에서는 팝업도 닫는다:
  // 핀 없는 지도 위 고아 팝업 방지.
  useEffect(() => {
    const focused = focusedItemRef.current;
    if (showDistrictBadges && focused && focused.kind !== 'biz') closePostPanel();
    // 업체 말풍선(selectedBiz)도 핀과 함께 정리 — 자동 말풍선 이펙트는 게이트 밖 스팬에서
    // 조기 return(AUTO_BUBBLE_MAX_LAT_SPAN 초과)이라 스스로 해제하지 못해, 핀 없는 지도에
    // 말풍선만 고아로 남는다. 다시 게이트 안으로 줌인하면 기존 조건대로 자연 재점화.
    if (showDistrictBadges && selectedBizRef.current) {
      setSelectedBiz(null);
      setSelectedId(null);
    }
  }, [showDistrictBadges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ♥ 토글 — 찜한 업체만 보기
  const toggleFavOnly = () => {
    if (!user) {
      toast.info(t('map.favoriteFilterLoginRequired'));
      return;
    }
    if (favOnly) {
      setFavOnly(false);
      return;
    }
    setFavOnly(true);
    fetchBizFavorites()
      .then((favs) => setFavIds(new Set(favs.map((f) => f.id))))
      .catch(() => setFavIds(new Set()));
  };

  // + 메뉴 "후기쓰기" (업체 후기 실배선, 대표 결정) — 지도에서 선택/포커스된 업체가 있으면
  // 그 업체로 바로 작성 시트, 없으면 현재 뷰포트 업체 중 선택 스텝. 업체 탭이 아니면
  // bizItems 가 비어 있으므로 같은 bbox·게이트 규칙으로 1회 조회한다 (biz fetch 이펙트 미러).
  const handleWriteReview = async () => {
    setAddMenuOpen(false);
    if (!user) {
      toast.info(t('biz.review.loginRequired'));
      return;
    }
    const target = focusedBiz ?? selectedBiz;
    if (target) {
      setReviewTarget({ id: target.id, name: target.name });
      return;
    }
    let candidates = visibleBiz;
    if (candidates.length === 0) {
      const gateBlocked = mode === 'viewport' && showDistrictBadges;
      const bbox = gateBlocked ? null : bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
      if (bbox) {
        const fetched = await fetchBizMapItems({
          minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
        }).catch(() => [] as BizMapItem[]);
        candidates = selectedRegion
          ? fetched.filter((b) => regionContains(selectedRegion, b.lat, b.lng))
          : fetched;
      }
    }
    if (candidates.length === 0) {
      toast.info(t('map.addMenu.noBizNearby'));
      return;
    }
    setReviewPickerItems(candidates);
  };

  const retryLoad = () => setReloadSeq((n) => n + 1);
  // useCallback 필수: SaigonMapV5의 onLocate prop으로 전달됨 (handleRegionSelect와 동일한 이유)
  const resetToViewport = useCallback(() => {
    if (user) selectAll(user.id);
    // localRegionSeed(리스트뷰에서 넘어온 initialRegion 1회 시드값)가 남아있으면 selectAll 로
    // 전역 스토어를 비워도 selectedRegion(=localRegionSeed ?? globalSelectedRegion)이 여전히
    // 시드값을 가리켜 ✕ 가 no-op 처럼 보였다 — 여기서 함께 지워야 실제로 'all' 로 돌아간다.
    setLocalRegionSeed(null);
    setSelectedId(null);
    setSelectedBiz(null);
    setPostPanelOpen(false);
    // 아이템(bizItems)은 비우지 않는다 — 드래그 재검색과 동일하게 "기존 표시
    // 유지, fetch 완료 시 교체". 아래 즉시 커밋되는 bboxFilter가 visible*에서 뷰포트 밖
    // 잔재를 걸러내므로 헤더 건수·핀이 항상 같은 집합을 가리킨다 (시나리오 4.3 재발 없음).
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    // 현재 뷰포트 bbox를 디바운스 없이 즉시 커밋(emit은 동기 호출) — 500ms 공백 동안
    // 0건 카운트·가이드 화면이 플래시하던 문제 방지. 게이트 미만 줌이면 SaigonMapV5의
    // polyActive 해제 이펙트가 depth를 재발행해 가이드로 정합.
    bboxImmediateRef.current = true;
    emitBboxRef.current?.();
    bboxImmediateRef.current = false;
    // 시트 자동 이동 없음 — 해제 역시 지도 컨텍스트 복귀 액션 (UX 원칙 동일)
  }, [user, selectAll]);
  const clearRegionFilter = () => {
    resetToViewport();
  };

  // 바텀시트 리스트 소스 — 지도 핀(markers)과 동일한 visible*(뷰포트 bbox / 선택 동 클리핑).
  // 헤더 "지역명 · N건"의 N = 핀 개수. (ward 별도 소스는 핀-리스트 불일치로 제거, 2026-07-14)
  const listBiz = visibleBiz; // ♥ 찜 필터는 visibleBiz 에서 이미 적용됨
  const listBizLoading = bizLoading;
  // 헤더 로딩 표시는 디바운스 통과분만 사용 — 페이지네이션 토글로 인한 blink 방지(표시 전용).
  const showHeadLoading = useDelayedFlag(listBizLoading && !!(bboxFilter || selectedRegion));

  const visibleCount = listBiz.length;

  const bizCatLabel = (c: string | null) => {
    if (!c) return '';
    const cat = bizCategories.find((x) => x.code === c);
    return cat ? bizCategoryLabel(cat, i18n.language) : c;
  };

  // 업체 새소식 말풍선 — 지도 앵커 오버레이로 핀(lat/lng)에 고정되어 팬/줌을 따라간다 (SGR-325).
  // SaigonMapV5 는 memo — 객체 prop 은 useMemo 로 참조를 고정한다(기존 계약). key: 다른 핀 탭 시 pop 재생.
  const bizNewsOverlay = useMemo(() => {
    if (!selectedBiz) return undefined;
    // 리치화(2026-07-25): 썸네일 · ★평점/후기수 · 최근 후기 1줄 추가. 지도 위 좁은 폭이라
    // 리스트 카드(BizRichCard)보다 밀도를 낮춘다 — 사진은 1장, 후기는 1줄, 있는 것만.
    const thumb = selectedBiz.photoUrl ?? selectedBiz.latestNews?.photos[0] ?? null;
    const review = selectedBiz.reviewPreviews[0];
    return {
      lat: selectedBiz.lat,
      lng: selectedBiz.lng,
      node: (
        <button key={selectedBiz.id} type="button" className={styles.bizNewsBubble} onClick={() => handleBizMarkerClick(selectedBiz)}>
          {/* eyebrow 는 실소식이 있을 때만 — 소식 없는 업체에 "새소식·방금 전"을 붙이지 않는다(정직화) */}
          {selectedBiz.latestNews && (
            <span className={styles.bizNewsEyebrow}>{t('map.bizNews.label')} <span>{formatRelativeTime(selectedBiz.latestNews.createdAt)}</span></span>
          )}
          <span className={styles.bubbleMain}>
            {thumb && <AppImage src={thumb} alt="" className={styles.bubbleThumb} />}
            <span className={styles.bubbleTexts}>
              <strong className={styles.bubbleName}>{selectedBiz.name}</strong>
              {(selectedBiz.rating != null || selectedBiz.favoriteCount > 0 || selectedBiz.followerCount > 0) && (
                <span className={styles.bubbleMeta}>
                  {selectedBiz.rating != null && (
                    <span className={styles.bubbleRating}>
                      <StarIcon size={12} />
                      <span className="num">{selectedBiz.rating.toFixed(1)}</span>
                      <small className="num">({selectedBiz.reviewCount})</small>
                    </span>
                  )}
                  {/* 카드(BizRichCard)와 동일 규칙 — ♥=찜, 사람=단골, 0 은 숨김 */}
                  {selectedBiz.favoriteCount > 0 && (
                    <span className={styles.bubbleCount} aria-label={t('map.bizCard.favorites', { count: selectedBiz.favoriteCount })}>
                      <Heart size={12} strokeWidth={2} />
                      <span className="num">{selectedBiz.favoriteCount}</span>
                    </span>
                  )}
                  {selectedBiz.followerCount > 0 && (
                    <span className={styles.bubbleCount}>
                      <Users size={12} strokeWidth={2} />
                      {t('map.bizCard.followers', { count: selectedBiz.followerCount })}
                    </span>
                  )}
                </span>
              )}
              <span className={styles.bizNewsCopy}>
                {selectedBiz.latestNews
                  ? selectedBiz.latestNews.title
                  : <>{selectedBiz.category ? t('map.bizNews.categoryCopy', { category: bizCatLabel(selectedBiz.category) }) : ''}{selectedBiz.address ?? t('map.bizNews.fallbackCopy')}</>}
              </span>
            </span>
          </span>
          {review && (
            <span className={styles.bubbleReview}>
              <MessageSquareQuote size={12} />
              <strong>{t('map.bizCard.reviewPill', { rating: review.rating.toFixed(1) })}</strong>
              <span>{review.body}</span>
            </span>
          )}
        </button>
      ),
    };
  }, [selectedBiz, navigate, t, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // 업체 카드 — 업체 리스트·업체 검색 결과 공용 (탭 시 /biz/:id). 리스트(NeighborhoodMap)와
  // 동일한 당근형 리치 카드(BizRichCard) — 바텀시트 컨텍스트라 여백만 compact.
  const renderBizCard = (b: BizMapItem) => (
    <div
      key={b.id}
      ref={(el) => { itemRefs.current[b.id] = el; }}
      className={b.id === selectedId ? `${styles.bizCardWrap} ${styles.selected}` : styles.bizCardWrap}
    >
      <BizRichCard
        biz={b}
        categoryLabel={bizCatLabel(b.category) || undefined}
        distanceM={userPos ? haversineM(userPos.lat, userPos.lng, b.lat, b.lng) : null}
        onClick={() => navigate(`/biz/${b.id}`, { state: { backgroundLocation: location } })}
        compact
      />
    </div>
  );

  // 로딩 시 지역칩/건수를 통째로 교체하지 않고 "건수 자리"에만 인라인 스피너를 넣는다
  // (헤더 스왑 blink 제거 — 표시만, fetch/페이지네이션 불변). 디바운스(showHeadLoading) 통과분만.
  const countNode = showHeadLoading
    ? <span className={styles.countSpinner} aria-label={t('map.loading')} />
    : t('map.count', { count: visibleCount });
  const sheetHeader = (
    <div className={styles.sheetHead}>
      <div className={styles.sheetTop}>
        {/* 업체홍보 전용화 후 좌측 모드 라벨 (탭 제거로 생긴 공백 채움) — 정적, 비버튼 */}
        <span className={styles.bizModeLabel}>
          <Store size={13} />
          {t('map.bizMode')}
        </span>
        {isSearching ? (
          <span className={styles.count}>
            {t('map.count', { count: bizSearchResults.length })}
          </span>
        ) : sheetSnap === 'collapsed' && centerWard ? (
          // 접힌 시트에선 리스트 ward 제목이 안 보이므로 현재 지역명을 여기서 표출
          // (mid/full 로 올라가면 wardTitle 이 역할 인계). 순수 정보 표시자 — 클릭 없음.
          <span className={styles.wardChip}>
            <MapPin size={12} fill="currentColor" />
            {centerWard.region.name}
            <span className={styles.wardChipCount}>· {countNode}</span>
          </span>
        ) : (
          <span className={styles.count}>{countNode}</span>
        )}
      </div>
    </div>
  );

  const renderBody = () => {
    if (isSearching) {
      const searchCount = bizSearchResults.length;
      if (searchLoading && searchCount === 0) {
        return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
      }
      if (searchError) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('map.loadError')}</p>
            <button type="button" className={styles.emptyAction} onClick={retryLoad}>
              <RotateCw size={15} />
              <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
            </button>
          </div>
        );
      }
      if (searchCount === 0) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('map.emptySearch')}</p>
          </div>
        );
      }
      return bizSearchResults.map(renderBizCard);
    }
    // 줌 게이트(줌아웃)에서는 핀 fetch 가 생략돼 리스트도 함께 빈다 — 아래 빈 상태가
    // 노출되고, 줌인 유도는 지도 우측 zoomGateShort 힌트 필이 담당.
    // 지역선택 기능 비활성 (2026-07-12): ward 자동 추적 리스트로 대체되어 진입점 주석 처리
    // (동 안내 가이드 — bbox 미커밋 시엔 아래 빈 상태가 대신 노출된다)
    // if (mode === 'viewport' && !bboxFilter) {
    //   return (
    //     <div className={styles.guideWrap}>
    //       <p className={styles.guide}>
    //         {t('map.selectArea')}
    //       </p>
    //       <button type="button" className={styles.guideAction} onClick={() => locateRef.current?.()}>
    //         <LocateFixed size={15} />
    //         <span>{t('map.locateMe')}</span>
    //       </button>
    //     </div>
    //   );
    // }
    if (listBizLoading && listBiz.length === 0) {
      return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
    }
    if (bizError) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{t('map.loadError')}</p>
          <button type="button" className={styles.emptyAction} onClick={retryLoad}>
            <RotateCw size={15} />
            <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
          </button>
        </div>
      );
    }
    if (listBiz.length === 0) {
      // 찜 필터로 인한 0건은 "이 동네에 업체가 없다"가 아니라 "찜한 업체가 없다" — 관심목록
      // 화면(map.favorites.emptyBiz)과 동일 문구로 정직화
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{favOnly ? t('map.favorites.emptyBiz') : t('map.emptyBiz')}</p>
          {!favOnly && <p className={styles.emptyBody}>{t('map.emptyBizHint')}</p>}
        </div>
      );
    }
    return listBiz.map(renderBizCard);
  };

  // 지도보기 필 노출 조건 (당근 레퍼런스 하단 floating) — 검색/포스트패널 중엔 숨김
  const showMapViewPill = sheetSnap === 'full' && !isSearching && !postPanelOpen;

  return (
    <div className={styles.root} ref={rootRef}>
      <SaigonMapV5
        className={styles.map}
        height="100%"
        initialGps={storedCoords ?? undefined}
        // 진입 시 GPS 1회 자동 센터링 복원 (대표 지시 2026-07-25) — 이 화면 한정으로
        // service-rules 원칙 1·2 예외. 마운트당 1회만 실행(SaigonMapV5 didAutoLocate 가드) +
        // selectRegionOnLocate=false 라 지역선택엔 영향 없음(전역 스토어는). 거부/실패 시 도시
        // 기본 폴백(runLocate 내부). mode==='region'(초기 시드/전역 스토어로 이미 선택 동이 있음)
        // 이면 끈다 — 켜두면 initialGps 로 selWard 를 선택 동에 맞춰놓은 직후 GPS locate 가
        // 비동기로 완료되며 실제 현재 위치(다른 동일 수 있음)로 selWard·카메라를 덮어써
        // 칩(선택 동)과 렌더된 경계 폴리곤이 어긋나는 버그가 있었다(2026-08-03 발견).
        locateOnMount={mode === 'viewport'}
        initialViewport={savedViewport ?? undefined}
        markers={markers}
        anchorOverlay={postPanelOpen ? undefined : bizNewsOverlay}
        // 배지(집계) 미사용 — 지도와 시트는 동일 데이터 소스(bbox 조회 결과)만 표시.
        // 게이트 줌 진입 전에는 지도·시트 모두 비우고 가이드로 안내 (기획 260707)
        // 지도 탭 지역선택 비활성 (대표 지시 2026-07-25) — wiring 제거, 기준은 GPS 근처
        // onRegionSelect={handleRegionSelect}
        onMapTap={() => setSelectedBiz(null)}
        onBboxChange={handleBboxChange}
        onRawViewportChange={handleRawBboxChange}
        onDepthChange={setShowDistrictBadges}
        outsideAreaFallback
        emitBboxRef={emitBboxRef}
        outsideAreaMessage={t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' })}
        locateRef={locateRef}
        searchFitRef={searchFitRef}
        forceMarkers={isSearching}
        polyActive={mode === 'region'}
        onLocate={mode === 'region' ? resetToViewport : undefined}
        selectRegionOnLocate={false}
        focusPointRef={focusPointRef}
        zoomInRef={zoomInRef}
        bottomInsetPx={postPanelOpen ? postPanelHeight : sheetVisibleHeight}
        topInsetPx={!isSearching ? SEARCH_BAR_HEIGHT + CATEGORY_CHIPS_HEIGHT : SEARCH_BAR_HEIGHT}
        queryTopInsetPx={queryTopInsetPx}
        queryBottomInsetPx={collapsedSheetHeight}
        showLocateControl={false}
        // L3 상세지도 부활: childLightweight=false 로 SaigonMapV5 가 depth3 를 로드/렌더한다.
        // markerDepth 는 원래 lightweight 를 그대로 따라 콘텐츠 핀 준비 임계값(오버홀 개선분)을 보존한다.
        lightweight={childLightweight}
        markerDepth={lightweight ? 'l2' : 'l3'}
      />

      {poiError && !isSearching && (
        <button
          type="button"
          className={styles.emptyAction}
          onClick={retryLoad}
          style={{ position: 'absolute', top: 70, right: 12, zIndex: 4 }}
        >
          <RotateCw size={15} />
          <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
        </button>
      )}

      <div className={`${styles.searchOverlay} ${onExitMap ? styles.searchOverlayWithBack : ''}`} ref={searchOverlayRef}>
        {onExitMap && (
          <button
            type="button"
            className={styles.listBackButton}
            onClick={onExitMap}
            aria-label={t('map.listFirst.backToList')}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <SearchBox
          value={submittedQuery}
          onChange={clearSearch}
          placeholder={t('map.listFirst.searchBiz')}
          readOnly
          onClick={() => setSearchPanelOpen(true)}
        />
        <button
          type="button"
          className={styles.mapProfileButton}
          onClick={() => navigate('/map/profile')}
          aria-label={t('map.neighborhoodProfile.title')}
        >
          {user?.avatarUrl ? <AppImage src={user.avatarUrl} alt="" className={styles.mapProfileAvatar} variant="circle" /> : <span>{(user?.nickname || t('map.neighborhoodProfile.defaultNickname')).charAt(0).toUpperCase()}</span>}
        </button>
      </div>

      {/* backdrop 이 mapTools 보다 DOM 상 먼저(z-index 동률 시 이후 요소가 위) 와야
          ♥/+ 버튼 자체(재탭 포함)는 계속 눌리고, 그 외 바깥 탭만 메뉴를 닫는다. */}
      {addMenuOpen && <div className={styles.addMenuBackdrop} onClick={() => setAddMenuOpen(false)} />}

      {/* 지도 전용 도구. [내 위치] 버튼은 숨김 — 진입 시 GPS 1회 자동 센터링으로 대체(대표 지시
          2026-07-25). ♥/+ 는 실배선(찜 필터·글쓰기 메뉴).
          시트 상단 바로 위(12~16px 여백)로 밀착 — --sheet-visible-h CSS 변수를 그대로 따라가며
          드래그에도 연동된다(리렌더 없이 프레임당 변수 1회 갱신). full 스냅에서는 시트가
          검색바/칩 아래까지 올라오므로 겹치지 않게 숨긴다. */}
      {!isSearching && (
        <div
          ref={setMapToolsRef}
          className={styles.mapTools}
          style={
            postPanelOpen && postPanelHeight > 0
              ? { bottom: postPanelHeight + 14 }
              : sheetSnap === 'full'
                ? { display: 'none' }
                : { bottom: 'calc(var(--sheet-visible-h, 0px) + 14px)' }
          }
        >
          {!lightweight && (
            <>
              <button
                type="button"
                className={`${styles.mapToolButton} ${favOnly ? styles.mapToolButtonActive : ''}`}
                onClick={toggleFavOnly}
                aria-label={t('map.favoriteFilterLabel')}
                aria-pressed={favOnly}
              >
                <Heart size={17} strokeWidth={2.2} fill={favOnly ? 'currentColor' : 'none'} />
              </button>
              <div className={styles.addWrap}>
                <button
                  type="button"
                  className={`${styles.mapToolButton} ${addMenuOpen ? styles.mapToolButtonActive : ''}`}
                  onClick={() => setAddMenuOpen((v) => !v)}
                  aria-label={t('map.addMenu.label')}
                  aria-expanded={addMenuOpen}
                >
                  <Plus size={18} strokeWidth={2.3} className={`${styles.addIcon} ${addMenuOpen ? styles.addIconOpen : ''}`} />
                </button>
                {addMenuOpen && (
                  <div className={styles.addMenu}>
                    <button type="button" className={styles.addMenuItem} onClick={handleWriteReview}>
                      {t('map.addMenu.writeReview')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 줌 게이트 힌트 필 — mapTools 와 세트로 시트를 따라가는 지도 우측 floating.
          숨김 규칙(검색·full 스냅·포스트패널)은 mapTools 와 동일 + 게이트 미통과일 때만 노출.
          탭 = 현재 뷰포트 중심으로 순수 확대(zoomInRef). */}
      {!isSearching && mode === 'viewport' && showDistrictBadges && (
        <button
          type="button"
          ref={setZoomPillRef}
          className={styles.zoomHintPill}
          style={
            postPanelOpen && postPanelHeight > 0
              ? { bottom: postPanelHeight + 14 }
              : sheetSnap === 'full'
                ? { display: 'none' }
                : { bottom: 'calc(var(--sheet-visible-h, 0px) + 14px)' }
          }
          onClick={() => (viewportCenter ? zoomInRef.current?.(viewportCenter) : locateRef.current?.())}
        >
          <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" /> {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
        </button>
      )}

      {/* 업체 카테고리 칩 (SGR-324, W3-FE DB화) — 검색바 아래 가로 스크롤 (당근 IN-1) */}
      {!isSearching && (
        <div className={styles.chipsOverlay} ref={chipsOverlayRef}>
          {[null, ...bizCategories.map((c) => c.code)].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              className={`${styles.catChip} ${bizCategory === c ? styles.catChipActive : ''}`}
              onClick={() => setBizCategory(c)}
            >
              {c && <BizCatIcon category={c} size={13} />}
              {c ? bizCatLabel(c) : t('map.bizCategoryAll')}
            </button>
          ))}
          <button type="button" className={styles.catChip} onClick={() => navigate('/map/categories')}>
            <SlidersHorizontal size={13} />
            {t('map.moreCategories')}
          </button>
        </div>
      )}

      {searchPanelOpen && (
        <div className={styles.searchPanel} style={lockedPanelHeight != null ? { height: lockedPanelHeight } : undefined}>
          <div className={styles.searchPanelHeader}>
            <button type="button" className={styles.searchPanelBack} onClick={closeSearchPanel} aria-label={t('common.back', { defaultValue: '뒤로' })}>
              <ChevronLeft size={24} strokeWidth={2.2} />
            </button>
            <SearchBox
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('map.listFirst.searchBiz')}
              autoFocus
              onSubmit={submitSearch}
              className={styles.searchPanelBox}
            />
          </div>
          {recentSearches.length > 0 && (
            <div className={styles.searchPanelBody}>
              <div className={styles.searchPanelSectionHead}>
                <span>{t('map.recentSearches')}</span>
                <button type="button" onClick={clearRecentSearches}>{t('map.clearAll')}</button>
              </div>
              <div className={styles.recentChips}>
                {recentSearches.map((kw) => (
                  <span key={kw} className={styles.recentChip}>
                    <button type="button" onClick={() => submitSearch(kw)}>{kw}</button>
                    <button type="button" onClick={() => removeRecentSearch(kw)} aria-label={t('common.clear', { defaultValue: '지우기' })}>
                      <X size={12} strokeWidth={2.4} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 포스트 패널이 시트를 "대체" — unmount 하면 snap/스크롤 상태가 날아가므로 display 숨김 (W2 분석 판정). */}
      <div style={{ display: postPanelOpen ? 'none' : undefined }}>
      <DraggableSheet
        ref={sheetRef}
        header={sheetHeader}
        embedded
        initialSnap="collapsed"
        floatingTopLeft={!isSearching && selectedRegion ? (
          <button
            type="button"
            className={styles.areaPill}
            onClick={clearRegionFilter}
            aria-label={t('map.clearRegion')}
          >
            <span className={styles.areaPillIcon}>
              <MapPin size={13} fill="currentColor" />
            </span>
            <span>{selectedRegion.name}</span>
            <span className={styles.areaPillClose}><X size={15} strokeWidth={2.4} /></span>
          </button>
        ) : undefined}
        // 지도보기 필을 시트 바깥 하단 floating 버튼으로 이동(아래 참조) — 위쪽에 확보된
        // 여백만큼 maxHeight 를 65vh → 72vh 로 확장했으나, 72vh는 px 기반 상단 고정 영역
        // (status-bar + 검색바 + 카테고리 칩 행)과 기기에 따라 겹쳤다(SGR-full-snap-overlap).
        // DraggableSheet.resolveLength 가 calc() 문자열을 파싱하지 못해(vh/px suffix만 지원)
        // calc(100dvh - ...) 로 상단 고정 영역 기준 clamp 하는 방식은 적용 불가 — 공유 컴포넌트
        // (RideNav 등 다른 소비자도 사용) 파싱 로직을 건드리는 대신 vh 값을 69vh로 하향해
        // 칩 행 하단과 최소 8px 이상 여백을 확보한다.
        maxHeight="69vh"
        midHeight="42vh"
        lockHeight
        onVisibleHeightChange={handleSheetVisibleHeightLive}
        onVisibleHeightSettle={setSheetVisibleHeight}
        onSnapChange={setSheetSnap}
      >
        <div ref={listRef} className={`${styles.list} ${showMapViewPill ? styles.listPillPad : ''}`}>
          {!isSearching && centerWard && (
            <p className={styles.wardTitle}>{t('map.wardTitle.biz', { area: centerWard.region.name })}</p>
          )}
          {renderBody()}
        </div>
      </DraggableSheet>
      </div>

      {/* 지도보기 필 — 시트 full 스냅일 때 탭바 바로 위 하단 중앙 floating (당근 레퍼런스) */}
      {showMapViewPill && (
        <button
          type="button"
          className={styles.mapViewPill}
          onClick={() => sheetRef.current?.collapse()}
        >
          <MapPin size={14} /> {t('map.viewMap')}
        </button>
      )}

      {postPanelOpen && carouselItems.length > 0 && (
        <PostPanel
          items={carouselItems}
          index={carouselIndex}
          viewerCount={viewerCount}
          catLabel={bizCatLabel}
          onIndexChange={handleCarouselIndex}
          onCardTap={(it) => {
            // 오버레이 진입 — 지도를 유지한 채 상세를 얹는다 (App.tsx 라우트-모달)
            const state = { backgroundLocation: location };
            if (it.kind === 'biz') navigate(`/biz/${it.biz.id}`, { state });
            else if (it.kind === 'listing') navigate(`/market/${it.listing.id}`, { state });
          }}
          onClose={closePostPanel}
          onHeightChange={setPostPanelHeight}
        />
      )}

      {reviewPickerItems && (
        <BizReviewPickerSheet
          items={reviewPickerItems}
          catLabel={bizCatLabel}
          onPick={(b) => {
            setReviewPickerItems(null);
            setReviewTarget({ id: b.id, name: b.name });
          }}
          onClose={() => setReviewPickerItems(null)}
        />
      )}

      {reviewTarget && (
        <BizReviewSheet
          profileId={reviewTarget.id}
          profileName={reviewTarget.name}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
}

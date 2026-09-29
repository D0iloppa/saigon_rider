import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Ban, CalendarPlus, ChevronDown, ChevronRight, CircleUserRound, CreditCard, Flag, HandCoins, ImagePlus, LayoutList, LocateFixed, LogOut, MailOpen, MapPin, Megaphone, MoreVertical, Pencil, Radio, Reply, Smile, Trash2, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { StarIcon } from '@/components/ui/StarIcon';
import { MessageComposer, type MessageComposerHandle } from '@/components/ui/MessageComposer';
import { ActiveSessionBar } from '@/components/shell/ActiveSessionBar';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { api, extractErrorCode } from '@/api/client';
import { MOCK_STICKERS, findSticker } from './mockStickers';
import { type PickedLocation } from '../market/LocationPickerSheet';
import ApptPlacePicker from '@/components/dm/ApptPlacePicker';
import ApptPlaceThumb from '@/components/dm/ApptPlaceThumb';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CardMessage } from '@/components/dm/CardMessage';
import cardStyles from '@/components/dm/CardMessage.module.css';
import { TradeSetBar } from '@/components/dm/TradeSetBar';
import { TradeSetChips } from '@/components/dm/TradeSetChips';
import { AppointmentSheet, type AppointmentNavView } from '@/components/dm/AppointmentSheet';
import { TradeSetPicker } from '@/components/dm/TradeSetPicker';
import { TradeSetStatusSheet } from '@/components/dm/TradeSetStatusSheet';
import { tradeSetErrorMessage } from '@/components/dm/tradeSetErrors';
import {
  fetchMessages,
  sendMessage,
  markRead,
  fetchConversation,
  proposeAppointment,
  acceptAppointment,
  cancelAppointment,
  fetchAppointmentNavigation,
  proposePriceOffer,
  acceptPriceOffer,
  declinePriceOffer,
  cancelPriceOffer,
  reportConversation,
  reportGroupMessage,
  leaveConversation,
  fetchMembers,
  setConversationNotice,
  clearConversationNotice,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  fetchMarketplaceTransaction,
  confirmMarketplaceItemInspection,
  fetchTradeSet,
  updateTradeSetStatus,
  DM_REACTION_EMOJIS,
  DM_REPORT_REASONS,
  type DmReportReason,
} from '@/api/dm';
import { loadCachedMessages, saveCachedMessages } from '@/lib/dmCache';
import type { Appointment, MarketplaceTransaction, PriceOffer } from '@/api/types';
import type { AppointmentNavigationDestination, TradeSet } from '@/api/dm';
import { native } from '@/lib/native';
import type { DealStatusKind } from '@/lib/plugins/liveActivity';
import PriceOfferSheet from '@/components/market/PriceOfferSheet';
import { blockUser, fetchMyReview, type ReviewBrief } from '@/api/market';
import ReviewSheet from '@/components/market/ReviewSheet';
import { translateText } from '@/api/translate';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { useWalkieTalkieBubbleStore } from '@/store/useWalkieTalkieBubbleStore';
import { joinWalkieChannel } from '@/lib/walkieTalkieJoin';
import { walkieApi } from '@/lib/walkieSdk';
import type { VoiceItem } from '@d-modules/walkie-talkie';
import { VoiceMessageBubble } from '@/components/dm/VoiceMessageBubble';
import { loadSession } from '@/lib/session';
import { formatMessageDateSeparator, formatMessageTimestamp, formatRelativeTime } from '@/lib/format';
import { playSound } from '@/lib/sound';
import { registerPollTask } from '@/lib/pollScheduler';
import type { DmConversation, DmMessage, DmReadWatermark } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { formatPriceVnd } from '../market/marketFormat';
import OsmMap from '@/components/maps/OsmMap';
import { requireServiceLocation } from '@/lib/serviceLocation';
import GroupSettingsSheet from '@/components/dm/GroupSettingsSheet';
import { LocationShareConsentModal } from '@/components/dm/LocationShareConsentModal';
import { createOrJoinLocationChannel, httpStatusOf } from '@/api/locationChannel';
import { useLocationChannelStore } from '@/store/useLocationChannelStore';
import { useCancelReasonStore } from '@/store/useCancelReasonStore';
import { useConfirmStore } from '@/store/useConfirmStore';
import { sendLocationShareInvite } from '@/lib/locationShareInvite';
import styles from './DmDetail.module.css';

const PAGE_SIZE = 50;
/** 그룹 발신자 표시를 묶는 창(카톡 관례) — 같은 사람이 이 안에서 연속 발화하면 한 번만 표시한다. */
const SENDER_RUN_MS = 2 * 60 * 1000;

// F-X-01 FR-1: 취소 사유 코드 → i18n 키(SUPERSEDED/BLOCKED 등 서버 전용 코드는 사유 줄을 그리지 않는다).
const CANCEL_REASON_KEY: Record<string, string> = {
  SCHEDULE_CHANGED: 'dm.cancelReasonScheduleChanged',
  TRADED_ELSEWHERE: 'dm.cancelReasonTradedElsewhere',
  UNREACHABLE: 'dm.cancelReasonUnreachable',
};

/** 약속 고정 바용 일시 — "9.28(일) 17:00" (요일은 뷰어 로케일, 시각은 뷰어 로컬 타임존). */
function formatApptBarWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
  return `${d.getMonth() + 1}.${pad2(d.getDate())}(${weekday}) ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isRegularBubble(message: DmMessage): boolean {
  return message.messageType === 'text' || message.messageType === 'sticker';
}

function isDateSeparatorMessage(message: DmMessage): boolean {
  return isRegularBubble(message) || !!message.imageUrl || !!message.deletedAt;
}

function isSameSenderRun(previous: DmMessage | null, message: DmMessage | null): boolean {
  if (!previous || !message || previous.senderId !== message.senderId) return false;
  const elapsed = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return elapsed >= 0
    && elapsed < SENDER_RUN_MS
    && localDayKey(previous.createdAt) === localDayKey(message.createdAt);
}

/** id 기준 upsert 후 createdAt 오름차순 정렬 — 폴링/캐시/과거분 로드가 전부 이 하나로 합쳐진다. */
function upsertMessages(prev: DmMessage[], incoming: DmMessage[]): DmMessage[] {
  if (incoming.length === 0) return prev;
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 증분 폴링 커서 — 알고 있는 메시지들의 최대 updatedAt (구캐시 폴백: createdAt). */
function watermarkOf(messages: DmMessage[]): string | undefined {
  let max: string | undefined;
  for (const m of messages) {
    const ts = m.updatedAt ?? m.createdAt;
    if (!max || ts > max) max = ts;
  }
  return max;
}

export default function DmDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  // 길안내 버튼 제어용 — 스토어가 이미 끝낸 측위 결과를 읽기만 한다(새로 측정하지 않는다).
  const { available: routeAvailable, reason: routeGateReason, checking: routeChecking } = useServiceAvailability();
  const location = useLocation();
  const locationState = location.state as { conv?: DmConversation; openReport?: boolean; openTradeSetPicker?: boolean } | null;
  // B-4: 음성메시지 알림 탭 딥링크(/dm/:id?voice=1&mid=<messageId>) — 음성메시지는 이제 채팅
  // 이력에 영구 버블로 렌더되므로(202608 재개편) 여기서 자동재생을 강제하지 않는다. 대신
  // 이 대화방을 워키토키 캡슐의 대상으로 활성화해, 알림을 탭한 김에 바로 PTT 로 답할 수 있게 한다.
  const voiceDeepLink = new URLSearchParams(location.search).get('voice') === '1';
  const user = useUserStore((s) => s.user);
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const session = loadSession();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [appointmentNavigation, setAppointmentNavigation] = useState<Record<string, {
    status: 'loading' | 'ready' | 'error';
    destination?: AppointmentNavigationDestination;
    errorCode?: string | null;
  }>>({});
  const navigationRequestedRef = useRef(new Set<string>());
  const acceptedNavigationIdsRef = useRef(new Set<string>());
  // 폴링 tick 이 최신 messages 를 읽되, 그 변화가 폴링 interval 자체를 재시작시키지는 않게 한다 —
  // 안 그러면 로컬 전송/공감/수정마다 5초 타이머가 리셋돼 상대방 신규 메시지 수신이 계속 미뤄진다.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // 음성메시지(WalkieTalkie 모듈, wt_messages) — 202608 개편(대표 지시): 워키토키 캡슐에서
  // 자동재생 후 사라지던 것을 그만두고, 일반 메시지처럼 이 채팅 이력에 영구 렌더한다.
  // 저장소가 dm_messages 와 분리돼 있어(별도 모듈) 별도로 폴링해 화면에서 시간순으로만 합친다.
  // 상대들의 읽음 워터마크 — 메시지별 읽음 상태는 이걸로 계산한다(renderReadState).
  // 서버가 메시지 필드로 내려주지 않는 이유: 읽음처리는 updated_at 을 bump 하지 않아
  // 폴링(updated_at > after)에 실리지 않기 때문. 워터마크는 새 메시지가 없는 tick 에도 온다.
  const [readWatermarks, setReadWatermarks] = useState<DmReadWatermark[]>([]);
  const [voiceItems, setVoiceItems] = useState<VoiceItem[]>([]);
  const voiceCursorRef = useRef<string | null>(null);
  const [conv, setConv] = useState<DmConversation | null>(locationState?.conv ?? null);
  const [sending, setSending] = useState(false);
  // 초기 메시지 로드 상태 — 실패를 "대화 없음"과 구분하기 위해 별도 관리 (P1-6)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [apptWhen, setApptWhen] = useState('');
  const [apptPlace, setApptPlace] = useState<PickedLocation | null>(null);
  const [apptDetail, setApptDetail] = useState('');
  const [tr, setTr] = useState<Record<string, string>>({});
  const [trOpen, setTrOpen] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [myReview, setMyReview] = useState<ReviewBrief | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // 거래 화면 "신고하기" 딥링크(TradeTransaction → navigate state.openReport) — 한 번 소비하면
  // state 에서 제거해 뒤로가기/새로고침 시 시트가 다시 열리지 않게 한다.
  useEffect(() => {
    if (!locationState?.openReport) return;
    setReportOpen(true);
    navigate(location.pathname, { replace: true, state: { conv: locationState.conv } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationState?.openReport]);
  const [messageReportId, setMessageReportId] = useState<string | null>(null);
  // 메시지 액션(공감/답장/수정/삭제) — 말풍선 롱프레스로 연다.
  // 값 스냅샷이 아니라 id 만 들고 messages 에서 매번 파생한다 — 시트가 열려있는 동안
  // 백그라운드 폴링으로 메시지가 갱신돼도(공감 상태 등) 시트 내용이 따라간다.
  const [actionMsgId, setActionMsgId] = useState<string | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const actionPanelRef = useRef<HTMLDivElement>(null);
  const [actionPanelHeight, setActionPanelHeight] = useState(0);
  const actionMsg = useMemo(
    () => (actionMsgId ? messages.find((m) => m.id === actionMsgId) ?? null : null),
    [messages, actionMsgId],
  );
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
  // 그룹 발신자/답장바 이름 — 그룹 메시지에는 발신자 닉네임이 실리지 않아 멤버 목록에서 찾는다 (방 진입 시 1회 로드)
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string | null>>({});
  // 공지 내리기 권한 판정용 — GroupSettingsSheet 의 isManager 와 같은 기준(owner/admin)
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  // 실시간 위치공유 채널(2026-08-29 채널 모델) — 동의 모달 → 채널 생성/참가. 시작 컨텍스트(약속·목적지)를 들고 있다.
  const [liveConsentCtx, setLiveConsentCtx] = useState<{ appointmentId?: string; dest?: { lat: number; lng: number; name?: string }; sendInvite: boolean } | null>(null);
  const liveChannelConversationId = useLocationChannelStore((s) => s.conversationId);
  const setLiveChannel = useLocationChannelStore((s) => s.setChannel);
  const openLiveModal = useLocationChannelStore((s) => s.setModalOpen);
  // 현재위치 카드 탭 시 지도를 띄울 좌표 — 시트 1개를 재사용한다(버블마다 지도를 만들지 않기 위해).
  const [pinPreview, setPinPreview] = useState<{ lat: number; lng: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const otherName = conv?.otherUserNickname ?? locationState?.conv?.otherUserNickname ?? t('dm.detailTitle');
  const otherUserId = conv?.otherUserId ?? locationState?.conv?.otherUserId ?? null;
  const otherAvatarUrl = conv?.otherUserAvatarUrl ?? locationState?.conv?.otherUserAvatarUrl ?? null;
  // 260827 group/open 확장 (§3.5) — 마켓 약속·가격제안 UI 는 direct 에서만 렌더
  const isDirect = (conv?.conversationType ?? locationState?.conv?.conversationType ?? 'direct') === 'direct';
  const roomTitle = conv?.title ?? locationState?.conv?.title ?? t('dm.group', { defaultValue: '그룹톡방' });
  const roomMemberCount = conv?.memberCount ?? locationState?.conv?.memberCount ?? null;
  const messagingDisabled = isDirect && !!conv?.messagingDisabled;

  // 서버 total 캐시 — 위로 스크롤 시 "아직 안 받은 과거분" 페이지 계산용
  const totalRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);

  // 수신분을 상태 + 로컬 캐시(IndexedDB)에 동시 반영 — 모든 유입 경로가 이 하나를 쓴다
  const applyIncoming = useCallback((items: DmMessage[]) => {
    if (items.length === 0) return;
    setMessages((prev) => upsertMessages(prev, items));
    void saveCachedMessages(items);
  }, []);

  // 공지 배너는 conv 스냅샷에서 온다 — 공지가 바뀌는 사건에서만 다시 받는다(폴링마다 X)
  const refreshConv = useCallback(() => {
    if (!conversationId) return;
    fetchConversation(conversationId).then(setConv).catch(() => {});
  }, [conversationId]);

  // F-DM-02(260928) — 방 상단 거래 세트 바/칩/피커/상태시트(아코디언 대체). 세트는 첫 [+ 물품추가]
  // 전엔 없다(null) — 그동안은 기존 단일 매물 컨텍스트 카드(conv.contextListing)를 그대로 보여준다.
  const [tradeSet, setTradeSet] = useState<TradeSet | null>(null);
  const [tradeSetPickerOpen, setTradeSetPickerOpen] = useState(false);
  const [tradeSetStatusOpen, setTradeSetStatusOpen] = useState(false);
  // 세트 목록 페이지(/dm/:id/items) [물품 편집] 딥링크(260928 실기기 피드백) — 피커는 이 방에서만
  // 열 수 있어 페이지가 state.openTradeSetPicker 를 실어 돌아온다. 소비 후 state 에서 제거.
  useEffect(() => {
    if (!locationState?.openTradeSetPicker) return;
    setTradeSetPickerOpen(true);
    navigate(location.pathname, { replace: true, state: { conv: locationState.conv } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationState?.openTradeSetPicker]);
  const refreshTradeSet = useCallback(() => {
    if (!conversationId) return;
    fetchTradeSet(conversationId).then(setTradeSet).catch(() => {});
  }, [conversationId]);
  // 약속·가격제안의 매물 앵커 — 세트의 첫(활성) 항목, 세트가 없으면 방 컨텍스트 매물(260928 설계 §3.5 유지 항목).
  const selectedListingId = useMemo(() => {
    const first = tradeSet?.items.find((it) => it.status !== 'REMOVED' && it.status !== 'CANCELLED');
    return first?.listingId ?? conv?.contextId ?? null;
  }, [tradeSet, conv?.contextId]);

  // 초기 로드 — 로컬 캐시 즉시 렌더 → 워터마크 증분 동기화. 캐시가 없으면 최근 페이지부터.
  // 실패 시 loadError 로 구분해 재시도를 제공 (P1-6: 500/timeout 이 빈 대화로 보이던 버그)
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setLoadError(false);
    const cached = await loadCachedMessages(conversationId);
    if (cached.length > 0) {
      setMessages(cached);
      setLoading(false);
    }
    try {
      if (cached.length === 0) {
        // 전체가 아니라 **최근 PAGE_SIZE 건만** — total 파악(size=1) 후 마지막 페이지 로드
        const head = await fetchMessages(conversationId, 1, undefined, 1);
        totalRef.current = head.total;
        const lastPage = Math.max(1, Math.ceil(head.total / PAGE_SIZE));
        const res = await fetchMessages(conversationId, lastPage);
        setReadWatermarks(res.readWatermarks);
        setMessages(res.items);
        void saveCachedMessages(res.items);
      } else {
        // 캐시 워터마크 이후의 신규/수정/삭제/공감변경분만 증분 수신
        const res = await fetchMessages(conversationId, 1, watermarkOf(cached));
        setReadWatermarks(res.readWatermarks);
        applyIncoming(res.items);
      }
      markRead(conversationId).then(() => refreshUnread()).catch(() => {});
    } catch {
      if (cached.length === 0) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 위로 스크롤 시 과거분 로드 — offset 페이지를 로컬 캐시에 추가 적재.
  // "안 받은 과거분 = total - 보유건수" 근사로 대상 페이지를 계산하고, 경계 겹침은 upsert 가 흡수한다.
  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    try {
      if (totalRef.current === null) {
        totalRef.current = (await fetchMessages(conversationId, 1, undefined, 1)).total;
      }
      const olderCount = totalRef.current - messages.length;
      if (olderCount <= 0) return;
      const page = Math.max(1, Math.ceil(olderCount / PAGE_SIZE));
      const el = listRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      const prevTop = el?.scrollTop ?? 0;
      const res = await fetchMessages(conversationId, page);
      totalRef.current = res.total;
      skipAutoScrollRef.current = true; // prepend 는 바닥 스냅 대상이 아니다
      applyIncoming(res.items);
      // 위로 붙은 만큼 스크롤 보정 — 읽던 위치 유지 (렌더 반영 후)
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight - prevHeight + prevTop;
      });
    } catch {
      // 순단 무시 — 다음 스크롤에서 재시도
    } finally {
      loadingOlderRef.current = false;
    }
  }, [conversationId, messages.length, applyIncoming]);

  useEffect(() => {
    if (!conversationId) return;
    fetchConversation(conversationId).then(setConv).catch(() => {});
    loadMessages();
    refreshTradeSet();
    return () => { refreshUnread(); };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 워키토키 플로팅 버블(A-7) — 대표 지시 2026-08-27: 대화방 입장만으로 자동 참여시키지 않는다.
  // 참여는 (a) 헤더 메뉴 "워키토키" 탭, (b) 초대카드 "참여하기" 탭, (c) 캡슐 컨텍스트메뉴 "채널 변경" 3가지
  // 명시적 액션에서만 일어난다.
  const setActiveWalkieConversation = useWalkieTalkieBubbleStore((s) => s.setActiveConversation);
  const walkieActiveConversationId = useWalkieTalkieBubbleStore((s) => s.activeConversationId);
  const pendingWalkieVoices = useWalkieTalkieBubbleStore((s) => s.pendingVoices);
  const updatePendingWalkieVoice = useWalkieTalkieBubbleStore((s) => s.updatePendingVoice);
  const removePendingWalkieVoice = useWalkieTalkieBubbleStore((s) => s.removePendingVoice);

  // B-4: 음성메시지 알림 딥링크(?voice=1) 진입은 위 3가지와 별개인 4번째 명시적 액션이다 — 사용자가
  // 알림을 탭한 것 자체가 "이 채널에 참여하겠다"는 의사표시. 음성메시지 자체는 이미 채팅 이력
  // 폴링(voiceItems)으로 영구 버블에 렌더되므로, 여기선 PTT 답장을 위해 캡슐만 활성화한다.
  // 이 알림 탭은 화면 진입 시점의 1회성 의사표시일 뿐, 계속 유효한 지시가 아니다 — 캡슐 X(채널
  // 이탈, 2026-09-10)로 walkieActiveConversationId 가 null 이 돼도 재발동하면 X 가 무력화되므로,
  // 이 대화방 진입당 1회만 실행하고(voiceJoinedForRef) 이후 스토어 변화는 무시한다(deps 에서도 제외).
  const voiceJoinedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceDeepLink || !conversationId) return;
    if (voiceJoinedForRef.current === conversationId) return;
    voiceJoinedForRef.current = conversationId;
    setActiveWalkieConversation(conversationId, { name: isDirect ? otherName : roomTitle, isGroup: !isDirect });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceDeepLink, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const tick = async () => {
      try {
        // updated_at 워터마크 — 신규뿐 아니라 수정/삭제/공감변경된 메시지도 실려 온다(id upsert)
        const res = await fetchMessages(conversationId, 1, watermarkOf(messagesRef.current));
        setReadWatermarks(res.readWatermarks);
        if (res.items.length > 0) {
          const knownIds = new Set(messagesRef.current.map((m) => m.id));
          applyIncoming(res.items);
          // 폴링으로 **새로** 도착한 메시지 중 내가 보낸 게 아닌 게 있으면 수신음 (수정/공감 변경 제외).
          const uid = session?.userId ?? user?.id;
          const fresh = res.items.filter((m) => !knownIds.has(m.id));
          // 진짜 신규 메시지(수정/공감 아님)만큼 total 근사치도 전진 — 안 하면 loadOlder 의
          // "안 받은 과거분 = total - 보유건수" 계산이 뒤로 밀려 과거 구간을 영구히 건너뛴다.
          if (fresh.length > 0 && totalRef.current !== null) totalRef.current += fresh.length;
          // 워키토키 음성(voice)이 왔으면 띠동(dm_send), 그 외 새 메시지는 수신음(대표 지시 260929).
          const incoming = fresh.filter((m) => m.senderId !== uid);
          if (incoming.some((m) => m.messageType === 'voice')) playSound('dm_send');
          else if (incoming.length > 0) playSound('dm_receive');
          // 남이 등록한 공지는 이 시스템 메시지로만 알 수 있다 — 배너가 낡지 않게 conv 만 재조회
          if (fresh.some((m) => m.messageType === 'system' && m.meta?.kind === 'notice_set')) refreshConv();
          // F-DM-02(260928) — 상대가 세트를 바꾼(담기/제거/상태변경) 시스템·묶음카드가 도착하면 세트 재조회.
          if (fresh.some((m) => (typeof m.meta?.kind === 'string' && m.meta.kind.startsWith('trade_set')) || m.meta?.kind === 'reserve_prompt' || m.meta?.kind === 'revert_prompt' || m.meta?.subtype === 'bundle' || m.meta?.subtype === 'appointment_cancelled' || m.meta?.subtype === 'appointment_accepted')) refreshTradeSet();
          // 방 밖에 있던 활성 약속 스냅샷(conv.activeAppointment)도 약속 관련 신규 메시지에서 다시 받는다.
          if (fresh.some((m) => m.messageType === 'appointment' || m.meta?.subtype === 'appointment_cancelled' || m.meta?.subtype === 'appointment_accepted')) refreshConv();
          if (fresh.length > 0) markRead(conversationId).then(() => refreshUnread()).catch(() => {});
          else skipAutoScrollRef.current = true; // 수정/공감만 온 폴링은 바닥 스냅을 유발하지 않는다
        }
      } catch {
        // 순단 무시 — 다음 tick 에 재시도
      }
    };
    // 화면이 꺼진 동안 스킵 / 포그라운드 복귀 시 즉시 1회는 스케줄러가 보장한다.
    return registerPollTask({ id: `dm-messages:${conversationId}`, intervalMs: 5000, run: tick, runImmediately: false });
  }, [conversationId]); // messagesRef 로 최신값 참조 — interval 재시작 불필요 // eslint-disable-line react-hooks/exhaustive-deps

  // 음성메시지 이력 로드 + 폴링 — dm_messages 폴링과 같은 5초 주기·커서 패턴이지만, 저장소가
  // 별도 모듈(wt_messages)이라 별도 조회로 두고 렌더 시점에만 시간순으로 합친다(아래 feed).
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    voiceCursorRef.current = null;
    setVoiceItems([]);
    const load = async (after: string | null) => {
      try {
        const page = await walkieApi.messages(conversationId, after);
        if (cancelled) return;
        voiceCursorRef.current = page.cursor;
        if (page.items.length > 0) {
          setVoiceItems((prev) => {
            const map = new Map(prev.map((i) => [i.id, i]));
            for (const it of page.items) map.set(it.id, it);
            return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
        }
      } catch {
        // 순단 무시 — 다음 tick 에 재시도 (텍스트 메시지 폴링과 동일 패턴)
      }
    };
    void load(null);
    // 텍스트 폴링과 같은 5초라 스케줄러가 **같은 tick 에 정렬**한다 — 종전엔 타이머가 둘로
    // 갈라져 서로 다른 시점에 요청이 나갔다.
    const unregister = registerPollTask({
      id: `dm-voice:${conversationId}`,
      intervalMs: 5000,
      run: () => load(voiceCursorRef.current),
      runImmediately: false,
    });
    return () => {
      cancelled = true;
      unregister();
    };
  }, [conversationId]);

  // sendVoice 성공 직후에는 서버 음성 이력이 다음 폴링에 도착할 때까지 로컬 "전송됨" 버블을
  // 유지한다. 같은 시각 이후의 서버 이력이 들어오면 그 항목으로 자연스럽게 교체한다.
  useEffect(() => {
    for (const pending of pendingWalkieVoices) {
      if (pending.conversationId !== conversationId || pending.status !== 'sent') continue;
      if (voiceItems.some((voice) => voice.createdAt >= pending.createdAt)) removePendingWalkieVoice(pending.id);
    }
  }, [conversationId, pendingWalkieVoices, removePendingWalkieVoice, voiceItems]);

  const retryPendingWalkieVoice = useCallback(async (id: string, blob: Blob, durationMs: number) => {
    if (!conversationId) return;
    updatePendingWalkieVoice(id, { status: 'uploading', blob });
    try {
      await walkieApi.sendVoice(conversationId, blob, durationMs);
      updatePendingWalkieVoice(id, { status: 'sent' });
      playSound('dm_send');
    } catch {
      updatePendingWalkieVoice(id, { status: 'failed', blob });
      toast.error(t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' }));
    }
  }, [conversationId, t, updatePendingWalkieVoice]);

  // dm 텍스트 메시지 + 음성메시지(별도 저장소)를 시간순으로 합친 렌더 전용 피드.
  const feed = useMemo(() => {
    const dmRows = messages.map((m) => ({ kind: 'dm' as const, item: m, createdAt: m.createdAt }));
    const voiceRows = voiceItems.map((v) => ({ kind: 'voice' as const, item: v, createdAt: v.createdAt }));
    const pendingRows = pendingWalkieVoices
      .filter((voice) => voice.conversationId === conversationId)
      .map((voice) => ({ kind: 'pendingVoice' as const, item: voice, createdAt: voice.createdAt }));
    return [...dmRows, ...voiceRows, ...pendingRows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [conversationId, messages, pendingWalkieVoices, voiceItems]);

  // 일반 말풍선의 앞뒤 이웃. 음성·시스템·거래 카드는 발신자 묶음을 끊는다.
  const bubbleNeighborsById = useMemo(() => {
    const map = new Map<string, { previous: DmMessage | null; next: DmMessage | null }>();
    let last: DmMessage | null = null;
    for (const row of feed) {
      if (row.kind !== 'dm') {
        last = null;
        continue;
      }
      if (!isRegularBubble(row.item)) {
        last = null;
        continue;
      }
      map.set(row.item.id, { previous: last, next: null });
      last = row.item;
    }
    let next: DmMessage | null = null;
    for (let index = feed.length - 1; index >= 0; index -= 1) {
      const row = feed[index];
      if (row.kind !== 'dm' || !isRegularBubble(row.item)) {
        next = null;
        continue;
      }
      const neighbors = map.get(row.item.id);
      if (neighbors) neighbors.next = next;
      next = row.item;
    }
    return map;
  }, [feed]);

  // 일반 말풍선의 로컬 날짜 경계. 카드/음성 메시지가 중간에 끼어도 같은 날짜의
  // 두 번째 구분선을 만들지 않는다.
  const dateSeparatorMessageIds = useMemo(() => {
    const ids = new Set<string>();
    let previousDay: string | null = null;
    for (const row of feed) {
      if (row.kind !== 'dm' || !isDateSeparatorMessage(row.item)) continue;
      const day = localDayKey(row.item.createdAt);
      if (day !== previousDay) ids.add(row.item.id);
      previousDay = day;
    }
    return ids;
  }, [feed]);

  // 바닥 고정 여부 — 사용자가 위로 스크롤해 과거를 보는 중이면 false (자동 스크롤 중단)
  const pinnedRef = useRef(true);
  // 과거분 prepend / 수정·공감만 실린 폴링 — 바닥 스냅(정착 윈도우)을 1회 건너뛴다
  const skipAutoScrollRef = useRef(false);
  const kb = useKeyboard();
  // 정착 윈도우 루프가 프레임 단위 스냅으로 키보드 smooth 스크롤을 덮어쓰지 않도록
  // 키보드 표시 여부를 ref 로도 노출 (진입 직후 2초 내 첫 입력창 터치 시 경합 방지)
  const kbVisibleRef = useRef(false);
  useEffect(() => {
    kbVisibleRef.current = kb.visible;
  }, [kb.visible]);

  // 진입/새 메시지 시 바닥 고정 — 스티커·이미지 등 늦게 로드되는 요소가 스크롤 이후에
  // 높이를 키워도(언더슛) 정착 윈도우(2초) 동안 바닥을 유지한다. 사용자가 위로
  // 스크롤하거나 키보드가 뜨면(smooth 스크롤 담당) 즉시 중단한다.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (skipAutoScrollRef.current) {
      // 과거분 로드/수정·공감 반영 — 읽던 위치를 보존해야 하므로 바닥 고정을 걸지 않는다
      skipAutoScrollRef.current = false;
      return;
    }
    pinnedRef.current = true;
    const deadline = performance.now() + 2000;
    let raf = 0;
    const tick = (now: number) => {
      if (!pinnedRef.current) return;
      if (kbVisibleRef.current) {
        // 키보드 표시 중 새 메시지 — 프레임 스냅 루프는 smooth 스크롤과 싸우므로
        // smooth 1회로 처리하고 루프는 재예약하지 않는다.
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        return;
      }
      el.scrollTop = el.scrollHeight;
      if (now < deadline) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [messages, voiceItems]);

  // 인라인 진행중 바(ActiveSessionBar variant="inline")가 입력창 위 flex 형제로 마운트/
  // 높이변경되면 .messages(flex:1)의 실제 높이가 줄어드는데, 그 시점이 위 정착 윈도우(2초)
  // 밖이면(무전기 세션 시작과 첫 음성 버블이 동시에 도착하는 경우 등) 재스크롤 트리거가 없어
  // 새 버블 윗부분만 노출된 채 남는다 — 바닥 고정 중이면 리사이즈에도 바닥을 다시 스냅한다.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    // listRef(뷰포트 자신) 는 인라인 세션 바/탭바 등 형제 요소가 바뀌어 뷰포트 자체 박스가
    // 줄어드는 경우를 잡는다. contentRef(콘텐츠 래퍼) 는 음성 버블 파형·이미지처럼 메시지
    // 배열 변경 없이 내부 콘텐츠 높이만 늘어나 scrollHeight 만 커지는 경우를 잡는다 — 전자만
    // 관찰하면 후자는 뷰포트 박스 자체가 그대로라 콜백이 아예 안 불린다.
    ro.observe(el);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  // 키보드(iOS 오버레이)가 뜨면 컴포저 스페이서가 메시지 영역을 줄인다 —
  // 최근 메시지가 가려지지 않게 리스트를 바닥으로 부드럽게 재스크롤 (스페이서 렌더 반영 후).
  useEffect(() => {
    // 과거 메시지를 읽는 중(pinned 해제)이면 읽던 위치를 보존한다.
    if (!kb.visible || !pinnedRef.current) return;
    const t = window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [kb.visible]);

  // 거래완료(SOLD) 매물에 이미 남긴 후기 확인 — 있으면 배너 숨김 + 내 후기 표시(409 방지).
  useEffect(() => {
    const lid = conv?.contextId;
    if (!lid || conv?.contextListing?.status !== 'SOLD') return;
    fetchMyReview(lid)
      .then((r) => { setMyReview(r); if (r) setReviewed(true); })
      .catch(() => {});
  }, [conv?.contextId, conv?.contextListing?.status]);

  const handleSend = async (text: string) => {
    if (!text.trim() || !conversationId || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, text, replyTo ? { replyToMessageId: replyTo.id } : {});
      applyIncoming([msg]);
      setReplyTo(null);
      // 텍스트 발신은 무음 — 띠동(dm_send)은 워키토키 음성 발신·수신 전용(대표 지시 260929).
    } catch (err) {
      // 전송 실패 시 입력을 비운 채로 두지 않고 원문을 복원 — 재입력 없이 한 번의 조작으로 재전송 가능 (P1-6)
      composerRef.current?.setValue(text);
      // 상대가 이 화면을 연 뒤 나를 차단했을 수 있다. 단건 계약을 다시 받아 입력창을
      // 읽기 전용 상태로 전환한다(차단 주체는 서버가 노출하지 않는다).
      if (isDirect) refreshConv();
      const msg = err instanceof Error ? err.message : '';
      toast.error(
        msg.includes('banned_keyword')
          ? t('dm.bannedKeyword', { defaultValue: '금지된 표현이 포함되어 있습니다' })
          : t('common.errorUnexpected'),
      );
    } finally {
      setSending(false);
    }
  };

  // 대화 신고 (T&S)
  const handleReport = async (reason: DmReportReason) => {
    if (!conversationId) return;
    try {
      await reportConversation(conversationId, reason);
      setReportOpen(false);
      toast.success(t('dm.reportDone', { defaultValue: '신고가 접수되었어요' }));
    } catch (err) {
      setReportOpen(false); // 실패해도 닫는다 — 사유를 바꿔도 결과가 같다(MarketDetail 과 동일)
      // R-3(260819 W3) — 취소한 신고 재시도와 처리 중인 신고 재시도는 다른 문구로 안내한다.
      const code = extractErrorCode(err);
      if (code === 'report_already_cancelled') {
        toast.error(t('support.reportAlreadyCancelledError'));
      } else if (code === 'report_already_pending') {
        toast.error(t('support.reportAlreadyPendingError'));
      } else {
        toast.error(t('dm.reportError', { defaultValue: '이미 신고했거나 처리에 실패했어요' }));
      }
    }
  };

  // P5-5: 그룹 메시지 단위 신고 (T&S)
  const handleReportMessage = async (reason: DmReportReason) => {
    if (!conversationId || !messageReportId) return;
    try {
      await reportGroupMessage(conversationId, messageReportId, reason);
      setMessageReportId(null);
      toast.success(t('dm.reportDone', { defaultValue: '신고가 접수되었어요' }));
    } catch (err) {
      setMessageReportId(null); // 실패해도 닫는다 — 사유를 바꿔도 결과가 같다(handleReport 와 동일)
      const code = extractErrorCode(err);
      if (code === 'report_already_cancelled') {
        toast.error(t('support.reportAlreadyCancelledError'));
      } else if (code === 'report_already_pending') {
        toast.error(t('support.reportAlreadyPendingError'));
      } else {
        toast.error(t('dm.reportError', { defaultValue: '이미 신고했거나 처리에 실패했어요' }));
      }
    }
  };

  // 사진 첨부: /contents/upload → sendMessage(imageContentId) (MarketCreate 업로드 패턴 동일)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file || !conversationId || !user || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      form.append('owner_id', user.id);
      const { id } = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      const msg = await sendMessage(conversationId, '', { imageContentId: id });
      applyIncoming([msg]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  // 스티커 전송: message_type='sticker' + meta.stickerId (백엔드 meta 제네릭, 무변경)
  const handleSendSticker = async (stickerId: string) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, '', { messageType: 'sticker', meta: { stickerId } });
      applyIncoming([msg]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  // 워키토키 헤더메뉴 "워키토키" 탭 — 이 대화방으로 참여 + 상대방에게 초대카드 전송(채널 존재를 모를 수 있으므로).
  const handleWalkieJoin = async () => {
    if (!conversationId) return;
    const msg = await joinWalkieChannel(
      conversationId,
      { name: isDirect ? otherName : roomTitle, isGroup: !isDirect },
      user?.nickname,
    );
    if (msg) applyIncoming([msg]);
  };

  // 약속잡기 시트 오픈 시 일시 기본값 = 다음 정시(최소 30분 이후). datetime-local은 로컬 타임존 문자열이 필요해 toISOString() 사용 금지.
  const getDefaultApptWhen = () => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const handleOpenAppt = () => {
    if (!apptWhen) setApptWhen(getDefaultApptWhen());
    setApptOpen(true);
  };

  const handleSendAppointment = async () => {
    if (!conversationId || !apptWhen || sending) return;
    setSending(true);
    try {
      const msg = await proposeAppointment(conversationId, {
        whenAt: apptWhen,
        // 장소 이름 = 핀 좌표의 동(매물 등록 동 아님) + 상세 위치(선택) → "상세 · 동"
        placeName: apptPlace ? [apptDetail.trim(), apptPlace.districtName].filter(Boolean).join(' · ') : null,
        placeLat: apptPlace?.lat ?? null,
        placeLng: apptPlace?.lng ?? null,
        listingId: selectedListingId,
      });
      applyIncoming([msg]);
      setApptOpen(false);
      setApptWhen('');
      setApptPlace(null);
      setApptDetail('');
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  const handleSendPriceOffer = async (amount: number) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const msg = await proposePriceOffer(conversationId, amount, selectedListingId);
      // 서버가 직전 PROPOSED 제안을 supersede(CANCELLED) 하므로 로컬 카드도 즉시 갱신 (DM-2)
      setMessages((prev) =>
        upsertMessages(
          prev.map((m) =>
            m.priceOffer?.status === 'PROPOSED' && m.priceOffer.id !== msg.priceOffer?.id
              ? { ...m, priceOffer: { ...m.priceOffer, status: 'CANCELLED' as const } }
              : m,
          ),
          [msg],
        ),
      );
      void saveCachedMessages([msg]);
      setOfferOpen(false);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  // 제안 상태 변경 후 해당 메시지의 priceOffer 갱신 (약속과 동일 패턴)
  const patchPriceOffer = (offer: PriceOffer) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.priceOffer?.id === offer.id ? { ...msg, priceOffer: offer } : msg)),
    );
  };

  const handlePriceOfferAction = async (
    action: (id: string) => Promise<PriceOffer>,
    offerId: string,
  ) => {
    if (sending) return;
    setSending(true);
    try {
      patchPriceOffer(await action(offerId));
      // 가격제안 수락이 약속잡기 게이트를 풀 수 있으므로 대화 컨텍스트 재조회
      if (conversationId) fetchConversation(conversationId).then(setConv).catch(() => {});
    } catch {
      // 카드가 stale(이미 변경된 제안) → 메시지 재동기화로 카드 상태 교정
      if (conversationId) fetchMessages(conversationId).then((res) => applyIncoming(res.items)).catch(() => {});
      toast.error(t('dm.priceOfferOutdated', { defaultValue: '제안 상태가 변경되어 새로고침했어요' }));
    } finally {
      setSending(false);
    }
  };

  // F-DM-02(260928) — 판매자에게 "예약중으로 변경할까요?" 를 묻는 reserve_prompt 카드의 로컬 무시 상태.
  // 서버에 저장하지 않는 UI 상태(다음 방문 시 다시 보여도 무방한 안내)라 대화별로 재조회할 필요가 없다.
  const [dismissedPromptIds, setDismissedPromptIds] = useState<Set<string>>(new Set());
  // F-X-01 FR-1(r8) — 약속 취소 후 판매자 revert_prompt [되돌리기]: 상태 시트 [판매중]과 같은 호출.
  const handleRevertPromptRevert = async (msgId: string) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      setTradeSet(await updateTradeSetStatus(conversationId, 'ON_SALE'));
      setDismissedPromptIds((prev) => new Set(prev).add(msgId));
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSending(false);
    }
  };
  const handleReservePromptChange = async (msgId: string) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      setTradeSet(await updateTradeSetStatus(conversationId, 'RESERVED'));
      setDismissedPromptIds((prev) => new Set(prev).add(msgId));
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSending(false);
    }
  };

  // P6: 실시간 위치공유 채널을 약속에 연결할 때 넘길 "현재 약속" — 대화 내 가장 최근 약속 메시지 기준.
  // 약속이 없는 대화면 null → 위치공유는 이제 그래도 켜진다(약속 독립, 2026-08-29), 정밀도 창 정책만 빠진다.
  // F-DM-02(리뷰 지적 MEDIUM, 260928): 매물이 둘 이상 얽힌 방에서는 선택된 대표 매물의 약속만
  // 봐야 한다 — 아니면 매물 B 를 보는 중에 매물 A 의 거래 배너/세션바가 뜬다. 매물이 하나뿐이거나
  // 아직 선택이 없으면(구조가 단순한 방) 종전 동작(최신 약속 메시지)을 그대로 유지한다.
  const currentAppointment = useMemo<Appointment | null>(() => {
    const scoped = (tradeSet?.items.length ?? 0) > 1 && selectedListingId != null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const appt = messages[i].appointment;
      if (messages[i].messageType !== 'appointment' || !appt) continue;
      if (scoped && appt.listingId !== selectedListingId) continue;
      return appt;
    }
    return null;
  }, [messages, tradeSet?.items.length, selectedListingId]);
  const currentAppointmentId = currentAppointment?.id ?? null;

  // 칩 행 [약속 잡기]/[📅]/제안 표시용 — 방의 최신 활성(PROPOSED/ACCEPTED) 약속. 세트·매물 스코프와 무관(약속 독립, F-N-02 FR-7).
  // 로드된 메시지가 우선(폴링으로 최신). 카드가 로드 범위 밖이면 서버 스냅샷(conv.activeAppointment)으로 보완한다(F-DM-02 FR-8).
  const activeAppointment = useMemo<Appointment | null>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const appt = messages[i].appointment;
      if (messages[i].messageType !== 'appointment' || !appt) continue;
      if (appt.status === 'PROPOSED' || appt.status === 'ACCEPTED') return appt;
    }
    const server = conv?.activeAppointment;
    if (server && (server.status === 'PROPOSED' || server.status === 'ACCEPTED')
      && !messages.some((m) => m.appointment?.id === server.id)) return server;
    return null;
  }, [messages, conv?.activeAppointment]);

  // 약속 시트 [대화에서 보기] — 카드 메시지가 로드 범위 안에 있을 때만 이동 대상이 있다.
  const apptCardMessageId = activeAppointment
    ? messages.find((m) => m.appointment?.id === activeAppointment.id)?.id ?? null
    : null;

  // ①: 결제(거래) 기록은 세트에 귀속(F-N-02 FR-7 ④) — 결제 열림 = 세트에 예약중 항목 존재. 이때만 1회 조회한다(폴링 없음).
  // payment_qr 메시지는 meta.tradeSetId 로 매칭하고, 구 메시지(appointmentId 만)는 현재 약속으로 폴백한다.
  const tradeSetId = tradeSet?.id ?? null;
  const hasReservedItem = tradeSet?.status === 'ACTIVE' && tradeSet.items.some((it) => it.status === 'RESERVED');
  const hasPaymentQrMessage = useMemo(
    () => messages.some((m) => m.messageType === 'payment_qr' && (
      m.meta?.tradeSetId ? m.meta.tradeSetId === tradeSetId : m.meta?.appointmentId === currentAppointmentId
    )),
    [messages, tradeSetId, currentAppointmentId],
  );
  const [tradeBannerTx, setTradeBannerTx] = useState<MarketplaceTransaction | null>(null);
  useEffect(() => {
    if (!hasReservedItem || !tradeSetId) {
      setTradeBannerTx(null);
      return;
    }
    let active = true;
    fetchMarketplaceTransaction(tradeSetId)
      .then((tx) => { if (active) setTradeBannerTx(tx); })
      .catch(() => {});
    return () => { active = false; };
  }, [hasReservedItem, tradeSetId, hasPaymentQrMessage]);

  // F-N-02 FR-7 ⑤ 칩 행 퀵액션 [물건 확인했어요] — 게이트가 아니라 제안. 선입금 방지(C2)는 "직접 보셨나요?" 확인으로 지킨다.
  const handleInspectItem = () => {
    if (!tradeSetId) return;
    useConfirmStore.getState().open(
      t('dm.tradeInspectConfirm', { defaultValue: '만나서 물건을 직접 보셨나요?' }),
      () => {
        useConfirmStore.getState().close();
        confirmMarketplaceItemInspection(tradeSetId)
          .then((tx) => {
            setTradeBannerTx(tx);
            toast.success(t('dm.tradeInspectionSaved'));
          })
          .catch(() => toast.error(t('common.errorUnexpected')));
      },
      { confirmLabel: t('dm.tradeInspectConfirmCta', { defaultValue: '네, 확인했어요' }) },
    );
  };

  const requestAppointmentNavigation = useCallback((appointmentId: string) => {
    if (navigationRequestedRef.current.has(appointmentId)) return;
    navigationRequestedRef.current.add(appointmentId);
    setAppointmentNavigation((previous) => ({
      ...previous,
      [appointmentId]: { status: 'loading' },
    }));
    void fetchAppointmentNavigation(appointmentId)
      .then((destination) => {
        if (!acceptedNavigationIdsRef.current.has(appointmentId)) return;
        setAppointmentNavigation((previous) => ({
          ...previous,
          [appointmentId]: { status: 'ready', destination },
        }));
      })
      .catch((error) => {
        if (!acceptedNavigationIdsRef.current.has(appointmentId)) return;
        setAppointmentNavigation((previous) => ({
          ...previous,
          [appointmentId]: { status: 'error', errorCode: extractErrorCode(error) },
        }));
      });
  }, []);

  const retryAppointmentNavigation = (appointmentId: string) => {
    navigationRequestedRef.current.delete(appointmentId);
    requestAppointmentNavigation(appointmentId);
  };

  // ACCEPTED 약속만 전용 권한 경계(참여자 확인)에서 목적지를 다시 받고, 성공 좌표는 이 화면의 메모리에만 둔다.
  useEffect(() => {
    const acceptedIds = messages
      .filter((message) => message.appointment?.status === 'ACCEPTED')
      .map((message) => message.appointment!.id);
    const accepted = new Set(acceptedIds);
    acceptedNavigationIdsRef.current = accepted;
    const start = window.setTimeout(() => {
      for (const appointmentId of navigationRequestedRef.current) {
        if (!accepted.has(appointmentId)) navigationRequestedRef.current.delete(appointmentId);
      }
      setAppointmentNavigation((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([appointmentId]) => accepted.has(appointmentId))),
      );
      for (const appointmentId of acceptedIds) {
        requestAppointmentNavigation(appointmentId);
      }
    }, 0);
    return () => window.clearTimeout(start);
  }, [messages, requestAppointmentNavigation]);

  // ── Live Activity(거래) — SoT ai-docs/task/active/260829_live_activity_task.md Phase 2 (D-3) ──
  // ACCEPTED & 약속 T-30분~T+60분 창에서 잠금화면 카드를 띄우고, 완료/취소가 보이면 마지막 모습으로 2분 뒤 소멸.
  // 창 진입을 대화방을 연 채로 기다리는 경우를 위해 1분마다 재평가한다. 카드 유무는 네이티브가 upsert 로
  // 처리하므로 같은 값을 반복 호출해도 무해하다. 앱을 닫아둔 사이의 상태 변화는 Phase 3(APNs 원격 갱신) 몫.
  const [laTick, setLaTick] = useState(0);
  useEffect(() => {
    if (!currentAppointment || currentAppointment.status !== 'ACCEPTED') return;
    const id = window.setInterval(() => setLaTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [currentAppointment]);
  useEffect(() => {
    const appt = currentAppointment;
    if (!appt || !conversationId) return;
    const whenMs = new Date(appt.whenAt).getTime();
    if (!Number.isFinite(whenMs)) return;
    const statusKind: DealStatusKind = appt.status === 'COMPLETED'
      ? 'completed'
      : appt.status === 'CANCELLED'
        ? 'cancelled'
        : appt.completionRequestedBy && !appt.completionDeclinedAt // 거절되면 requested_by 가 남아도 '약속 확정'
          ? 'completionRequested'
          : 'accepted';
    const statusText = t(`dm.laStatus.${statusKind}`, {
      defaultValue: { accepted: '약속 확정', completionRequested: '완료 요청됨', completed: '거래 완료', cancelled: '약속 취소' }[statusKind],
    });
    const state = {
      statusText,
      statusKind,
      placeName: appt.placeName ?? '',
      appointmentAtMs: whenMs,
      peerDistanceText: '',
    };
    if (appt.status === 'ACCEPTED') {
      const now = Date.now();
      const inWindow = now >= whenMs - 30 * 60_000 && now <= whenMs + 60 * 60_000;
      if (!inWindow) return;
      void native.liveActivity.start({
        kind: 'deal',
        attributes: {
          conversationId,
          appointmentId: appt.id,
          // `listing`(=conv?.contextListing) 은 아래에서 선언되므로 여기선 conv 를 직접 읽는다.
          listingTitle: conv?.contextListing?.title ?? '',
          peerName: isDirect ? otherName : roomTitle,
          deepLink: `dm&id=${conversationId}`,
        },
        state,
      });
      return;
    }
    if (appt.status === 'COMPLETED' || appt.status === 'CANCELLED') {
      void native.liveActivity.end({ kind: 'deal', finalState: state, dismissAfterSec: 120 });
    }
  }, [currentAppointment, conversationId, conv?.contextListing?.title, isDirect, otherName, roomTitle, laTick, t]);

  // 약속 상태 변경 후 해당 메시지의 appointment를 갱신 (5초 폴링과 별개로 즉시 반영)
  const patchAppointment = (appt: Appointment) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.appointment?.id === appt.id ? { ...msg, appointment: appt } : msg)),
    );
    setConv((prev) => (prev?.activeAppointment?.id === appt.id ? { ...prev, activeAppointment: appt } : prev));
  };

  const handleAppointmentAction = async (
    action: (id: string) => Promise<Appointment>,
    appointmentId: string,
  ) => {
    if (sending) return;
    setSending(true);
    try {
      patchAppointment(await action(appointmentId));
      // 약속 상태 변경이 매물 상태(RESERVED/SOLD/ON_SALE)를 바꾸므로 컨텍스트 갱신
      if (conversationId) fetchConversation(conversationId).then(setConv).catch(() => {});
      refreshTradeSet();
    } catch {
      // 카드가 stale(이미 변경된 약속) → 메시지 재동기화로 카드 상태 교정
      if (conversationId) fetchMessages(conversationId).then((res) => applyIncoming(res.items)).catch(() => {});
      toast.error(t('dm.apptOutdated', { defaultValue: '약속 상태가 변경되어 새로고침했어요' }));
    } finally {
      setSending(false);
    }
  };

  // F-DM-02 FR-8: 약속 카드와 약속 시트가 같은 행동 핸들러·표시 상태를 쓴다(한 곳 정의).
  // 약속 취소에 확인 1회(260919 리뷰킷 F-S5-01 FR-1 ⓐ, F-X-01 FR-1 ⓐ). 약속 독립 원칙(F-N-02 FR-7)으로
  // 약속 취소는 거래에 영향이 없어 거래 취소 문구를 쓰지 않는다(r8). PROPOSED 단계의 제안 취소/거절은
  // 성립 전이라 손실이 없어 확인 없이 그대로 둔다.
  const requestCancelAppointment = (appt: Appointment) => {
    if (appt.status === 'ACCEPTED') {
      // F-X-01 FR-1(260924 승인안): 사유 칩 3개(선택 필수 1) → useConfirmStore 확인 1회.
      useCancelReasonStore.getState().open(
        t('dm.cancelReasonTitle'),
        (reason) => useConfirmStore.getState().open(
          t('dm.apptCancelConfirm'),
          () => {
            useConfirmStore.getState().close();
            handleAppointmentAction((id) => cancelAppointment(id, reason), appt.id);
          },
          { confirmLabel: t('dm.apptCancelConfirmCta') },
        ),
      );
    } else {
      handleAppointmentAction(cancelAppointment, appt.id);
    }
  };

  const apptCancelLabel = (appt: Appointment) =>
    appt.status === 'ACCEPTED'
      ? t('dm.apptCancel', { defaultValue: '약속 취소' })
      : appt.proposerId === myId
        ? t('dm.apptCancelOffer', { defaultValue: '제안 취소' })
        : t('dm.apptReject', { defaultValue: '거절' });

  const startApptLiveLocation = (appt: Appointment) => {
    const hasCoords = appt.placeLat != null && appt.placeLng != null;
    startLiveLocation({
      appointmentId: appt.id,
      dest: hasCoords ? { lat: appt.placeLat!, lng: appt.placeLng!, ...(appt.placeName ? { name: appt.placeName } : {}) } : undefined,
      sendInvite: true,
    });
  };

  const apptNavView = (appt: Appointment): AppointmentNavView => {
    const navState = appointmentNavigation[appt.id];
    const accepted = appt.status === 'ACCEPTED';
    return {
      show: accepted && navState?.status === 'ready' && !!navState.destination,
      canRetry: accepted && navState?.status === 'error',
      reason: accepted
        ? routeChecking
          ? t('locationGate.checking', '위치를 확인하고 있어요')
          : !routeAvailable
            ? routeGateReason
              ? t(`locationGate.${routeGateReason}.title`)
              : t('locationGate.checking', '위치를 확인하고 있어요')
            : navState?.status === 'loading'
              ? t('dm.apptNavigationChecking', { defaultValue: '약속 장소를 확인하고 있어요.' })
              : navState?.status === 'error'
                ? t('dm.apptNavigationUnavailable', { defaultValue: '지금은 길안내를 준비할 수 없어요. 잠시 후 다시 확인해 주세요.' })
                : null
        : null,
      locked: !routeAvailable,
    };
  };

  // 약속 시트(F-DM-02 FR-8) — 열려 있는 동안 최신 activeAppointment 로 다시 그린다. 상대가 취소·완료해
  // 활성 약속이 사라지면 dm.apptOutdated 토스트 후 닫는다(내 행동은 시트를 먼저 닫아 이 경로를 타지 않는다).
  const [apptSheetOpen, setApptSheetOpen] = useState(false);
  useEffect(() => {
    if (apptSheetOpen && !activeAppointment) {
      setApptSheetOpen(false);
      toast.error(t('dm.apptOutdated', { defaultValue: '약속 상태가 변경되어 새로고침했어요' }));
    }
  }, [apptSheetOpen, activeAppointment, t]);

  const handleTranslateMsg = async (msgId: string, content: string) => {
    if (tr[msgId]) {
      setTrOpen((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
      return;
    }
    try {
      const { translated } = await translateText(content);
      setTr((prev) => ({ ...prev, [msgId]: translated }));
      setTrOpen((prev) => ({ ...prev, [msgId]: true }));
    } catch {
      toast.error(t('dm.translateError', { defaultValue: '번역 실패' }));
    }
  };

  // ── 메시지 액션 (215_dm_message_sync): 롱프레스 → 시트(공감/답장/수정/삭제) ──────
  const pressTimerRef = useRef<number | null>(null);
  const cancelPress = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const closeMessageActions = () => {
    cancelPress();
    setActionMsgId(null);
    setActionAnchor(null);
  };
  const openMessageActions = (m: DmMessage, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setActionAnchor({
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setActionMsgId(m.id);
  };
  const startPress = (m: DmMessage, target: HTMLElement) => {
    cancelPress();
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      openMessageActions(m, target);
    }, 450);
  };
  // 텍스트/삭제/이미지/스티커 메시지에만 액션을 건다 — 약속/제안/시스템 카드는 전용 플로우가 있다
  const pressHandlers = (m: DmMessage) => ({
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => startPress(m, e.currentTarget),
    onTouchEnd: cancelPress,
    onTouchMove: cancelPress,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => { e.preventDefault(); openMessageActions(m, e.currentTarget); },
  });

  useEffect(() => {
    if (!actionMsgId) return;
    const close = () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      setActionMsgId(null);
      setActionAnchor(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [actionMsgId]);

  // 실제 메뉴 높이를 먼저 읽어야 화면 하단의 말풍선에서도 메뉴가 원본 바로 위에 붙는다.
  // useLayoutEffect라 첫 프레임을 그리기 전에 앵커 위치를 바로잡는다.
  useLayoutEffect(() => {
    if (!actionMsgId || !actionPanelRef.current) {
      setActionPanelHeight(0);
      return;
    }
    const nextHeight = actionPanelRef.current.getBoundingClientRect().height;
    setActionPanelHeight((current) => current === nextHeight ? current : nextHeight);
  }, [actionMsgId, actionAnchor, actionMsg]);

  const handleToggleReaction = async (m: DmMessage, emoji: string) => {
    if (!conversationId) return;
    closeMessageActions();
    const mine = m.reactions.some((r) => r.emoji === emoji && r.reactedByMe);
    try {
      const reactions = mine
        ? await removeReaction(conversationId, m.id, emoji)
        : await addReaction(conversationId, m.id, emoji);
      skipAutoScrollRef.current = true;
      // updatedAt 도 함께 올린다 — 로컬 낙관 반영이 워터마크를 뒤로 되돌리지 않게(다음 폴링이 서버값으로 정정)
      applyIncoming([{ ...m, reactions, updatedAt: new Date().toISOString() }]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const handleDeleteMsg = async (m: DmMessage) => {
    if (!conversationId) return;
    closeMessageActions();
    try {
      await deleteMessage(conversationId, m.id);
      skipAutoScrollRef.current = true;
      // updatedAt 도 함께 올린다 — 워터마크 후퇴 방지 (다음 폴링이 서버값으로 정정)
      applyIncoming([{ ...m, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: null, imageUrl: null, reactions: m.reactions }]);
      // 공지 원본을 지우면 서버가 공지를 null 로 해석한다 — 배너도 함께 내린다
      if (conv?.notice?.messageId === m.id) refreshConv();
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const handleStartEdit = (m: DmMessage) => {
    closeMessageActions();
    setEditingId(m.id);
    setEditText(m.content ?? '');
  };

  const handleSaveEdit = async () => {
    if (!conversationId || !editingId || !editText.trim()) return;
    try {
      const msg = await editMessage(conversationId, editingId, editText.trim());
      skipAutoScrollRef.current = true;
      applyIncoming([msg]);
      setEditingId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(
        message.includes('banned_keyword')
          ? t('dm.bannedKeyword', { defaultValue: '금지된 표현이 포함되어 있습니다' })
          : t('common.errorUnexpected'),
      );
    }
  };

  // 답장 인용 탭 → 원본으로 스크롤 (로컬에 있을 때만)
  const scrollToMessage = (id: string) => {
    const el = listRef.current?.querySelector(`[data-mid="${id}"]`);
    if (el) {
      pinnedRef.current = false;
      skipAutoScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleNavigate = (destination: AppointmentNavigationDestination) => {
    if (!routeAvailable) return;
    const query = new URLSearchParams({
      type: 'nav',
      appointmentId: destination.appointmentId,
      lat: String(destination.placeLat),
      lng: String(destination.placeLng),
    });
    if (destination.placeName) query.set('name', destination.placeName);
    navigate(`/ride-nav?${query.toString()}`);
  };

  // 현재위치 미리보기는 약속 카드와 별도 기능이다. 약속 목적지에는 이 경로를 쓰지 않는다.
  const handlePinPreviewNavigate = (lat: number, lng: number) => {
    if (!routeAvailable) return;
    navigate(`/ride-nav?type=nav&lat=${lat}&lng=${lng}`);
  };

  const handleReviewSubmitted = () => {
    setReviewed(true);
  };

  /**
   * 실시간 위치공유 채널 시작/참가 플로우 (2026-08-29 채널 모델, 설계 §7-1: 참가 = 명시적 동의).
   * '+' 실시간위치 / 헤더 '위치 공유하기' / 약속카드 '위치공유' / 초대카드 '참여하기' 가 전부 여기로 온다.
   * 이미 이 방 채널에 참가 중이면 동의 없이 모달만 연다.
   */
  const startLiveLocation = (ctx: { appointmentId?: string; dest?: { lat: number; lng: number; name?: string }; sendInvite: boolean }) => {
    if (liveChannelConversationId === conversationId) {
      openLiveModal(true);
      return;
    }
    setLiveConsentCtx(ctx);
  };

  const handleLiveConsent = async (consentVersion: string) => {
    const ctx = liveConsentCtx;
    setLiveConsentCtx(null);
    if (!ctx || !conversationId) return;
    try {
      const state = await createOrJoinLocationChannel(conversationId, {
        consentVersion,
        dest: ctx.dest,
        appointmentId: ctx.appointmentId,
      });
      setLiveChannel(state);
      openLiveModal(true);
      // 상대는 채널이 열린 걸 모를 수 있으므로 초대카드를 보낸다(생성 시에만 — 참가 시엔 보내지 않는다).
      if (ctx.sendInvite) {
        const msg = await sendLocationShareInvite(conversationId, user?.nickname, state.id);
        if (msg) applyIncoming([msg]);
      }
    } catch (err) {
      const status = httpStatusOf(err);
      toast.error(
        status === 410
          ? t('liveLocation.ended', { defaultValue: '위치공유 채널이 종료됐어요' })
          : t('liveLocation.openError', { defaultValue: '채널을 열 수 없어요' }),
      );
    }
  };

  /**
   * 현재위치 공유(2026-08-29, 대표 지시) — 실시간 위치공유와 **별개 기능**이다.
   * 실시간 공유가 세션 동안 좌표를 계속 갱신하는 반면, 이건 "지금 이 지점" 한 장을 카드로
   * 보내고 끝난다("저 여기 있어요"). 그래서 약속·동의절차·TTL 이 전혀 없다.
   *
   * 기록형(좌표가 DB 에 남고 상대에게 전달됨)이므로 `requireServiceLocation()` 를 쓴다 —
   * 중심가 폴백을 절대 쓰지 않는다(폴백 좌표를 "내 위치"로 보내면 상대를 속이는 것이다).
   */
  const handleSendCurrentLocation = async () => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const gate = await requireServiceLocation();
      if (!gate.ok) {
        toast.neutral(t(`locationGate.${gate.reason}.title`, { defaultValue: '위치를 확인할 수 없어요' }));
        return;
      }
      const msg = await sendMessage(conversationId, '', {
        messageType: 'location_pin',
        meta: { placeLat: gate.coords.lat, placeLng: gate.coords.lng },
      });
      applyIncoming([msg]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  const handleLeaveRoom = () => {
    if (!conversationId) return;
    setMoreSheetOpen(false);
    useConfirmStore.getState().open(
      isDirect
        ? t('dm.leaveDirectConfirm')
        : t('dm.leaveGroupConfirm'),
      async () => {
        try {
          await leaveConversation(conversationId);
          useConfirmStore.getState().close();
          navigate('/dm');
        } catch {
          useConfirmStore.getState().close();
          toast.error(t('common.errorUnexpected'));
        }
      },
      { confirmLabel: t('dm.leaveRoom') },
    );
  };

  const handleBlockPick = () => {
    if (!conversationId || !otherUserId) return;
    setMoreSheetOpen(false);
    const hasActiveTrade = currentAppointment?.status === 'ACCEPTED';
    useConfirmStore.getState().open(
      {
        mode: 'text',
        value: hasActiveTrade
          ? t('dm.blockConfirmTrade', {
              defaultValue: '진행 중 거래가 있어요 — 차단하면 약속이 취소되고 고객센터에 자동 접수돼요',
            })
          : t('dm.blockConfirm', {
              name: otherName,
              defaultValue: `${otherName}님을 차단할까요? 이 사람의 메시지·매물이 더 이상 보이지 않아요. 상대에게는 알리지 않아요`,
            }),
      },
      async () => {
        try {
          await blockUser(otherUserId);
          useConfirmStore.getState().close();
          setConv((prev) => prev ? { ...prev, messagingDisabled: true, blockedByMe: true } : prev);
          if (walkieActiveConversationId === conversationId) {
            useWalkieTalkieBubbleStore.getState().close();
          }
          if (liveChannelConversationId === conversationId) {
            useLocationChannelStore.getState().clear();
          }
          toast.success(t('market.blockDone', {
            defaultValue: '차단했어요 · 설정 > 차단 사용자 관리에서 해제할 수 있어요',
          }));
        } catch {
          useConfirmStore.getState().close();
          toast.error(t('market.blockError', { defaultValue: '차단 처리에 실패했어요' }));
        }
      },
      { confirmLabel: { mode: 'text', value: t('dm.blockAction', { defaultValue: '차단' }) } },
    );
  };

  const myId = session?.userId ?? user?.id;
  const listing = conv?.contextListing ?? null;
  // F-DM-02(260928) — 물품 피커 대상 판매자. 세트가 있으면 그 판매자, 없으면(첫 담기 전) 방 컨텍스트 매물의 판매자.
  const pickerSellerId = tradeSet?.sellerId ?? listing?.sellerId ?? null;

  // 그룹방은 말풍선마다 발신자를 표시해야 하므로 진입 시 1회 멤버 목록을 받는다(답장바 이름도 이걸 쓴다).
  // 5초 폴링에는 태우지 않는다 — 멤버 변동은 방 재진입 시 반영된다.
  useEffect(() => {
    if (isDirect || !conversationId) return;
    fetchMembers(conversationId)
      .then((ms) => {
        setMemberNames(Object.fromEntries(ms.map((mm) => [mm.userId, mm.nickname ?? ''])));
        setMemberAvatars(Object.fromEntries(ms.map((mm) => [mm.userId, mm.avatarUrl])));
        setMyRole(ms.find((mm) => mm.userId === myId)?.role ?? null);
      })
      .catch(() => {});
  }, [isDirect, conversationId, myId]);

  // ── 방 공지(init/217) ─────────────────────────────────────────────
  const notice = conv?.notice ?? null;
  const canClearNotice = !!notice && (notice.setBy === myId || myRole === 'owner' || myRole === 'admin');

  const handleSetNotice = async (m: DmMessage) => {
    if (!conversationId) return;
    closeMessageActions();
    try {
      setConv(await setConversationNotice(conversationId, m.id));
      toast.success(t('dm.noticeSetDone', { defaultValue: '공지로 등록했어요' }));
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const handleClearNotice = async () => {
    if (!conversationId) return;
    try {
      setConv(await clearConversationNotice(conversationId));
      setNoticeExpanded(false);
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  // 말풍선 아래 공감 카운트 배지 — 탭하면 토글 (텍스트/이미지 버블 공용)
  const renderReactions = (m: DmMessage) =>
    m.reactions.length > 0 ? (
      <div className={styles.reactionRow}>
        {m.reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            className={`${styles.reactionChip} ${r.reactedByMe ? styles.reactionChipMine : ''}`}
            onClick={(e) => { e.stopPropagation(); handleToggleReaction(m, r.emoji); }}
          >
            {r.emoji} {r.count}
          </button>
        ))}
      </div>
    ) : null;

  const renderDirectAvatar = (m: DmMessage, previous: DmMessage | null) => {
    if (!isDirect || m.senderId === myId) return null;
    const showAvatar = !isSameSenderRun(previous, m);
    return (
      <div className={styles.messageProfileSlot}>
        {showAvatar && otherUserId && (
          <button
            type="button"
            className={styles.messageProfileBtn}
            onClick={() => navigate(`/profile/${otherUserId}`)}
            aria-label={t('userProfile.openProfile')}
          >
            <Avatar src={otherAvatarUrl} name={otherName} seed={otherUserId} size={30} />
          </button>
        )}
      </div>
    );
  };

  const renderMessageMeta = (m: DmMessage, isMine: boolean, next: DmMessage | null) => {
    if (isSameSenderRun(m, next)) return null;
    return (
      <div className={styles.messageMeta}>
        {m.editedAt && (
          <span className={styles.editedTag}>{t('dm.edited', { defaultValue: '(수정됨)' })}</span>
        )}
        {formatMessageTimestamp(m.createdAt)}
        {isMine && renderReadState(m)}
      </div>
    );
  };

  /**
   * 내가 보낸 메시지의 수신 상태.
   * - 1:1  : 상대가 읽으면 "읽음". 종전엔 작은 체크 아이콘뿐이라 읽혔는지 알아보기 어려웠다.
   * - 그룹 : 아직 안 읽은 인원수. 전원이 읽으면 아무것도 표시하지 않는다(카톡과 같은 규칙).
   * 상대 메시지에는 붙지 않는다 — 내가 읽었는지는 나에게 정보가 아니다.
   */
  const renderReadState = (m: DmMessage) => {
    // 워터마크가 메시지 시각 이상이면 그 사람은 이 메시지를 읽은 것이다.
    // 한 번도 안 읽은 사람(lastReadAt === null)은 안 읽은 쪽으로 센다.
    // ISO 문자열 직접 비교는 서버 표기('Z' vs '+00:00')에 따라 어긋날 수 있어 시각으로 비교한다.
    const createdMs = Date.parse(m.createdAt);
    const unread = readWatermarks.filter(
      (w) => w.lastReadAt === null || Date.parse(w.lastReadAt) < createdMs,
    ).length;
    if (isDirect) {
      // 상대가 1명뿐이라 0 이면 읽은 것. 워터마크가 아직 안 왔으면(빈 배열) 표시하지 않는다.
      return readWatermarks.length > 0 && unread === 0
        ? <span className={styles.readState}>{t('dm.read', { defaultValue: '읽음' })}</span>
        : null;
    }
    return unread > 0 ? <span className={styles.unreadCount}>{unread}</span> : null;
  };

  const renderDateSeparator = (m: DmMessage) => dateSeparatorMessageIds.has(m.id) ? (
    <div className={styles.dateSeparator}>
      <span>{formatMessageDateSeparator(m.createdAt)}</span>
    </div>
  ) : null;

  // 그룹방 발신자 이름 — 같은 사람이 2분 내 연속으로 말하면 첫 말풍선에만 붙인다.
  const renderSender = (m: DmMessage, prev: DmMessage | null) => {
    if (isDirect || m.senderId === myId) return null;
    if (isSameSenderRun(prev, m)) return null;
    // 나간 멤버는 멤버 목록에 없다 — 이름 대신 폴백 문구
    const senderName = memberNames[m.senderId] || t('dm.unknownMember', { defaultValue: '알 수 없음' });
    return (
      <div className={styles.senderRow}>
        <Avatar src={memberAvatars[m.senderId]} name={senderName} seed={m.senderId} size={28} />
        <span className={styles.senderName}>{senderName}</span>
      </div>
    );
  };

  // 답장 인용 미리보기 — 스냅샷(replyPreview) 기반이라 원본이 캐시 밖이어도 렌더된다
  const renderReplyQuote = (m: DmMessage) =>
    m.replyPreview ? (
      <button
        type="button"
        className={styles.replyQuote}
        onClick={(e) => { e.stopPropagation(); if (m.replyToMessageId) scrollToMessage(m.replyToMessageId); }}
      >
        <span className={styles.replyQuoteName}>{m.replyPreview.senderNickname ?? ''}</span>
        <span className={styles.replyQuoteText}>
          {m.replyPreview.content ?? t('dm.photoMessage', { defaultValue: '사진' })}
        </span>
      </button>
    ) : null;

  // WebView 합성 레이어에서는 원본 행을 DOM 복제로 포털에 옮기면 행의 paint surface까지 따라와
  // 말풍선 주위가 사각형으로 밝아질 수 있다. 선택 상태는 데이터로 다시 그려 버블/이미지 실루엣만 올린다.
  const renderMessageActionSnapshot = () => {
    if (!actionMsg) return null;
    const isMine = actionMsg.senderId === myId;
    const snapshotReactions = actionMsg.reactions.length > 0 ? (
      <div className={styles.reactionRow}>
        {actionMsg.reactions.map((reaction) => (
          <span
            key={reaction.emoji}
            className={`${styles.reactionChip} ${reaction.reactedByMe ? styles.reactionChipMine : ''}`}
          >
            {reaction.emoji} {reaction.count}
          </span>
        ))}
      </div>
    ) : null;

    if (actionMsg.deletedAt) {
      return (
        <div className={`${styles.messageActionBubble} ${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
          <div className={styles.deletedText}>{t('dm.deletedMessage', { defaultValue: '삭제된 메시지입니다' })}</div>
        </div>
      );
    }

    if (actionMsg.messageType === 'sticker') {
      const sticker = findSticker(actionMsg.meta?.stickerId);
      return sticker ? (
        <div className={styles.messageActionSticker}>
          <AppImage src={sticker.uri} alt="" className={styles.stickerImg} priority />
        </div>
      ) : (
        <div className={`${styles.messageActionBubble} ${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
          <div className={styles.text}>[sticker]</div>
        </div>
      );
    }

    if (actionMsg.imageUrl && !actionMsg.content) {
      return (
        <div className={styles.messageActionImage}>
          <AppImage src={actionMsg.imageUrl} alt="" className={styles.msgImg} priority />
          {snapshotReactions}
        </div>
      );
    }

    return (
      <div className={`${styles.messageActionBubble} ${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
        {actionMsg.replyPreview && (
          <div className={styles.replyQuote}>
            <span className={styles.replyQuoteName}>{actionMsg.replyPreview.senderNickname ?? ''}</span>
            <span className={styles.replyQuoteText}>
              {actionMsg.replyPreview.content ?? t('dm.photoMessage', { defaultValue: '사진' })}
            </span>
          </div>
        )}
        {actionMsg.content && <div className={styles.text}>{actionMsg.content}</div>}
        {actionMsg.imageUrl && <AppImage src={actionMsg.imageUrl} alt="" className={styles.msgImg} priority />}
        {actionMsg.content && trOpen[actionMsg.id] && tr[actionMsg.id] && (
          <div className={styles.translated}>{tr[actionMsg.id]}</div>
        )}
        {snapshotReactions}
      </div>
    );
  };

  const actionPanelStyle: React.CSSProperties | undefined = actionAnchor && actionMsg
    ? (() => {
        const panelWidth = Math.min(312, window.innerWidth - 24);
        const panelHeight = actionPanelHeight || 300;
        const edge = 12;
        const gap = 8;
        const left = Math.max(12, Math.min(
          actionMsg.senderId === myId ? actionAnchor.right - panelWidth : actionAnchor.left,
          window.innerWidth - panelWidth - 12,
        ));
        const above = actionAnchor.top - gap - panelHeight;
        const below = actionAnchor.bottom + gap;
        if (above >= edge) return { left, top: above, width: panelWidth };
        if (below + panelHeight <= window.innerHeight - edge) return { left, top: below, width: panelWidth };

        // 두 방향 모두 전체 메뉴가 들어가지 않는 작은 viewport에서는 공간이 큰 쪽만
        // 메뉴에 할당한다. 메뉴 내부만 스크롤되어 선택 버블을 덮지 않는다.
        const aboveSpace = Math.max(0, actionAnchor.top - gap - edge);
        const belowSpace = Math.max(0, window.innerHeight - edge - below);
        if (aboveSpace >= belowSpace) {
          return { left, top: actionAnchor.top - gap - aboveSpace, width: panelWidth, maxHeight: aboveSpace };
        }
        return { left, top: below, width: panelWidth, maxHeight: belowSpace };
      })()
    : undefined;

  // ①: 진행상태 배너 — direct 방 + 세트에 예약중 항목이 있을 때만 노출(결제는 세트 귀속, 약속과 무관).
  const tradeBannerVisible = isDirect && hasReservedItem;
  const tradeBannerKey = !hasPaymentQrMessage
    ? 'dm.tradeBannerQrWaiting'
    : tradeBannerTx?.paymentStatus === 'PAYMENT_CONFIRMED'
      ? 'dm.tradeBannerConfirmed'
      : tradeBannerTx?.paymentStatus === 'PAYMENT_REPORTED'
        ? 'dm.tradeBannerReported'
        : 'dm.tradeBannerQrReady';

  return (
    <div className={styles.page}>
      <TopBar
        title={isDirect ? otherName : roomTitle}
        rightContent={
          <>
            {isDirect && otherUserId && (
              <button
                className={styles.headerMoreBtn}
                type="button"
                onClick={() => navigate(otherUserId === user?.id ? '/profile' : `/profile/${otherUserId}`)}
                aria-label={t('userProfile.openProfile')}
              >
                <CircleUserRound size={21} strokeWidth={2} />
              </button>
            )}
            {/* 게시판(init/218) — direct 방에는 게시판이 없다(서버도 400) */}
            {!isDirect && (
              <button
                className={styles.headerMoreBtn}
                type="button"
                onClick={() => navigate(`/dm/${conversationId}/board`)}
                aria-label={t('dm.board.title', { defaultValue: '게시판' })}
              >
                <LayoutList size={21} strokeWidth={2} />
                {/* 안 읽은 글이 있으면 점 하나 (init/220). 게시판에 다녀오면 방 재진입 시
                    conv 를 다시 받으므로(마운트 조회) 저절로 최신이 된다. */}
                {(conv?.boardUnread ?? 0) > 0 && (
                  <span
                    className={styles.headerDot}
                    role="status"
                    aria-label={t('dm.board.unread', {
                      n: conv?.boardUnread ?? 0,
                      defaultValue: '읽지 않은 글 {{n}}개',
                    })}
                  />
                )}
              </button>
            )}
            {/* 워키토키 헤더 아이콘 제거(260919 리뷰킷 F-S3-01 FR-1 / F-S3-03 FR-1) — 헤더는
                [뒤로][프로필][더보기] 셋으로. 무전기 진입은 약속 카드 [무전기] 버튼과 초대 카드
                [참여하기] 두 곳(ActiveSessionBar 가 고정 바로 대체)으로 좁힌다. */}
            <button
              className={styles.headerMoreBtn}
              type="button"
              onClick={() => setMoreSheetOpen(true)}
              aria-label={t('dm.more', { defaultValue: '더보기' })}
            >
              <MoreVertical size={22} strokeWidth={2} />
            </button>
          </>
        }
      />

      {conv?.communityGroupId && (
        <button
          type="button"
          className={styles.groupRoomLink}
          data-testid="dm-room-group-link"
          onClick={() => navigate(`/group/${conv.communityGroupId}`)}
        >
          {t('dm.groupOfficialChat', { name: roomTitle })}
        </button>
      )}

      {/* ① 거래 진행상태 배너 — direct 방 전용 */}
      {tradeBannerVisible && tradeSetId && (
        <div className={styles.tradeStatusBanner}>
          <button
            type="button"
            className={styles.tradeStatusMain}
            onClick={() => navigate(`/dm/${conversationId}/trade/${tradeSetId}`)}
            aria-label={t('dm.tradeBannerOpenAria')}
          >
            {t(tradeBannerKey)}
          </button>
          <button
            type="button"
            className={styles.tradeStatusGuideLink}
            onClick={() => navigate('/guide/safe-trade')}
          >
            {t('dm.tradeGuideLink')}
          </button>
        </div>
      )}

      {/* 그룹/오픈톡방 최소 정보 UI (§3.8) */}
      {!isDirect && (
        <div className={styles.roomInfoBar}>
          <span className={styles.roomInfoText}>
            {roomMemberCount != null
              ? t('dm.memberCount', { count: roomMemberCount, defaultValue: '멤버 {{count}}명' })
              : ''}
          </span>
        </div>
      )}

      {/* 방 공지(init/217) — group/open 전용. 접힘 상태는 1줄 미리보기, 펼치면 전문 + 등록자 */}
      {!isDirect && notice && (
        <div className={styles.noticeBanner}>
          <button
            type="button"
            className={styles.noticeHead}
            onClick={() => setNoticeExpanded((v) => !v)}
            aria-expanded={noticeExpanded}
            aria-label={t('dm.noticeBanner', { defaultValue: '공지' })}
          >
            <Megaphone size={15} className={styles.noticeIcon} />
            <span className={noticeExpanded ? styles.noticeTextFull : styles.noticeText}>
              {notice.content ?? ''}
            </span>
            <ChevronDown size={16} className={noticeExpanded ? styles.noticeChevronOpen : styles.noticeChevron} />
          </button>
          {noticeExpanded && (
            <div className={styles.noticeFoot}>
              <span className={styles.noticeMeta}>
                {t('dm.noticeSetBy', { name: notice.setByNickname ?? '', defaultValue: '{{name}} 등록' })}
                {notice.setAt ? ` · ${formatRelativeTime(notice.setAt)}` : ''}
              </span>
              {canClearNotice && (
                <button type="button" className={styles.noticeClearBtn} onClick={handleClearNotice}>
                  {t('dm.noticeClear', { defaultValue: '내리기' })}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 매물 컨텍스트 카드 — direct 전용, 세트가 아직 없을 때(첫 문의, 아무도 안 담음)만.
          담기가 한 번이라도 있으면 아래 TradeSetBar 가 이 역할을 대신한다. F-DM-02. */}
      {isDirect && !tradeSet && listing && (
        <div className={styles.contextCardRow}>
          <button
            className={styles.contextCard}
            type="button"
            onClick={() => navigate(`/market/${listing.id}`)}
          >
            <AppImage src={listing.thumbnailUrl ?? undefined} alt="" className={styles.contextThumb} />
            <div className={styles.contextInfo}>
              <span className={styles.contextTitle}>{listing.title}</span>
              <span className={styles.contextPrice}>{formatPriceVnd(listing.priceVnd, t)}</span>
            </div>
          </button>
          {/* 약속 잡기 칩(260919 리뷰킷 F-S4-01 FR-1) — 서비스 차별점의 입구를 "+" 메뉴 6항목
              동열에서 매물 카드 옆으로 승격. 기존 핸들러(handleOpenAppt) 재사용, "+" 메뉴 항목은 유지 */}
          {listing.status !== 'SOLD' && (
            <button className={styles.contextApptChip} type="button" onClick={handleOpenAppt}>
              {t('dm.makeAppointment', { defaultValue: '약속잡기' })}
            </button>
          )}
          {/* 세트 생성 진입점(260928 설계 §3.1) — 구매자가 첫 [+ 물품추가]를 눌러야 세트가 생긴다. */}
          {myId !== listing.sellerId && (
            <button className={styles.contextApptChip} type="button" onClick={() => setTradeSetPickerOpen(true)}>
              {t('dm.tradeSetAddItems', { defaultValue: '+ 물품추가' })}
            </button>
          )}
        </div>
      )}

      {/* F-DM-02 FR-1 — 거래 세트 바 + 단계별 칩 행(아코디언 대체, 260928 설계 §3.3). */}
      {isDirect && tradeSet && (
        <>
          <TradeSetBar
            tradeSet={tradeSet}
            isSeller={myId === tradeSet.sellerId}
            onOpenList={() => navigate(`/dm/${conversationId}/items`)}
            onStatusTap={() => setTradeSetStatusOpen(true)}
          />
          <TradeSetChips
            tradeSet={tradeSet}
            isSeller={myId === tradeSet.sellerId}
            myId={myId}
            appointment={activeAppointment}
            payment={tradeBannerTx ? {
              status: tradeBannerTx.paymentStatus,
              hasQr: !!tradeBannerTx.qrMessageId,
              inspected: !!tradeBannerTx.buyerInspectedAt,
            } : null}
            onAddOrEditItems={() => setTradeSetPickerOpen(true)}
            onMakeAppointment={handleOpenAppt}
            onOpenAppointment={() => setApptSheetOpen(true)}
            onShareLocation={() => {
              if (!activeAppointment) return;
              const hasCoords = activeAppointment.placeLat != null && activeAppointment.placeLng != null;
              startLiveLocation({
                appointmentId: activeAppointment.id,
                dest: hasCoords
                  ? {
                      lat: activeAppointment.placeLat!,
                      lng: activeAppointment.placeLng!,
                      ...(activeAppointment.placeName ? { name: activeAppointment.placeName } : {}),
                    }
                  : undefined,
                sendInvite: true,
              });
            }}
            onOpenTrade={() => navigate(`/dm/${conversationId}/trade/${tradeSet.id}`)}
            onInspectItem={handleInspectItem}
          />
        </>
      )}

      {/* 거래완료 시: 내 후기 있으면 표시, 없으면 후기 보내기 (REF-05) — direct 전용 */}
      {/* F-DM-02 FR-8 약속 고정 바 — 칩 행이 없는 direct 방(세트 없음)에서만. 세트가 있으면 칩 행 약속 슬롯이 이 역할. */}
      {isDirect && !tradeSet && activeAppointment && (
        <button className={styles.apptPinBar} type="button" onClick={() => setApptSheetOpen(true)}>
          <span className={styles.apptPinText}>
            {[
              `📅 ${formatApptBarWhen(activeAppointment.whenAt, i18n.language)}`,
              activeAppointment.placeName,
              activeAppointment.status === 'ACCEPTED'
                ? t('dm.apptBarConfirmed')
                : activeAppointment.proposerId === myId
                  ? t('dm.apptBarProposedMine')
                  : t('dm.apptBarProposedTheirs'),
            ].filter(Boolean).join(' · ')}
          </span>
          <ChevronRight size={16} className={styles.apptPinChevron} />
        </button>
      )}

      {isDirect && listing?.status === 'SOLD' && (
        myReview ? (
          <div className={styles.myReviewBanner}>
            <StarIcon size={13} /> {myReview.rating}.0 {t('dm.myReview', { defaultValue: '내 후기' })}
            {myReview.comment ? ` · ${myReview.comment}` : ''}
          </div>
        ) : !reviewed ? (
          <button className={styles.reviewBanner} type="button" onClick={() => setReviewOpen(true)}>
            <StarIcon size={13} /> {t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}
          </button>
        ) : null
      )}

      <div
        className={styles.messages}
        ref={listRef}
        onClick={() => composerRef.current?.close()}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (actionMsgId) closeMessageActions();
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
          // 최상단 근접 — 과거분(offset 페이지) 추가 적재
          if (el.scrollTop < 60 && !loading) void loadOlder();
        }}
      >
        {/* .messages(스크롤 뷰포트)와 별도로 이 콘텐츠 래퍼를 둔다 — 음성 버블 파형/이미지
            로드처럼 메시지 배열(messages/voiceItems) 변경 없이 내부 콘텐츠 높이만 늘어나는
            경우, listRef(뷰포트 자신의 박스)를 보는 ResizeObserver는 반응하지 않는다(뷰포트
            자신의 크기가 아니라 scrollHeight만 커지므로). contentRef 를 함께 관찰해 그 growth 도 잡는다. */}
        <div ref={contentRef} className={styles.messagesInner}>
        {loading ? (
          <p className={styles.loadingText}>{t('common.loading')}</p>
        ) : loadError ? (
          <div role="alert" aria-live="assertive">
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('dm.messagesLoadError', { defaultValue: 'Không tải được tin nhắn' })}
              actionLabel={t('common.retry')}
              onAction={loadMessages}
            />
          </div>
        ) : feed.length === 0 ? (
          <StateBlock icon={MailOpen} title={t('dm.emptyThread', { defaultValue: 'Chưa có tin nhắn nào. Hãy bắt đầu trò chuyện!' })} />
        ) : feed.map((row) => {
          if (row.kind === 'voice') {
            const v = row.item;
            return (
              <VoiceMessageBubble
                key={`wt:${v.id}`}
                audioUrl={v.audioUrl}
                durationMs={v.durationMs}
                isMine={v.senderRef === myId}
                timeLabel={formatRelativeTime(v.createdAt)}
                onFirstPlay={() => { walkieApi.markPlayed(v.id).catch(() => {}); }}
              />
            );
          }
          if (row.kind === 'pendingVoice') {
            const pending = row.item;
            return (
              <VoiceMessageBubble
                key={`wt:pending:${pending.id}`}
                audioUrl={null}
                durationMs={pending.durationMs}
                isMine={true}
                timeLabel={formatRelativeTime(pending.createdAt)}
                deliveryStatus={pending.status}
                onRetry={pending.status === 'failed' && pending.blob
                  ? () => { void retryPendingWalkieVoice(pending.id, pending.blob!, pending.durationMs); }
                  : undefined}
              />
            );
          }
          const m = row.item;
          const isMine = m.senderId === myId;
          const neighbors = bubbleNeighborsById.get(m.id);
          const prevMsg = neighbors?.previous ?? null;
          const nextMsg = neighbors?.next ?? null;
          if (m.messageType === 'payment_qr' && (m.meta?.tradeSetId || m.meta?.appointmentId)) {
            return (
              <CardMessage
                key={m.id}
                type="payment"
                isMine={isMine}
                header={
                  <div className={styles.apptHeader}>
                    <span className={styles.apptTitle}>
                      <CreditCard size={15} /> {t('dm.tradePaymentGuide')}
                    </span>
                  </div>
                }
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <p className={styles.apptNote}>{t('dm.tradeQrCardNotice')}</p>
                {!isMine && <p className={styles.apptNote}>{t('dm.tradeSafetyNotice')}</p>}
                <div className={styles.apptActions}>
                  <button className={styles.apptBtnPrimary} type="button"
                    onClick={() => navigate(`/dm/${conversationId}/trade/${m.meta!.tradeSetId ?? tradeSetId}`)}>
                    {t('dm.tradeOpen')}
                  </button>
                  {!isMine && (
                    <button className={styles.apptBtnGhost} type="button"
                      onClick={() => setReportOpen(true)}>
                      {t('dm.tradeSafetyReportLink')}
                    </button>
                  )}
                </div>
              </CardMessage>
            );
          }
          if (m.messageType === 'appointment') {
            const appt = m.appointment;
            const status = appt?.status;
            const iAmProposer = !!appt && appt.proposerId === myId;
            const whenRaw = appt?.whenAt ?? m.meta?.when ?? '';
            // 서버 저장값(UTC)을 뷰어 로컬 타임존으로 재변환해 표시 (DM-1)
            const whenDate = whenRaw ? new Date(whenRaw) : null;
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const dateText = whenDate
              ? `${whenDate.getFullYear()}.${pad2(whenDate.getMonth() + 1)}.${pad2(whenDate.getDate())}`
              : '';
            const timeText = whenDate ? `${pad2(whenDate.getHours())}:${pad2(whenDate.getMinutes())}` : '';
            const placeText = appt?.placeName ?? m.meta?.place ?? null;
            const statusLabel: Record<string, string> = {
              PROPOSED: t('dm.apptProposed', { defaultValue: '제안됨' }),
              ACCEPTED: t('dm.apptAccepted', { defaultValue: '확정' }),
              COMPLETED: t('dm.apptCompleted', { defaultValue: '거래완료' }),
              // F-X-01 FR-1(r8): 변경 제안이 대체한 이전 제안(SUPERSEDED)은 취소가 아니라 "변경됨".
              CANCELLED: appt?.cancelReason === 'SUPERSEDED'
                ? t('dm.apptSuperseded')
                : t('dm.apptCancelled', { defaultValue: '취소됨' }),
            };
            const navState = appt ? appointmentNavigation[appt.id] : undefined;
            const navView = appt ? apptNavView(appt) : null;
            const showNav = !!navView?.show;
            const canRetryNavigation = !!navView?.canRetry;
            const navInlineReason = navView?.reason ?? null;
            const canAccept = !!appt && status === 'PROPOSED' && !iAmProposer;
            // 약속 카드는 만남 전용(대표 판정 260929) — 결제·거래완료 액션은 칩 행/거래 화면 소관이라 여기서 판단하지 않는다.
            const canCancel = !!appt && (status === 'PROPOSED' || status === 'ACCEPTED');
            // S-16: 완료 요청 표시(상태 pill)만 남긴다 — 거절된 요청은 "요청 없음"으로 되돌린다.
            const completionPending = !!appt?.completionRequestedAt && !appt.completionDeclinedAt;
            const cancelLabel = appt ? apptCancelLabel(appt) : '';
            return (
              <CardMessage
                key={m.id}
                type="appointment"
                isMine={isMine}
                className={(status && styles[`appt_${status}`]) || ''}
                header={
                  <div className={styles.apptHeader}>
                    <span className={styles.apptTitle}>
                      <CalendarPlus size={15} /> {t('dm.appointment', { defaultValue: '약속' })}
                    </span>
                    {status && (
                      <span className={styles.apptStatusPill} data-status={status}>
                        {completionPending
                          ? t('dm.apptCompletionRequested', { defaultValue: '완료 요청됨' })
                          : statusLabel[status]}
                      </span>
                    )}
                  </div>
                }
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={styles.apptInfo}>
                  <div className={styles.apptRow}>
                    <span className={styles.apptRowLabel}>{t('dm.apptDate', { defaultValue: '날짜' })}</span>
                    <span className={styles.apptRowVal}>{dateText}</span>
                  </div>
                  <div className={styles.apptRow}>
                    <span className={styles.apptRowLabel}>{t('dm.apptTime', { defaultValue: '시간' })}</span>
                    <span className={styles.apptRowVal}>{timeText}</span>
                  </div>
                  {placeText && (
                    <div className={styles.apptRow}>
                      <span className={styles.apptRowLabel}>{t('dm.apptPlace', { defaultValue: '장소' })}</span>
                      <span className={styles.apptRowVal}>{placeText}</span>
                    </div>
                  )}
                  {appt?.placeLat != null && appt.placeLng != null && (
                    <ApptPlaceThumb
                      lat={appt.placeLat}
                      lng={appt.placeLng}
                      onClick={appt.id === activeAppointment?.id ? () => setApptSheetOpen(true) : undefined}
                    />
                  )}
                  {status === 'CANCELLED' && appt?.cancelReason && CANCEL_REASON_KEY[appt.cancelReason] && (
                    <div className={styles.apptRow}>
                      <span className={styles.apptRowVal}>
                        {t('dm.apptCancelReasonLine', { reason: t(CANCEL_REASON_KEY[appt.cancelReason]!) })}
                      </span>
                    </div>
                  )}
                </div>
                {/* 이 약속이 현재 활성 약속(currentAppointmentId)일 때만, 그리고 ACCEPTED 상태에서만
                    — 채널을 이 약속에 연결(목적지 초기값 = 약속 장소). SOLD/COMPLETED 이후엔 진행
                    도구를 남기지 않는다(260919 리뷰킷 F-S7-01 FR-2). 무전기 버튼은 위치공유와 같은
                    성격 묶음(F-S3-03 FR-5, F-S5-01 FR-1 ⓒ) — 헤더에서 제거한 진입을 여기로 옮긴다. */}
                {appt?.id === currentAppointmentId && status === 'ACCEPTED' && (
                  <div className={styles.apptLiveLocationRow}>
                    <button className={styles.apptBtnGhost} type="button"
                      onClick={() => startApptLiveLocation(appt)}>
                      <MapPin size={14} /> {t('dm.locationShare', { defaultValue: '위치공유' })}
                    </button>
                    <button className={styles.apptBtnGhost} type="button" onClick={handleWalkieJoin}>
                      <Radio size={14} /> {t('dm.moreMenuWalkieTalkie', { defaultValue: '워키토키' })}
                    </button>
                  </div>
                )}
                {canAccept && (
                  <div className={styles.apptPrimaryAction}>
                    <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                      onClick={() => handleAppointmentAction(acceptAppointment, appt.id)}>
                      {t('dm.apptAccept', { defaultValue: '약속 수락' })}
                    </button>
                  </div>
                )}
                {navInlineReason && <p className={styles.apptNavigationNote} role="status">{navInlineReason}</p>}
                {canRetryNavigation && (
                  <button className={styles.apptNavigationRetry} type="button"
                    onClick={() => retryAppointmentNavigation(appt!.id)}>
                    {t('dm.apptNavigationRetry', { defaultValue: '정확한 장소 다시 확인' })}
                  </button>
                )}
                {(showNav || canCancel) && (
                  <div className={styles.apptSecondaryActions}>
                    {showNav && (
                      <button className={styles.apptBtnGhost} type="button"
                        aria-disabled={!routeAvailable}
                        onClick={() => handleNavigate(navState!.destination!)}>
                        {t('dm.navigate', { defaultValue: '길안내' })}
                      </button>
                    )}
                    {canCancel && (
                      <button className={`${styles.apptBtnGhost} ${styles.apptBtnDanger}`} type="button" disabled={sending}
                        onClick={() => requestCancelAppointment(appt)}>
                        {cancelLabel}
                      </button>
                    )}
                  </div>
                )}
              </CardMessage>
            );
          }
          // 임베드가 없으면(위조/삭제된 제안) 일반 버블로 폴백 — content에 요약 텍스트가 있다
          if (m.messageType === 'price_offer' && m.priceOffer) {
            const offer = m.priceOffer;
            const status = offer.status;
            const iAmProposer = offer.proposerId === myId;
            const statusLabel: Record<string, string> = {
              PROPOSED: t('dm.offerProposed', { defaultValue: '제안됨' }),
              ACCEPTED: t('dm.offerAccepted', { defaultValue: '수락됨' }),
              DECLINED: t('dm.offerDeclined', { defaultValue: '거절됨' }),
              CANCELLED: t('dm.offerCancelled', { defaultValue: '취소됨' }),
            };
            return (
              <CardMessage
                key={m.id}
                type="price_offer"
                isMine={isMine}
                className={styles[`appt_${status}`] || ''}
                header={
                  <div className={styles.apptHeader}>
                    <span className={styles.apptTitle}>
                      <HandCoins size={15} /> {t('dm.priceOffer', { defaultValue: '가격제안' })}
                    </span>
                    <span className={styles.apptStatusPill} data-status={status}>{statusLabel[status]}</span>
                  </div>
                }
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={styles.offerBody}>
                  <div className={styles.offerAmount}>{formatPriceVnd(offer.amount, t)}</div>
                  {listing && offer.amount !== listing.priceVnd && (
                    <div className={styles.offerCompare}>
                      {t('dm.offerListedPrice', { defaultValue: '판매가' })} {formatPriceVnd(listing.priceVnd, t)}
                    </div>
                  )}
                </div>
                {status === 'PROPOSED' && (
                  <div className={styles.apptActions}>
                    {!iAmProposer && (
                      <>
                        <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                          onClick={() => handlePriceOfferAction(acceptPriceOffer, offer.id)}>
                          {t('dm.offerAccept', { defaultValue: '수락' })}
                        </button>
                        <button className={styles.apptBtnGhost} type="button" disabled={sending}
                          onClick={() => handlePriceOfferAction(declinePriceOffer, offer.id)}>
                          {t('dm.offerDecline', { defaultValue: '거절' })}
                        </button>
                      </>
                    )}
                    {iAmProposer && (
                      <button className={styles.apptBtnGhost} type="button" disabled={sending}
                        onClick={() => handlePriceOfferAction(cancelPriceOffer, offer.id)}>
                        {t('dm.offerCancel', { defaultValue: '제안 취소' })}
                      </button>
                    )}
                  </div>
                )}
              </CardMessage>
            );
          }
          // 소프트 삭제 — 콘텐츠 대신 플레이스홀더 (서버도 content/image 를 내리지 않는다)
          if (m.deletedAt) {
            return (
              <Fragment key={m.id}>
                {renderDateSeparator(m)}
                {renderSender(m, prevMsg)}
                <div className={`${styles.messageRow} ${isMine ? styles.messageRowMine : styles.messageRowTheirs}`}>
                  {renderDirectAvatar(m, prevMsg)}
                  <div className={styles.messageLine}>
                    {isMine && renderMessageMeta(m, isMine, nextMsg)}
                    <div data-mid={m.id} className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`} {...pressHandlers(m)}>
                      <div className={styles.deletedText}>{t('dm.deletedMessage', { defaultValue: '삭제된 메시지입니다' })}</div>
                    </div>
                    {!isMine && renderMessageMeta(m, isMine, nextMsg)}
                  </div>
                </div>
              </Fragment>
            );
          }
          if (m.messageType === 'sticker') {
            const st = findSticker(m.meta?.stickerId);
            return (
              <Fragment key={m.id}>
              {renderDateSeparator(m)}
              {renderSender(m, prevMsg)}
              <div className={`${styles.messageRow} ${isMine ? styles.messageRowMine : styles.messageRowTheirs}`}>
                {renderDirectAvatar(m, prevMsg)}
                <div className={styles.messageLine}>
                  {isMine && renderMessageMeta(m, isMine, nextMsg)}
                  <div
                    data-mid={m.id}
                    className={`${styles.stickerMsg} ${isMine ? styles.stickerMine : styles.stickerTheirs}`}
                    {...pressHandlers(m)}
                  >
                    {st ? (
                      <img
                        src={st.uri}
                        alt=""
                        className={styles.stickerImg}
                        // 스티커가 정착 윈도우(2초) 이후에 로드돼도 바닥 고정 중이면 재스크롤 (사진 메시지와 동일 패턴)
                        onLoad={() => {
                          if (pinnedRef.current) listRef.current?.scrollTo(0, listRef.current.scrollHeight);
                        }}
                      />
                    ) : (
                      <div className={styles.text}>[sticker]</div>
                    )}
                  </div>
                  {!isMine && renderMessageMeta(m, isMine, nextMsg)}
                </div>
              </div>
              </Fragment>
            );
          }
          if (m.messageType === 'voice') {
            // 워키토키 개편(202608, 대표 피드백 "워키토키 같지 않다") — 음성메시지는 더 이상 채팅
            // 버블로 쌓이지 않는다. 워키토키 플로팅 버튼에서만 수신·재생된다(물리 워키토키처럼).
            // message_type='voice' 는 현재 워키토키 플로우에서만 생성된다 — 이 필터가 안전한 이유다.
            // 향후 일반 DM 음성메시지 기능을 추가한다면 이 필터를 반드시 재검토할 것.
            return null;
          }
          if (m.messageType === 'system') {
            switch (m.meta?.kind) {
              case 'listing_divider':
                // init/214 로 매물별 방을 하나로 합칠 때 삽입된 경계 표식 — 어느 매물 문의였는지 구분
                return (
                  <div key={m.id} className={styles.systemDivider}>
                    <span className={styles.systemDividerText}>
                      {t('dm.listingDivider', {
                        title: m.meta?.listingTitle ?? '',
                        defaultValue: '매물 문의: {{title}}',
                      })}
                    </span>
                  </div>
                );
              case 'notice_set':
                // init/217 공지 등록 알림 카드
                return (
                  <div key={m.id} className={styles.systemDivider}>
                    <span className={styles.systemDividerText}>
                      📢 {t('dm.noticeSetCard', { defaultValue: '공지가 등록되었습니다' })}
                      {m.meta?.setByName ? ` · ${m.meta.setByName}` : ''}
                    </span>
                  </div>
                );
              default:
                // 알 수 없는 system kind — 빈 말풍선으로 새지 않게 막는다(구버전 앱 안전판)
                return null;
            }
          }
          // F-DM-02(260928) — 거래 세트(trade_sets) 시스템 알림. content 는 저장하지 않고 meta.kind +
          // 파라미터만 내려와(DM-5) i18n 문구로 렌더한다. 이전엔 이 분기가 없어 빈 말풍선으로 보였다.
          if (m.messageType === 'text' && !m.content && m.meta?.kind) {
            switch (m.meta.kind) {
              case 'reserve_prompt': {
                // 판매자에게만 "예약중으로 변경할까요?" 를 묻는다 — 구매자에겐 카드가 없다(F-DM-02 FR-1 r6).
                if (!isMine || dismissedPromptIds.has(m.id)) return null;
                return (
                  <CardMessage
                    key={m.id}
                    type="prompt"
                    isMine={isMine}
                    timeLabel={formatRelativeTime(m.createdAt)}
                  >
                    <div className={cardStyles.cardTitle}>
                      {t('dm.tradeSetReservePrompt', { nickname: m.meta?.counterpartNickname ?? '' })}
                    </div>
                    <div className={styles.apptActions}>
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleReservePromptChange(m.id)}>
                        {t('dm.cardChange', { defaultValue: '변경' })}
                      </button>
                      <button className={styles.apptBtnGhost} type="button"
                        onClick={() => setDismissedPromptIds((prev) => new Set(prev).add(m.id))}>
                        {t('dm.cardLater', { defaultValue: '나중에' })}
                      </button>
                    </div>
                  </CardMessage>
                );
              }
              case 'revert_prompt': {
                // F-X-01 FR-1(r8) / F-N-02 FR-7 ⑥: 취소된 약속이 ACCEPTED 였을 때 판매자에게만 묻는다.
                // [유지]·무시는 예약 유지, [되돌리기]는 상태 시트 [판매중]과 같은 호출이다.
                if (!isMine || dismissedPromptIds.has(m.id)) return null;
                return (
                  <CardMessage
                    key={m.id}
                    type="prompt"
                    isMine={isMine}
                    timeLabel={formatRelativeTime(m.createdAt)}
                  >
                    <div className={cardStyles.cardTitle}>{t('dm.revertPrompt')}</div>
                    <div className={styles.apptActions}>
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleRevertPromptRevert(m.id)}>
                        {t('dm.revertPromptRevert')}
                      </button>
                      <button className={styles.apptBtnGhost} type="button"
                        onClick={() => setDismissedPromptIds((prev) => new Set(prev).add(m.id))}>
                        {t('dm.revertPromptKeep')}
                      </button>
                    </div>
                  </CardMessage>
                );
              }
              case 'trade_set_item_removed_competing':
                return (
                  <div key={m.id} className={styles.systemDivider}>
                    <span className={styles.systemDividerText}>
                      {t('dm.tradeSetItemRemovedCompeting', { listingTitle: m.meta?.listingTitle ?? '' })}
                    </span>
                  </div>
                );
              case 'trade_set_item_added_by_seller':
                return (
                  <div key={m.id} className={styles.systemDivider}>
                    <span className={styles.systemDividerText}>
                      {t('dm.tradeSetItemAddedBySeller', { titles: (m.meta?.titles ?? []).join(', ') })}
                    </span>
                  </div>
                );
              case 'trade_set_item_reservation_cancelled':
                return (
                  <div key={m.id} className={styles.systemDivider}>
                    <span className={styles.systemDividerText}>
                      {t('dm.tradeSetItemReservationCancelled', { listingTitle: m.meta?.listingTitle ?? '' })}
                    </span>
                  </div>
                );
              case 'trade_set_item_removed':
                return (
                  <div key={m.id} className={styles.systemDivider}>
                    <span className={styles.systemDividerText}>
                      {t('dm.tradeSetItemRemoved', {
                        listingTitle: m.meta?.listingTitle ?? '',
                        totalVnd: typeof m.meta?.totalVnd === 'number' ? m.meta.totalVnd.toLocaleString('vi-VN') : '',
                      })}
                    </span>
                  </div>
                );
              default:
                return null;
            }
          }
          if (m.messageType === 'card' && m.meta?.subtype === 'item') {
            // F-DM-02(260928) — [카드 보내기]. 렌더만 하는 스냅샷(title/priceVnd/thumbnailUrl) — 서버가 전송 시점에 채운다.
            return (
              <CardMessage
                key={m.id}
                type="item"
                isMine={isMine}
                headerLabel={t('dm.cardItemLabel', { defaultValue: '매물' })}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                {typeof m.meta?.priceVnd === 'number' && (
                  <div className={cardStyles.cardSubtitle}>{formatPriceVnd(m.meta.priceVnd, t)}</div>
                )}
                <div className={cardStyles.cardTitle}>{m.meta?.title ?? ''}</div>
                <div className={cardStyles.cardDivider} />
                <div className={cardStyles.cardBody}>
                  <AppImage src={m.meta?.thumbnailUrl ?? undefined} alt="" className={styles.contextThumb} />
                </div>
                <div className={cardStyles.cardButtonSlot}>
                  <button
                    type="button"
                    className={styles.walkieInviteJoinBtn}
                    onClick={() => { if (m.meta?.listingId) navigate(`/market/${m.meta.listingId}`); }}
                  >
                    {t('dm.cardItemButton', { defaultValue: '매물 정보' })}
                  </button>
                </div>
              </CardMessage>
            );
          }
          if (m.messageType === 'card' && m.meta?.subtype === 'appointment_accepted') {
            // F-DM-02 FR-8(r9) — 약속 확정 상태 변화 카드. 수락 시점 서버 스냅샷(whenAt/placeName)만 렌더하고 탭 = 약속 시트.
            const when = m.meta?.whenAt ? new Date(m.meta.whenAt) : null;
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const whenText = when
              ? `${when.getFullYear()}.${pad2(when.getMonth() + 1)}.${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())}`
              : '';
            return (
              <CardMessage
                key={m.id}
                type="appointment"
                isMine={isMine}
                headerLabel={t('dm.apptBarConfirmed')}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => setApptSheetOpen(true)}>
                  <div className={cardStyles.cardTitle}>{t('dm.apptAcceptedCardTitle')}</div>
                  <div className={cardStyles.cardBody}>{[whenText, m.meta?.placeName].filter(Boolean).join(' · ')}</div>
                  {m.meta?.placeLat != null && m.meta.placeLng != null && (
                    <ApptPlaceThumb lat={m.meta.placeLat} lng={m.meta.placeLng} />
                  )}
                </button>
              </CardMessage>
            );
          }
          if (m.messageType === 'card' && m.meta?.subtype === 'appointment_cancelled') {
            // F-X-01 FR-1(r8) — 약속 취소 카드. 취소 시점 서버 스냅샷(kind/actorId/whenAt/placeName/reason)만 렌더한다.
            const kind = m.meta?.kind ?? 'CANCELLED';
            const byMe = m.meta?.actorId === myId;
            const titleKey = `dm.apptCancel${kind === 'WITHDRAWN' ? 'Withdrawn' : kind === 'DECLINED' ? 'Declined' : 'Cancelled'}${byMe ? 'Mine' : 'Theirs'}`;
            const when = m.meta?.whenAt ? new Date(m.meta.whenAt) : null;
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const whenText = when
              ? `${when.getFullYear()}.${pad2(when.getMonth() + 1)}.${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())}`
              : '';
            const reasonKey = m.meta?.reason ? CANCEL_REASON_KEY[m.meta.reason] : undefined;
            return (
              <CardMessage
                key={m.id}
                type="appointment"
                isMine={isMine}
                headerLabel={t('dm.apptCancelCardLabel')}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={cardStyles.cardTitle}>{t(titleKey, { nickname: otherName })}</div>
                <div className={cardStyles.cardBody} style={{ textDecoration: 'line-through' }}>
                  {[whenText, m.meta?.placeName].filter(Boolean).join(' · ')}
                </div>
                {m.meta?.placeLat != null && m.meta.placeLng != null && (
                  <div style={{ opacity: 0.5 }}>
                    <ApptPlaceThumb lat={m.meta.placeLat} lng={m.meta.placeLng} />
                  </div>
                )}
                {reasonKey && (
                  <div className={cardStyles.cardSubtitle}>{t('dm.apptCancelReasonLine', { reason: t(reasonKey) })}</div>
                )}
                {isDirect && !messagingDisabled && (
                  <div className={cardStyles.cardButtonSlot}>
                    <button type="button" className={styles.walkieInviteJoinBtn} onClick={handleOpenAppt}>
                      {t('dm.apptRebook')}
                    </button>
                  </div>
                )}
              </CardMessage>
            );
          }
          if (m.messageType === 'card' && m.meta?.subtype === 'bundle') {
            // F-DM-02(260928 실기기 피드백) — 구매자가 세트에 여러 매물을 담으면 남는 묶음 요청 카드(readonly 스냅샷).
            // [자세히 보기]는 개별 매물이 아니라 세트 목록 페이지로 보낸다(어느 매물을 볼지 카드가 정할 수 없다).
            const titles: string[] = m.meta?.titles ?? [];
            const totalVnd = typeof m.meta?.totalVnd === 'number' ? m.meta.totalVnd : null;
            return (
              <CardMessage
                key={m.id}
                type="bundle"
                isMine={isMine}
                headerLabel={t('dm.tradeSetBundleTitle')}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={cardStyles.cardSubtitle}>{t('dm.tradeSetBundleSubtitle')}</div>
                <ul className={styles.bundleItemList}>
                  {titles.map((title, i) => <li key={i}>{`- ${title}`}</li>)}
                </ul>
                {totalVnd != null && <div className={cardStyles.cardTitle}>{formatPriceVnd(totalVnd, t)}</div>}
                <div className={cardStyles.cardButtonSlot}>
                  <button
                    type="button"
                    className={styles.walkieInviteJoinBtn}
                    onClick={() => navigate(`/dm/${conversationId}/items`)}
                  >
                    {t('dm.cardViewDetails', { defaultValue: '자세히 보기' })}
                  </button>
                </div>
              </CardMessage>
            );
          }
          if (m.messageType === 'walkie_invite') {
            const joined = walkieActiveConversationId === conversationId;
            return (
              <CardMessage
                key={m.id}
                type="walkie_invite"
                isMine={isMine}
                headerLabel={t('dm.cardWalkieLabel', { defaultValue: '워키토키' })}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={cardStyles.cardTitle}>
                  {t('walkieTalkie.inviteCardText', { name: m.meta?.invitedByName ?? '', defaultValue: '{{name}}님이 워키토키 채널을 열었어요' })}
                </div>
                <div className={cardStyles.cardButtonSlot}>
                  {joined ? (
                    <span className={styles.walkieInviteJoined}>{t('walkieTalkie.inviteJoined', { defaultValue: '참여 중' })}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.walkieInviteJoinBtn}
                      onClick={() => { if (conversationId) setActiveWalkieConversation(conversationId, { name: isDirect ? otherName : roomTitle, isGroup: !isDirect }); }}
                    >
                      {t('walkieTalkie.inviteJoinBtn', { defaultValue: '참여하기' })}
                    </button>
                  )}
                </div>
              </CardMessage>
            );
          }
          if (m.messageType === 'location_pin') {
            // 현재위치 카드 — 정적 1회성 좌표. 목록에 여러 장 쌓일 수 있어 **버블마다 지도를
            // 띄우지 않는다**(MapLibre 인스턴스 = WebGL 컨텍스트, 브라우저가 개수를 제한한다).
            // 지도는 탭했을 때 시트 하나로만 연다.
            const pinLat = m.meta?.placeLat ?? null;
            const pinLng = m.meta?.placeLng ?? null;
            if (pinLat == null || pinLng == null) return null;
            return (
              <CardMessage
                key={m.id}
                type="location_pin"
                isMine={isMine}
                headerLabel={t('dm.cardLocationLabel', { defaultValue: '현재위치' })}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={cardStyles.cardTitle}>
                  {isMine
                    ? t('dm.locationPinMine', { defaultValue: '내 현재 위치를 보냈어요' })
                    : t('dm.locationPinTheirs', { defaultValue: '현재 위치를 보냈어요' })}
                </div>
                <div className={cardStyles.cardButtonSlot}>
                  <button
                    type="button"
                    className={styles.walkieInviteJoinBtn}
                    onClick={() => setPinPreview({ lat: pinLat, lng: pinLng })}
                  >
                    {t('dm.locationPinView', { defaultValue: '지도에서 보기' })}
                  </button>
                </div>
              </CardMessage>
            );
          }
          if (m.messageType === 'location_share_invite') {
            // 워키토키 초대카드와 같은 골격(CardMessage) 재사용. "참여하기" → 동의 → 채널 참가(2026-08-29 채널 모델).
            const liveJoined = liveChannelConversationId === conversationId;
            return (
              <CardMessage
                key={m.id}
                type="location_share_invite"
                isMine={isMine}
                headerLabel={t('dm.cardLocationShareLabel', { defaultValue: '위치공유' })}
                timeLabel={formatRelativeTime(m.createdAt)}
              >
                <div className={cardStyles.cardTitle}>
                  {t('locationShare.inviteCardText', { name: m.meta?.invitedByName ?? '', defaultValue: '{{name}}님이 위치공유를 시작했어요' })}
                </div>
                <div className={cardStyles.cardButtonSlot}>
                  {liveJoined ? (
                    <span className={styles.walkieInviteJoined}>{t('liveLocation.inviteJoined', { defaultValue: '참여 중' })}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.walkieInviteJoinBtn}
                      onClick={() => startLiveLocation({ sendInvite: false })}
                    >
                      {t('liveLocation.inviteJoinBtn', { defaultValue: '참여하기' })}
                    </button>
                  )}
                </div>
              </CardMessage>
            );
          }
          // 이미지 첨부(캡션 없음) 메시지 — 버블 배경/패딩 없이 이미지만 (스티커와 동일 패턴)
          if (m.imageUrl && !m.content) {
            return (
              <Fragment key={m.id}>
              {renderDateSeparator(m)}
              {renderSender(m, prevMsg)}
              <div className={`${styles.messageRow} ${isMine ? styles.messageRowMine : styles.messageRowTheirs}`}>
                {renderDirectAvatar(m, prevMsg)}
                <div className={styles.messageLine}>
                  {isMine && renderMessageMeta(m, isMine, nextMsg)}
                  <div
                    data-mid={m.id}
                    className={`${styles.imageMsg} ${isMine ? styles.imageMine : styles.imageTheirs}`}
                    {...pressHandlers(m)}
                  >
                    {renderReplyQuote(m)}
                    <AppImage
                      src={m.imageUrl}
                      alt=""
                      className={styles.msgImg}
                      /* 이미지 비동기 로드로 높이가 늦게 생겨 오토스크롤이 언더슛 — 바닥 고정 중이면 재스크롤 (스티커와 동일 가드) */
                      onLoad={() => {
                        if (pinnedRef.current) listRef.current?.scrollTo(0, listRef.current.scrollHeight);
                      }}
                    />
                    {renderReactions(m)}
                  </div>
                  {!isMine && renderMessageMeta(m, isMine, nextMsg)}
                </div>
              </div>
              </Fragment>
            );
          }
          return (
            <Fragment key={m.id}>
            {renderDateSeparator(m)}
            {renderSender(m, prevMsg)}
            <div className={`${styles.messageRow} ${isMine ? styles.messageRowMine : styles.messageRowTheirs}`}>
            {renderDirectAvatar(m, prevMsg)}
            <div className={styles.messageLine}>
            {isMine && renderMessageMeta(m, isMine, nextMsg)}
            <div data-mid={m.id} className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`} {...pressHandlers(m)}>
              {renderReplyQuote(m)}
              {editingId === m.id ? (
                <div className={styles.editBox}>
                  <textarea
                    className={styles.editInput}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div className={styles.editActions}>
                    <button type="button" className={styles.editCancel} onClick={() => setEditingId(null)}>
                      {t('common.cancel', { defaultValue: '취소' })}
                    </button>
                    <button type="button" className={styles.editSave} onClick={handleSaveEdit} disabled={!editText.trim()}>
                      {t('common.save', { defaultValue: '저장' })}
                    </button>
                  </div>
                </div>
              ) : (
                m.content && <div className={styles.text}>{m.content}</div>
              )}
              {m.imageUrl && (
                <AppImage
                  src={m.imageUrl}
                  alt=""
                  className={styles.msgImg}
                  /* 이미지 비동기 로드로 높이가 늦게 생겨 오토스크롤이 언더슛 — 바닥 고정 중이면 재스크롤 (스티커와 동일 가드) */
                  onLoad={() => {
                    if (pinnedRef.current) listRef.current?.scrollTo(0, listRef.current.scrollHeight);
                  }}
                />
              )}
              {m.content && trOpen[m.id] && tr[m.id] && (
                <div className={styles.translated}>{tr[m.id]}</div>
              )}
              {m.content && !isMine && (
                <button className={styles.translateBtn} type="button" onClick={() => handleTranslateMsg(m.id, m.content!)}>
                  {trOpen[m.id]
                    ? t('dm.hideTranslation', { defaultValue: '번역 숨기기' })
                    : t('dm.translate', { defaultValue: '번역' })}
                </button>
              )}
              {renderReactions(m)}
            </div>
            {!isMine && renderMessageMeta(m, isMine, nextMsg)}
            </div>
            </div>
            </Fragment>
          );
        })}
        </div>
      </div>

      {/* 답장 작성 중 인용 프리뷰 바 — 입력창 바로 위 */}
      {replyTo && (
        <div className={styles.replyBar}>
          <div className={styles.replyBarBody}>
            <span className={styles.replyQuoteName}>
              {t('dm.replyingTo', {
                name: replyTo.senderId === myId ? user?.nickname ?? '' : isDirect ? otherName : memberNames[replyTo.senderId] ?? '',
                defaultValue: '{{name}}에게 답장',
              })}
            </span>
            <span className={styles.replyBarSnippet}>
              {replyTo.content ?? t('dm.photoMessage', { defaultValue: '사진' })}
            </span>
          </div>
          <button
            type="button"
            className={styles.replyBarClose}
            onClick={() => setReplyTo(null)}
            aria-label={t('common.cancel', { defaultValue: '취소' })}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 채팅방 안 "진행 중 바" (F-N-01 FR-2, 대표 판정 2026-09-24) — 이 방의 세션일 때만
          입력창 바로 위 in-flow 로 뜬다. 다른 화면·다른 방에는 뜨지 않는다. */}
      {conversationId && !messagingDisabled && <ActiveSessionBar conversationId={conversationId} />}

      {messagingDisabled ? (
        <div className={styles.blockedComposer} role="status">
          {conv?.blockedByMe
            ? t('dm.blockedByMe', { defaultValue: '차단한 사용자예요 · 메시지를 보낼 수 없어요' })
            : t('dm.messagingDisabled', { defaultValue: '메시지를 보낼 수 없어요' })}
        </div>
      ) : <MessageComposer
        ref={composerRef}
        onSend={handleSend}
        placeholder={t('dm.inputPlaceholder')}
        // 초기 로드가 끝나기 전(loading/loadError)에는 전송을 잠근다 — 대화 상태를 모르는 채로 보낼 수 없게 (P1-6)
        sending={sending || loading || loadError}
        sendAriaLabel={t('dm.sendBtn')}
        menuAriaLabel={t('dm.more', { defaultValue: '더보기' })}
        menuItems={[
          {
            key: 'album',
            icon: <ImagePlus size={26} strokeWidth={1.8} />,
            label: t('dm.album', { defaultValue: '앨범' }),
            onPress: () => fileInputRef.current?.click(),
          },
          // 약속잡기 — 1:1 방 전용(매물 방이 아니어도 단순 만남 약속 가능). 약속은 거래 상태와 독립이라 양측 언제나 제안 가능(F-N-02 FR-7)
          ...(isDirect
            ? [{
                key: 'appt',
                icon: <CalendarPlus size={26} strokeWidth={1.8} />,
                label: t('dm.makeAppointment', { defaultValue: '약속잡기' }),
                onPress: handleOpenAppt,
              }]
            : []),
          // 현재위치 — 실시간 공유와 별개. "지금 여기 있어요" 한 장을 카드로 보낸다(1:1·그룹 공통).
          {
            key: 'locationPin',
            icon: <LocateFixed size={26} strokeWidth={1.8} />,
            label: t('dm.sendCurrentLocation', { defaultValue: '현재위치' }),
            onPress: handleSendCurrentLocation,
          },
          // 실시간 위치공유 채널(2026-08-29) — 헤더 "..." 메뉴의 '위치 공유하기'와 동일 플로우. 1:1·그룹 모두(D2), 약속과 독립.
          {
            key: 'location',
            icon: <MapPin size={26} strokeWidth={1.8} />,
            label: t('dm.locationShare', { defaultValue: '실시간위치' }),
            onPress: () => startLiveLocation({ sendInvite: true }),
          },
          // 워키토키 채널도 위치공유처럼 약속과 무관하게 이 대화의 참여자에게 열고 초대한다(1:1·그룹 공통).
          {
            key: 'walkieTalkie',
            icon: <Radio size={26} strokeWidth={1.8} />,
            label: t('dm.moreMenuWalkieTalkie', { defaultValue: '워키토키' }),
            onPress: handleWalkieJoin,
          },
          // 가격제안 — direct 전용. 매물 대화 + 가격제안 허용 + 판매 종결 전 + 판매자 본인 아님 (백엔드도 403/409로 차단)
          ...(isDirect && listing?.isNegotiable && listing.status !== 'SOLD' && listing.sellerId !== myId
            ? [{
                key: 'offer',
                icon: <HandCoins size={26} strokeWidth={1.8} />,
                label: t('dm.priceOffer', { defaultValue: '가격제안' }),
                onPress: () => setOfferOpen(true),
              }]
            : []),
          {
            key: 'emoticon',
            icon: <Smile size={26} strokeWidth={1.8} />,
            label: t('dm.emoticon', { defaultValue: '이모티콘' }),
            renderPanel: () => (
              <div className={styles.stickerGrid}>
                {MOCK_STICKERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.stickerBtn}
                    onClick={() => handleSendSticker(s.id)}
                  >
                    <img src={s.uri} alt="" className={styles.stickerThumb} />
                  </button>
                ))}
              </div>
            ),
          },
        ]}
      />}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleImageSelect}
      />

      {/* 약속 시트(F-DM-02 FR-8) — 카드와 같은 핸들러. 내 행동은 시트를 먼저 닫는다. */}
      <AppointmentSheet
        open={apptSheetOpen}
        onClose={() => setApptSheetOpen(false)}
        appointment={activeAppointment}
        myId={myId}
        counterpartName={otherName}
        busy={sending}
        cancelLabel={activeAppointment ? apptCancelLabel(activeAppointment) : ''}
        nav={activeAppointment ? apptNavView(activeAppointment) : { show: false, canRetry: false, reason: null, locked: false }}
        onAccept={() => {
          if (!activeAppointment) return;
          setApptSheetOpen(false);
          handleAppointmentAction(acceptAppointment, activeAppointment.id);
        }}
        onCancel={() => {
          if (!activeAppointment) return;
          setApptSheetOpen(false);
          requestCancelAppointment(activeAppointment);
        }}
        onNavigate={() => {
          const destination = activeAppointment ? appointmentNavigation[activeAppointment.id]?.destination : undefined;
          if (destination) handleNavigate(destination);
        }}
        onRetryNav={() => { if (activeAppointment) retryAppointmentNavigation(activeAppointment.id); }}
        onShareLocation={() => {
          if (!activeAppointment) return;
          setApptSheetOpen(false);
          startApptLiveLocation(activeAppointment);
        }}
        onWalkie={() => {
          setApptSheetOpen(false);
          void handleWalkieJoin();
        }}
        onViewInChat={apptCardMessageId ? () => {
          setApptSheetOpen(false);
          scrollToMessage(apptCardMessageId);
        } : undefined}
      />

      {/* 약속잡기 시트 */}
      <BottomSheet open={apptOpen} onClose={() => setApptOpen(false)}>
        <div className={styles.apptSheet}>
          <h2 className={styles.apptSheetTitle}>{t('dm.makeAppointment', { defaultValue: '약속잡기' })}</h2>
          <label className={styles.apptLabel}>{t('dm.apptWhen', { defaultValue: '일시' })}</label>
          <input
            type="datetime-local"
            className={styles.apptInput}
            value={apptWhen}
            onChange={(e) => setApptWhen(e.target.value)}
          />
          <label className={styles.apptLabel}>{t('dm.apptPlace', { defaultValue: '장소' })}</label>
          <ApptPlacePicker
            initial={apptPlace ?? (listing?.lat != null && listing.lng != null ? { lat: listing.lat, lng: listing.lng } : null)}
            onChange={setApptPlace}
            detail={apptDetail}
            onDetailChange={setApptDetail}
          />
          <div className={styles.apptSubmit}>
            <Button onClick={handleSendAppointment} disabled={!apptWhen || !apptPlace}>
              {t('dm.apptSend', { defaultValue: '약속 제안 보내기' })}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* 가격제안 시트 — direct 전용 */}
      {isDirect && listing && (
        <PriceOfferSheet
          open={offerOpen}
          onClose={() => setOfferOpen(false)}
          listingTitle={listing.title}
          listingThumbnailUrl={listing.thumbnailUrl}
          listingPriceVnd={listing.priceVnd}
          onSubmit={handleSendPriceOffer}
          submitting={sending}
        />
      )}

      {/* 거래 후기 시트 — direct 전용 */}
      {isDirect && (
        <ReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          targetId={conv?.otherUserId ?? ''}
          listingId={conv?.contextId ?? undefined}
          onSubmitted={handleReviewSubmitted}
        />
      )}

      {/* F-DM-02 FR-5/FR-6 — 물품 선택·편집 피커. 세트가 아직 없으면(첫 담기) sellerId 는 방 컨텍스트 매물에서 얻는다. */}
      {isDirect && conversationId && pickerSellerId && (
        <TradeSetPicker
          open={tradeSetPickerOpen}
          onClose={() => setTradeSetPickerOpen(false)}
          conversationId={conversationId}
          sellerId={pickerSellerId}
          sellerNickname={myId === pickerSellerId ? user?.nickname ?? '' : otherName}
          isSellerMe={myId === pickerSellerId}
          tradeSet={tradeSet}
          contextListingId={listing?.id ?? conv?.contextId ?? null}
          onSaved={setTradeSet}
        />
      )}

      {/* F-DM-02 FR-7 — 세트 상태 시트(판매자 전용, TradeSetBar 상태 라벨 탭). */}
      {isDirect && tradeSet && conversationId && (
        <TradeSetStatusSheet
          open={tradeSetStatusOpen}
          onClose={() => setTradeSetStatusOpen(false)}
          conversationId={conversationId}
          tradeSet={tradeSet}
          counterpartNickname={otherName}
          onChanged={setTradeSet}
          onCompleted={() => {
            refreshConv();
            setReviewOpen(true);
          }}
        />
      )}

      {/* 헤더 "..." 메뉴 (대표 지시 2026-08-28 재편, 2026-08-29 위치공유 약속독립화) — 워키토키는
          헤더 아이콘으로 승격했고, 위치공유는 그룹에선 의미가 없어 1:1 전용으로 내렸다. 그룹은
          "설정"이 관리 진입점이다. 위치공유는 약속 유무와 무관하게 항상 켤 수 있다(약속이 있으면
          그 약속의 정밀도 창 정책, 없으면 독립 세션 TTL — 채널 모델, ai-docs/task/active/260829_live_location_channel_task.md 참조). */}
      <BottomSheet open={moreSheetOpen} onClose={() => setMoreSheetOpen(false)}>
        <div className={styles.reportSheet}>
          <button
            className={styles.reportItem}
            type="button"
            onClick={() => { setMoreSheetOpen(false); setReportOpen(true); }}
          >
            {t('dm.moreMenuReport', { defaultValue: '신고하기' })}
          </button>
          {isDirect && !conv?.blockedByMe && (
            <button
              className={`${styles.reportItem} ${styles.leaveItem}`}
              type="button"
              onClick={handleBlockPick}
            >
              <Ban size={17} />
              {t('dm.blockAction', { defaultValue: '차단하기' })}
            </button>
          )}
          {/* 위치 공유하기 항목 제거(260919 리뷰킷 F-S3-01 FR-2) — 진입로가 이미 "+" 메뉴와
              활성 약속 카드 두 곳에 있어 세 번째 진입로가 종료 행위(신고·나가기) 사이에 끼면
              오탭 시 상대에게 실시간 위치를 전송하는 사고로 이어진다. */}
          {!isDirect && (
            <button
              className={styles.reportItem}
              type="button"
              onClick={() => { setMoreSheetOpen(false); setSettingsOpen(true); }}
            >
              {t('dm.moreMenuSettings', { defaultValue: '설정' })}
            </button>
          )}
          {conv?.communityGroupId ? (
            <p className={styles.groupLeaveHint}>{t('dm.groupLeaveHint')}</p>
          ) : (
            <button
              className={`${styles.reportItem} ${styles.leaveItem}`}
              type="button"
              onClick={handleLeaveRoom}
            >
              <LogOut size={17} />
              {t('dm.leaveRoom')}
            </button>
          )}
        </div>
      </BottomSheet>

      {/* 그룹 설정 — 방 정보 수정 + 멤버·운영진·블랙리스트 관리 */}
      {!isDirect && conversationId && (
        <GroupSettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          conversationId={conversationId}
          conv={conv}
          onUpdated={(next: DmConversation) => setConv(next)}
        />
      )}

      {/* 현재위치 카드 미리보기 — 지도 인스턴스는 이 시트 하나만 쓴다(버블마다 만들지 않는다) */}
      <BottomSheet open={pinPreview != null} onClose={() => setPinPreview(null)}>
        {pinPreview && (
          <div className={styles.pinSheet}>
            <h2 className={styles.apptSheetTitle}>{t('dm.locationPinTitle', { defaultValue: '현재 위치' })}</h2>
            <div className={styles.pinMapWrap}>
              <OsmMap
                center={pinPreview}
                markers={[{ id: 'pin', lat: pinPreview.lat, lng: pinPreview.lng }]}
                className={styles.pinMap}
              />
            </div>
            <div className={styles.apptSubmit}>
              <Button onClick={() => handlePinPreviewNavigate(pinPreview.lat, pinPreview.lng)}>
                {t('dm.navigate', { defaultValue: '길안내' })}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* 실시간 위치공유 채널 참가 동의(v2) — 동의 시 채널 생성/참가 → 플로팅 버튼·모달 */}
      <LocationShareConsentModal
        open={liveConsentCtx != null}
        onConsent={handleLiveConsent}
        onClose={() => setLiveConsentCtx(null)}
      />

      {/* 메시지 액션 오버레이 — 기존 액션만 앵커 근처의 작은 메뉴로 표시한다. */}
      {actionMsg && actionAnchor && createPortal(
        <div className={styles.messageActionOverlay} role="dialog" aria-modal="true">
          <button
            type="button"
            className={styles.messageActionBackdrop}
            onClick={closeMessageActions}
            aria-label={t('dm.closeMessageActions', { defaultValue: '메시지 메뉴 닫기' })}
          />
          <div
            className={`${styles.messageActionSnapshot} ${actionMsg.senderId === myId ? styles.messageActionSnapshotMine : styles.messageActionSnapshotTheirs}`}
            aria-hidden="true"
            ref={(node) => {
              node?.setAttribute('inert', '');
            }}
            style={{
              top: actionAnchor.top,
              left: actionAnchor.left,
              width: actionAnchor.width,
              height: actionAnchor.height,
            }}
          >
            {renderMessageActionSnapshot()}
          </div>
          <div ref={actionPanelRef} className={styles.messageActionPanel} style={actionPanelStyle}>
            <div
              className={styles.reactionPalette}
              role="group"
              aria-label={t('dm.reactionsAction', { defaultValue: '공감' })}
            >
              {DM_REACTION_EMOJIS.map((emoji) => {
                const active = actionMsg.reactions.some((r) => r.emoji === emoji && r.reactedByMe);
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`${styles.paletteBtn} ${active ? styles.paletteBtnActive : ''}`}
                    onClick={() => handleToggleReaction(actionMsg, emoji)}
                    aria-pressed={active}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <div className={styles.messageActionMenu}>
            <button
              className={styles.messageActionItem}
              type="button"
              onClick={() => { setReplyTo(actionMsg); closeMessageActions(); }}
            >
              <Reply size={18} />
              {t('dm.replyAction', { defaultValue: '답장' })}
            </button>
            {!isDirect && actionMsg.messageType === 'text' && (
              <button className={styles.messageActionItem} type="button" onClick={() => handleSetNotice(actionMsg)}>
                <Megaphone size={18} />
                {t('dm.noticeSet', { defaultValue: '공지로 등록' })}
              </button>
            )}
            {actionMsg.senderId === myId && actionMsg.messageType === 'text' && (
              <button className={styles.messageActionItem} type="button" onClick={() => handleStartEdit(actionMsg)}>
                <Pencil size={18} />
                {t('dm.editAction', { defaultValue: '수정' })}
              </button>
            )}
            {actionMsg.senderId === myId && (
              <button
                className={`${styles.messageActionItem} ${styles.msgActionDanger}`}
                type="button"
                onClick={() => {
                  closeMessageActions();
                  useConfirmStore.getState().open(
                    t('dm.deleteMessageConfirm', { defaultValue: '이 메시지를 삭제할까요? 삭제된 메시지로 표시됩니다.' }),
                    () => {
                      useConfirmStore.getState().close();
                      void handleDeleteMsg(actionMsg);
                    },
                    { confirmLabel: t('dm.deleteAction', { defaultValue: '삭제' }) },
                  );
                }}
              >
                <Trash2 size={18} />
                {t('dm.deleteAction', { defaultValue: '삭제' })}
              </button>
            )}
            {!isDirect && actionMsg.senderId !== myId && (
              <button
                className={styles.messageActionItem}
                type="button"
                onClick={() => { setMessageReportId(actionMsg.id); closeMessageActions(); }}
              >
                <Flag size={18} />
                {t('dm.messageReportAction', { defaultValue: '신고' })}
              </button>
            )}
            </div>
          </div>
        </div>,
        document.getElementById('app-frame') ?? document.body,
      )}

      {/* 그룹 메시지 신고 사유 */}
      <BottomSheet open={!!messageReportId} onClose={() => setMessageReportId(null)}>
        <div className={styles.reportSheet}>
          <h2 className={styles.reportSheetTitle}>{t('dm.reportTitle', { defaultValue: '신고 사유' })}</h2>
          {DM_REPORT_REASONS.map((r) => (
            <button key={r} className={styles.reportItem} onClick={() => handleReportMessage(r)}>
              {t(`dm.reportReason_${r}`)}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 대화 신고 사유 */}
      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)}>
        <div className={styles.reportSheet}>
          <h2 className={styles.reportSheetTitle}>{t('dm.reportTitle', { defaultValue: '신고 사유' })}</h2>
          {DM_REPORT_REASONS.map((r) => (
            <button key={r} className={styles.reportItem} onClick={() => handleReport(r)}>
              {t(`dm.reportReason_${r}`)}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CalendarPlus, Check, ChevronDown, HandCoins, LayoutList, MailOpen, MapPin, Megaphone, Smile, ImagePlus, MoreVertical, Radio, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { StarIcon } from '@/components/ui/StarIcon';
import { MessageComposer, type MessageComposerHandle } from '@/components/ui/MessageComposer';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { api, extractErrorCode } from '@/api/client';
import { MOCK_STICKERS, findSticker } from './mockStickers';
import { type PickedLocation } from '../market/LocationPickerSheet';
import AppointmentLocationPicker from './AppointmentLocationPicker';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import {
  fetchMessages,
  sendMessage,
  markRead,
  fetchConversation,
  proposeAppointment,
  acceptAppointment,
  completeAppointment,
  requestAppointmentCompletion,
  declineAppointmentCompletion,
  cancelAppointment,
  proposePriceOffer,
  acceptPriceOffer,
  declinePriceOffer,
  cancelPriceOffer,
  reportConversation,
  removeMember,
  fetchMembers,
  setConversationNotice,
  clearConversationNotice,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  DM_REACTION_EMOJIS,
  DM_REPORT_REASONS,
  type DmReportReason,
} from '@/api/dm';
import { loadCachedMessages, saveCachedMessages } from '@/lib/dmCache';
import type { Appointment, PriceOffer } from '@/api/types';
import { native } from '@/lib/native';
import type { DealStatusKind } from '@/lib/plugins/liveActivity';
import PriceOfferSheet from '@/components/market/PriceOfferSheet';
import { fetchMyReview, type ReviewBrief } from '@/api/market';
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
import { formatRelativeTime } from '@/lib/format';
import { playSound } from '@/lib/sound';
import type { DmConversation, DmMessage } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { formatPriceVnd } from '../market/marketFormat';
import { DealLiveActions } from '@/components/dm/DealLiveActions';
import GroupSettingsSheet from '@/components/dm/GroupSettingsSheet';
import styles from './DmDetail.module.css';

const PAGE_SIZE = 50;
/** 그룹 발신자 표시를 묶는 창(카톡 관례) — 같은 사람이 이 안에서 연속 발화하면 한 번만 표시한다. */
const SENDER_RUN_MS = 2 * 60 * 1000;

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  // 길안내 버튼 제어용 — 스토어가 이미 끝낸 측위 결과를 읽기만 한다(새로 측정하지 않는다).
  const { available: routeAvailable, reason: routeGateReason } = useServiceAvailability();
  const location = useLocation();
  const locationState = location.state as { conv?: DmConversation } | null;
  // B-4: 음성메시지 알림 탭 딥링크(/dm/:id?voice=1&mid=<messageId>) — 음성메시지는 이제 채팅
  // 이력에 영구 버블로 렌더되므로(202608 재개편) 여기서 자동재생을 강제하지 않는다. 대신
  // 이 대화방을 워키토키 캡슐의 대상으로 활성화해, 알림을 탭한 김에 바로 PTT 로 답할 수 있게 한다.
  const voiceDeepLink = new URLSearchParams(location.search).get('voice') === '1';
  const user = useUserStore((s) => s.user);
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const session = loadSession();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  // 폴링 tick 이 최신 messages 를 읽되, 그 변화가 폴링 interval 자체를 재시작시키지는 않게 한다 —
  // 안 그러면 로컬 전송/공감/수정마다 5초 타이머가 리셋돼 상대방 신규 메시지 수신이 계속 미뤄진다.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // 음성메시지(WalkieTalkie 모듈, wt_messages) — 202608 개편(대표 지시): 워키토키 캡슐에서
  // 자동재생 후 사라지던 것을 그만두고, 일반 메시지처럼 이 채팅 이력에 영구 렌더한다.
  // 저장소가 dm_messages 와 분리돼 있어(별도 모듈) 별도로 폴링해 화면에서 시간순으로만 합친다.
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
  const [apptLocOpen, setApptLocOpen] = useState(false);
  const [tr, setTr] = useState<Record<string, string>>({});
  const [trOpen, setTrOpen] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [myReview, setMyReview] = useState<ReviewBrief | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // 메시지 액션(공감/답장/수정/삭제) — 말풍선 롱프레스로 연다.
  // 값 스냅샷이 아니라 id 만 들고 messages 에서 매번 파생한다 — 시트가 열려있는 동안
  // 백그라운드 폴링으로 메시지가 갱신돼도(공감 상태 등) 시트 내용이 따라간다.
  const [actionMsgId, setActionMsgId] = useState<string | null>(null);
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
  const [locationShareSheetOpen, setLocationShareSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const otherName = conv?.otherUserNickname ?? locationState?.conv?.otherUserNickname ?? t('dm.detailTitle');
  // 260827 group/open 확장 (§3.5) — 마켓 약속·가격제안 UI 는 direct 에서만 렌더
  const isDirect = (conv?.conversationType ?? locationState?.conv?.conversationType ?? 'direct') === 'direct';
  const roomTitle = conv?.title ?? locationState?.conv?.title ?? t('dm.group', { defaultValue: '그룹톡방' });
  const roomMemberCount = conv?.memberCount ?? locationState?.conv?.memberCount ?? null;

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
        setMessages(res.items);
        void saveCachedMessages(res.items);
      } else {
        // 캐시 워터마크 이후의 신규/수정/삭제/공감변경분만 증분 수신
        const res = await fetchMessages(conversationId, 1, watermarkOf(cached));
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
    return () => { refreshUnread(); };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 워키토키 플로팅 버블(A-7) — 대표 지시 2026-08-27: 대화방 입장만으로 자동 참여시키지 않는다.
  // 참여는 (a) 헤더 메뉴 "워키토키" 탭, (b) 초대카드 "참여하기" 탭, (c) 캡슐 컨텍스트메뉴 "채널 변경" 3가지
  // 명시적 액션에서만 일어난다.
  const setActiveWalkieConversation = useWalkieTalkieBubbleStore((s) => s.setActiveConversation);
  const walkieActiveConversationId = useWalkieTalkieBubbleStore((s) => s.activeConversationId);

  // B-4: 음성메시지 알림 딥링크(?voice=1) 진입은 위 3가지와 별개인 4번째 명시적 액션이다 — 사용자가
  // 알림을 탭한 것 자체가 "이 채널에 참여하겠다"는 의사표시. 음성메시지 자체는 이미 채팅 이력
  // 폴링(voiceItems)으로 영구 버블에 렌더되므로, 여기선 PTT 답장을 위해 캡슐만 활성화한다.
  useEffect(() => {
    if (!voiceDeepLink || !conversationId) return;
    if (walkieActiveConversationId === conversationId) return;
    setActiveWalkieConversation(conversationId, { name: isDirect ? otherName : roomTitle, isGroup: !isDirect });
  }, [voiceDeepLink, conversationId, walkieActiveConversationId, setActiveWalkieConversation, isDirect, otherName, roomTitle]);

  useEffect(() => {
    if (!conversationId) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        // updated_at 워터마크 — 신규뿐 아니라 수정/삭제/공감변경된 메시지도 실려 온다(id upsert)
        const res = await fetchMessages(conversationId, 1, watermarkOf(messagesRef.current));
        if (res.items.length > 0) {
          const knownIds = new Set(messagesRef.current.map((m) => m.id));
          applyIncoming(res.items);
          // 폴링으로 **새로** 도착한 메시지 중 내가 보낸 게 아닌 게 있으면 수신음 (수정/공감 변경 제외).
          const uid = session?.userId ?? user?.id;
          const fresh = res.items.filter((m) => !knownIds.has(m.id));
          // 진짜 신규 메시지(수정/공감 아님)만큼 total 근사치도 전진 — 안 하면 loadOlder 의
          // "안 받은 과거분 = total - 보유건수" 계산이 뒤로 밀려 과거 구간을 영구히 건너뛴다.
          if (fresh.length > 0 && totalRef.current !== null) totalRef.current += fresh.length;
          if (fresh.some((m) => m.senderId !== uid)) playSound('dm_receive');
          // 남이 등록한 공지는 이 시스템 메시지로만 알 수 있다 — 배너가 낡지 않게 conv 만 재조회
          if (fresh.some((m) => m.messageType === 'system' && m.meta?.kind === 'notice_set')) refreshConv();
          if (fresh.length > 0) markRead(conversationId).then(() => refreshUnread()).catch(() => {});
          else skipAutoScrollRef.current = true; // 수정/공감만 온 폴링은 바닥 스냅을 유발하지 않는다
        }
      } catch {
        // 순단 무시 — 다음 tick 에 재시도
      }
    };
    const interval = setInterval(tick, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load(voiceCursorRef.current);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId]);

  // dm 텍스트 메시지 + 음성메시지(별도 저장소)를 시간순으로 합친 렌더 전용 피드.
  const feed = useMemo(() => {
    const dmRows = messages.map((m) => ({ kind: 'dm' as const, item: m, createdAt: m.createdAt }));
    const voiceRows = voiceItems.map((v) => ({ kind: 'voice' as const, item: v, createdAt: v.createdAt }));
    return [...dmRows, ...voiceRows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [messages, voiceItems]);

  // 발신자 헤더 판정의 "직전 메시지" — 화면에 말풍선으로 보이는 직전 것이어야 한다.
  // system 메시지(구분선·공지 등록 카드)는 말풍선이 아니라 건너뛴다. 음성 버블은 별도
  // 렌더 경로라 연속 발화를 끊는 것으로 본다(종전 동작 유지).
  const prevBubbleById = useMemo(() => {
    const map = new Map<string, DmMessage | null>();
    let last: DmMessage | null = null;
    for (const row of feed) {
      if (row.kind !== 'dm') {
        last = null;
        continue;
      }
      map.set(row.item.id, last);
      if (row.item.messageType !== 'system') last = row.item;
    }
    return map;
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
      playSound('dm_send');
    } catch (err) {
      // 전송 실패 시 입력을 비운 채로 두지 않고 원문을 복원 — 재입력 없이 한 번의 조작으로 재전송 가능 (P1-6)
      composerRef.current?.setValue(text);
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
        placeName: apptPlace?.districtName ?? null,
        placeLat: apptPlace?.lat ?? null,
        placeLng: apptPlace?.lng ?? null,
      });
      applyIncoming([msg]);
      setApptOpen(false);
      setApptWhen('');
      setApptPlace(null);
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
      const msg = await proposePriceOffer(conversationId, amount);
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

  // P6: DealLiveActions 슬롯에 넘길 "현재 약속" — 대화 내 가장 최근 약속 메시지 기준.
  // 약속이 없는 대화면 null → DealLiveActions 자체가 렌더되지 않는다.
  const currentAppointment = useMemo<Appointment | null>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const appt = messages[i].appointment;
      if (messages[i].messageType === 'appointment' && appt) return appt;
    }
    return null;
  }, [messages]);
  const currentAppointmentId = currentAppointment?.id ?? null;

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
    } catch {
      // 카드가 stale(이미 변경된 약속) → 메시지 재동기화로 카드 상태 교정
      if (conversationId) fetchMessages(conversationId).then((res) => applyIncoming(res.items)).catch(() => {});
      toast.error(t('dm.apptOutdated', { defaultValue: '약속 상태가 변경되어 새로고침했어요' }));
    } finally {
      setSending(false);
    }
  };

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
  const startPress = (m: DmMessage) => {
    cancelPress();
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      setActionMsgId(m.id);
    }, 450);
  };
  // 텍스트/이미지 버블에만 액션을 건다 — 약속/제안/시스템 카드는 전용 플로우가 있다
  const pressHandlers = (m: DmMessage) => ({
    onTouchStart: () => startPress(m),
    onTouchEnd: cancelPress,
    onTouchMove: cancelPress,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setActionMsgId(m.id); },
  });

  const handleToggleReaction = async (m: DmMessage, emoji: string) => {
    if (!conversationId) return;
    setActionMsgId(null);
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
    setActionMsgId(null);
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
    setActionMsgId(null);
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

  // 약속 길안내. **버튼 자체를 제어한다** — 대표 지시 2026-08-13 11:44 ("화면 데이터 로딩될 때
  // 백으로 측정해서 버튼을 제어해야지"). 종전 주석("항상 진입, HCMC 밖이면 RideNav 가 구글맵
  // 전환")은 현행과 맞지 않았다: RideNav 는 구글맵으로 자동 전환하지 않는다.
  const handleNavigate = (lat: number, lng: number) => {
    // disabled 로 두면 조용히 아무 일도 안 일어나 오류로 보인다(대표 지적 2026-08-13) —
    // aria-disabled 로 잠근 티만 내고 탭은 받아 사유를 알린다. 토스트는 기존 것 재사용.
    if (!routeAvailable) {
      toast.neutral(routeGateReason ? t(`locationGate.${routeGateReason}.title`) : t('locationGate.checking', '위치를 확인하고 있어요'));
      return;
    }
    navigate(`/ride-nav?type=nav&lat=${lat}&lng=${lng}`);
  };

  const handleReviewSubmitted = () => {
    setReviewed(true);
  };

  // 그룹/오픈톡방 나가기 — 최소 구현(§3.8): 초대·강퇴 등 세부 관리 UI 는 이 서브태스크 범위 밖.
  const handleLeaveRoom = async () => {
    if (!conversationId) return;
    const uid = session?.userId ?? user?.id;
    if (!uid) return;
    try {
      await removeMember(conversationId, uid);
      navigate('/dm');
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const myId = session?.userId ?? user?.id;
  const listing = conv?.contextListing ?? null;

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
    setActionMsgId(null);
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

  // 그룹방 발신자 표시 — 카톡처럼 같은 사람이 2분 내 연속으로 말하면 첫 말풍선에만 붙인다.
  // 1:1 방과 내 메시지에는 붙지 않는다(계약 테스트로 고정).
  const renderSender = (m: DmMessage, prev: DmMessage | null) => {
    if (isDirect || m.senderId === myId) return null;
    if (
      prev &&
      prev.senderId === m.senderId &&
      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < SENDER_RUN_MS
    ) {
      return null;
    }
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

  return (
    <div className={styles.page}>
      <TopBar
        title={isDirect ? otherName : roomTitle}
        rightContent={
          <>
            {/* 게시판(init/218) — direct 방에는 게시판이 없다(서버도 400) */}
            {!isDirect && (
              <button
                className={styles.headerMoreBtn}
                type="button"
                onClick={() => navigate(`/dm/${conversationId}/board`)}
                aria-label={t('dm.board.title', { defaultValue: '게시판' })}
              >
                <LayoutList size={21} strokeWidth={2} />
              </button>
            )}
            {/* 워키토키 승격(대표 지시 2026-08-28) — 1:1·그룹 공통. "채널 열기"가 아니라
                "이 방의 채널에 참여"다. 종전엔 "..." 메뉴 안에 묻혀 있어 발견성이 낮았다. */}
            <button
              className={styles.headerMoreBtn}
              type="button"
              onClick={handleWalkieJoin}
              aria-label={t('dm.moreMenuWalkieTalkie', { defaultValue: '워키토키' })}
              data-active={walkieActiveConversationId === conversationId || undefined}
            >
              <Radio size={21} strokeWidth={2} />
            </button>
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

      {/* 그룹/오픈톡방 최소 정보 UI (§3.8) — 초대·강퇴·mute 같은 세부 관리는 범위 밖(TODO) */}
      {!isDirect && (
        <div className={styles.roomInfoBar}>
          <span className={styles.roomInfoText}>
            {roomMemberCount != null
              ? t('dm.memberCount', { count: roomMemberCount, defaultValue: '멤버 {{count}}명' })
              : ''}
          </span>
          <button type="button" className={styles.roomLeaveBtn} onClick={handleLeaveRoom}>
            {t('dm.leaveRoom', { defaultValue: '나가기' })}
          </button>
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

      {/* 매물 컨텍스트 카드 — direct 전용 (마켓 문의 대화) */}
      {isDirect && listing && (
        <button className={styles.contextCard} type="button" onClick={() => navigate(`/market/${listing.id}`)}>
          <AppImage src={listing.thumbnailUrl ?? undefined} alt="" className={styles.contextThumb} />
          <div className={styles.contextInfo}>
            <span className={styles.contextTitle}>{listing.title}</span>
            <span className={styles.contextPrice}>{formatPriceVnd(listing.priceVnd, t)}</span>
          </div>
        </button>
      )}

      {/* 거래완료 시: 내 후기 있으면 표시, 없으면 후기 보내기 (REF-05) — direct 전용 */}
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
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
          // 최상단 근접 — 과거분(offset 페이지) 추가 적재
          if (el.scrollTop < 60 && !loading) void loadOlder();
        }}
      >
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
          const m = row.item;
          const isMine = m.senderId === myId;
          const prevMsg = prevBubbleById.get(m.id) ?? null;
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
            const lat = appt?.placeLat ?? m.meta?.placeLat ?? null;
            const lng = appt?.placeLng ?? m.meta?.placeLng ?? null;
            const statusLabel: Record<string, string> = {
              PROPOSED: t('dm.apptProposed', { defaultValue: '제안됨' }),
              ACCEPTED: t('dm.apptAccepted', { defaultValue: '확정' }),
              COMPLETED: t('dm.apptCompleted', { defaultValue: '거래완료' }),
              CANCELLED: t('dm.apptCancelled', { defaultValue: '취소됨' }),
            };
            const hasCoords = lat != null && lng != null;
            const showNav = hasCoords && status !== 'CANCELLED';
            const isSeller = !!appt?.sellerId && appt.sellerId === myId;
            const canAccept = !!appt && status === 'PROPOSED' && !iAmProposer;
            const canComplete = !!appt && status === 'ACCEPTED' && isSeller;
            const canCancel = !!appt && (status === 'PROPOSED' || status === 'ACCEPTED');
            // S-16: 완료 요청은 ACCEPTED 의 하위 상태 — 거절된 요청은 "요청 없음"으로 되돌려 재요청을 허용한다.
            const completionPending = !!appt?.completionRequestedAt && !appt.completionDeclinedAt;
            const canRequestCompletion = !!appt && status === 'ACCEPTED' && !isSeller && !completionPending;
            const canDeclineCompletion = !!appt && status === 'ACCEPTED' && isSeller && completionPending;
            const cancelLabel = status === 'ACCEPTED'
              ? t('dm.apptCancel', { defaultValue: '약속 취소' })
              : iAmProposer
                ? t('dm.apptCancelOffer', { defaultValue: '제안 취소' })
                : t('dm.apptReject', { defaultValue: '거절' });
            return (
              <div key={m.id} className={`${styles.apptCard} ${(status && styles[`appt_${status}`]) || ''}`}>
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
                </div>
                {/* S-16: 판매자가 앱을 열지 않아 거래가 정체되지 않도록 구매자에게 요청 도선을 준다.
                    거절 시엔 그 사실을 구매자 화면에 남겨야 "요청이 사라진" 것으로 오인하지 않는다.
                    누가 거절했는지로 문구가 갈린다 — 운영 기각(`completionDeclinedBy === null`)을
                    "판매자가 거절"이라고 하면 사실과 다르고 연락할 상대도 잘못 가리킨다. */}
                {appt?.completionDeclinedAt && !isSeller && status === 'ACCEPTED' && (
                  <p className={styles.apptNote}>
                    {appt.completionDeclinedBy
                      ? t('dm.apptCompletionDeclinedNote', { defaultValue: '판매자가 완료 요청을 거절했어요. 대화로 확인해 주세요.' })
                      : t('dm.apptCompletionDismissedNote', { defaultValue: '완료 요청이 운영 검토에서 기각됐어요. 알림에서 사유를 확인해 주세요.' })}
                  </p>
                )}
                {(canAccept || canComplete || showNav || canCancel || canRequestCompletion || canDeclineCompletion) && (
                  <div className={styles.apptActions}>
                    {canAccept && (
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(acceptAppointment, appt.id)}>
                        {t('dm.apptAccept', { defaultValue: '약속 수락' })}
                      </button>
                    )}
                    {canComplete && (
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(completeAppointment, appt.id)}>
                        {t('dm.apptComplete', { defaultValue: '거래 완료' })}
                      </button>
                    )}
                    {canRequestCompletion && (
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(requestAppointmentCompletion, appt.id)}>
                        {appt.completionDeclinedAt
                          ? t('dm.apptRequestCompletionAgain', { defaultValue: '완료 다시 요청' })
                          : t('dm.apptRequestCompletion', { defaultValue: '거래 완료 요청' })}
                      </button>
                    )}
                    {canDeclineCompletion && (
                      <button className={styles.apptBtnGhost} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(declineAppointmentCompletion, appt.id)}>
                        {t('dm.apptDeclineCompletion', { defaultValue: '요청 거절' })}
                      </button>
                    )}
                    {showNav && (
                      <button className={styles.apptBtnGhost} type="button"
                        aria-disabled={!routeAvailable}
                        onClick={() => handleNavigate(lat!, lng!)}>
                        {t('dm.navigate', { defaultValue: '길안내' })}
                      </button>
                    )}
                    {canCancel && (
                      <button className={styles.apptBtnGhost} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(cancelAppointment, appt.id)}>
                        {cancelLabel}
                      </button>
                    )}
                  </div>
                )}
                <div className={styles.apptTime}>{formatRelativeTime(m.createdAt)}</div>
              </div>
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
              // 약속 카드(.apptCard) 공용 골격 재사용 — 가격제안 전용은 금액 표시뿐
              <div key={m.id} className={`${styles.apptCard} ${styles[`appt_${status}`] || ''}`}>
                <div className={styles.apptHeader}>
                  <span className={styles.apptTitle}>
                    <HandCoins size={15} /> {t('dm.priceOffer', { defaultValue: '가격제안' })}
                  </span>
                  <span className={styles.apptStatusPill} data-status={status}>{statusLabel[status]}</span>
                </div>
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
                <div className={styles.apptTime}>{formatRelativeTime(m.createdAt)}</div>
              </div>
            );
          }
          // 소프트 삭제 — 콘텐츠 대신 플레이스홀더 (서버도 content/image 를 내리지 않는다)
          if (m.deletedAt) {
            return (
              <div key={m.id} data-mid={m.id} className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
                <div className={styles.deletedText}>{t('dm.deletedMessage', { defaultValue: '삭제된 메시지입니다' })}</div>
                <div className={styles.meta}>{formatRelativeTime(m.createdAt)}</div>
              </div>
            );
          }
          if (m.messageType === 'sticker') {
            const st = findSticker(m.meta?.stickerId);
            return (
              <Fragment key={m.id}>
              {renderSender(m, prevMsg)}
              <div
                className={`${styles.stickerMsg} ${isMine ? styles.stickerMine : styles.stickerTheirs}`}
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
                <div className={styles.meta}>
                  {formatRelativeTime(m.createdAt)}
                  {isMine && m.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
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
          if (m.messageType === 'walkie_invite') {
            const joined = walkieActiveConversationId === conversationId;
            return (
              <div key={m.id} className={`${styles.walkieInviteCard} ${isMine ? styles.walkieInviteMine : styles.walkieInviteTheirs}`}>
                <div className={styles.walkieInviteHead}>
                  <span className={styles.walkieInviteIcon}><Radio size={17} /></span>
                  <span className={styles.walkieInviteText}>
                    {t('walkieTalkie.inviteCardText', { name: m.meta?.invitedByName ?? '', defaultValue: '{{name}}님이 워키토키 채널을 열었어요' })}
                  </span>
                </div>
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
                <div className={styles.walkieInviteTime}>{formatRelativeTime(m.createdAt)}</div>
              </div>
            );
          }
          // 이미지 첨부(캡션 없음) 메시지 — 버블 배경/패딩 없이 이미지만 (스티커와 동일 패턴)
          if (m.imageUrl && !m.content) {
            return (
              <Fragment key={m.id}>
              {renderSender(m, prevMsg)}
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
                <div className={styles.meta}>
                  {formatRelativeTime(m.createdAt)}
                  {isMine && m.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
                </div>
                {renderReactions(m)}
              </div>
              </Fragment>
            );
          }
          return (
            <Fragment key={m.id}>
            {renderSender(m, prevMsg)}
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
              <div className={styles.meta}>
                {m.editedAt && (
                  <span className={styles.editedTag}>{t('dm.edited', { defaultValue: '(수정됨)' })}</span>
                )}
                {formatRelativeTime(m.createdAt)}
                {isMine && m.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
              </div>
              {renderReactions(m)}
            </div>
            </Fragment>
          );
        })}
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

      <MessageComposer
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
          // 약속잡기 — direct 전용. 판매자는 항상, 구매자는 판매자의 거래진행 액션 이후에만 (백엔드도 403으로 차단)
          ...(isDirect && conv?.appointmentUnlocked
            ? [{
                key: 'appt',
                icon: <CalendarPlus size={26} strokeWidth={1.8} />,
                label: t('dm.makeAppointment', { defaultValue: '약속잡기' }),
                onPress: handleOpenAppt,
              }]
            : []),
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
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleImageSelect}
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
          <button className={styles.apptPlaceBtn} onClick={() => setApptLocOpen(true)}>
            <MapPin size={16} className={styles.apptPlacePin} />
            {apptPlace
              ? apptPlace.districtName
              : t('dm.apptPlacePick', { defaultValue: '지도를 탭해 장소 찍기' })}
          </button>
          <div className={styles.apptSubmit}>
            <Button onClick={handleSendAppointment} disabled={!apptWhen}>
              {t('dm.apptSend', { defaultValue: '약속 제안 보내기' })}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <AppointmentLocationPicker
        open={apptLocOpen}
        onClose={() => setApptLocOpen(false)}
        value={apptPlace ? { lat: apptPlace.lat, lng: apptPlace.lng } : null}
        onConfirm={setApptPlace}
      />

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

      {/* 헤더 "..." 메뉴 (대표 지시 2026-08-28 재편) — 워키토키는 헤더 아이콘으로 승격했고,
          위치공유는 그룹에선 의미가 없어 1:1 전용으로 내렸다. 그룹은 "설정"이 관리 진입점이다. */}
      <BottomSheet open={moreSheetOpen} onClose={() => setMoreSheetOpen(false)}>
        <div className={styles.reportSheet}>
          <button
            className={styles.reportItem}
            type="button"
            onClick={() => { setMoreSheetOpen(false); setReportOpen(true); }}
          >
            {t('dm.moreMenuReport', { defaultValue: '신고하기' })}
          </button>
          {isDirect && (
            <button
              className={styles.reportItem}
              type="button"
              disabled={!currentAppointmentId}
              aria-disabled={!currentAppointmentId}
              onClick={() => { if (!currentAppointmentId) return; setMoreSheetOpen(false); setLocationShareSheetOpen(true); }}
            >
              {t('dm.moreMenuLocationShare', { defaultValue: '위치 공유하기' })}
            </button>
          )}
          {!isDirect && (
            <button
              className={styles.reportItem}
              type="button"
              onClick={() => { setMoreSheetOpen(false); setSettingsOpen(true); }}
            >
              {t('dm.moreMenuSettings', { defaultValue: '설정' })}
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

      {/* 위치공유 위젯 — 약속이 있을 때만(§7), 항상-보임이 아니라 이 메뉴로 열고 닫는다 */}
      <BottomSheet open={locationShareSheetOpen} onClose={() => setLocationShareSheetOpen(false)}>
        <DealLiveActions appointmentId={currentAppointmentId} />
      </BottomSheet>

      {/* 메시지 액션 시트 — 롱프레스로 연다: 고정 팔레트 공감 + 답장 + (내 메시지) 수정/삭제 */}
      <BottomSheet open={!!actionMsg} onClose={() => setActionMsgId(null)}>
        {actionMsg && (
          <div className={styles.reportSheet}>
            <div className={styles.reactionPalette}>
              {DM_REACTION_EMOJIS.map((emoji) => {
                const active = actionMsg.reactions.some((r) => r.emoji === emoji && r.reactedByMe);
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`${styles.paletteBtn} ${active ? styles.paletteBtnActive : ''}`}
                    onClick={() => handleToggleReaction(actionMsg, emoji)}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <button
              className={styles.reportItem}
              type="button"
              onClick={() => { setReplyTo(actionMsg); setActionMsgId(null); }}
            >
              {t('dm.replyAction', { defaultValue: '답장' })}
            </button>
            {!isDirect && actionMsg.messageType === 'text' && (
              <button className={styles.reportItem} type="button" onClick={() => handleSetNotice(actionMsg)}>
                {t('dm.noticeSet', { defaultValue: '공지로 등록' })}
              </button>
            )}
            {actionMsg.senderId === myId && actionMsg.messageType === 'text' && (
              <button className={styles.reportItem} type="button" onClick={() => handleStartEdit(actionMsg)}>
                {t('dm.editAction', { defaultValue: '수정' })}
              </button>
            )}
            {actionMsg.senderId === myId && (
              <button
                className={`${styles.reportItem} ${styles.msgActionDanger}`}
                type="button"
                onClick={() => handleDeleteMsg(actionMsg)}
              >
                {t('dm.deleteAction', { defaultValue: '삭제' })}
              </button>
            )}
          </div>
        )}
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

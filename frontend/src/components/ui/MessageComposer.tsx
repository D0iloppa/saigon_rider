import { type ReactNode, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Plus, ChevronLeft } from 'lucide-react';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import styles from './MessageComposer.module.css';

export interface ComposerMenuItem {
  /** 액션 식별자. */
  key: string;
  icon: ReactNode;
  label: string;
  /** 원샷 액션(앨범/카메라/약속 등). 탭 즉시 실행 후 패널 닫힘. */
  onPress?: () => void;
  /** 피커(스티커/이모지 등). 탭 시 같은 패널 안에서 이 콘텐츠로 전환(‹ 뒤로 제공). */
  renderPanel?: () => ReactNode;
}

export interface MessageComposerProps {
  onSend: (text: string) => void;
  placeholder?: string;
  sending?: boolean;
  sendAriaLabel?: string;
  menuAriaLabel?: string;
  /** '+' 컨텍스트 패널에 표시할 액션들. 비어있으면 '+' 버튼을 숨긴다. */
  menuItems?: ComposerMenuItem[];
}

export interface MessageComposerHandle {
  /** 열려있는 '+' 패널을 키보드 없이 닫는다 (본문 탭 등 외부에서 호출). */
  close: () => void;
  /** 입력창 값을 강제로 설정 (전송 실패 시 원문 복원 등). */
  setValue: (text: string) => void;
}

const DEFAULT_PANEL_HEIGHT = 300;

/**
 * 채팅 입력 컴포넌트. 입력 row 는 [+] [입력] [전송] 만 두고, 액션들은 '+' 를 누르면
 * 키보드 자리에 뜨는 컨텍스트 패널(아이콘+라벨 그리드)로 모은다 (당근마켓 패턴).
 *
 * WebView 에서 OS 키보드는 DOM 밖 네이티브 오버레이라, '+' 탭 시 input.blur() 로
 * 키보드를 내리고 마지막 키보드 높이와 같은 크기의 패널을 같은 자리에 렌더한다.
 */
export const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(function MessageComposer(
  {
    onSend,
    placeholder,
    sending = false,
    sendAriaLabel,
    menuAriaLabel,
    menuItems = [],
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 'closed' | 'menu' | <item.key>(피커 서브뷰)
  const [view, setView] = useState<string>('closed');
  const [focused, setFocused] = useState(false);
  // 전송 버튼 활성화 여부만 추적 — 실제 입력값은 DOM(uncontrolled input)이 직접 들고 있다.
  const [hasText, setHasText] = useState(false);
  const kb = useKeyboard();
  // 네이티브(iOS·Android 공통)는 키보드가 순수 오버레이(웹뷰 리사이즈/팬 없음,
  // Android 도 c231681 이후 adjustNothing) → 입력바를 키보드 위로 올리는 건 아래
  // 스페이서뿐. 웹은 브라우저가 직접 밀어주므로 제외.
  const needsManualKeyboardLift = native.isNative;

  const hasMenu = menuItems.length > 0;
  const open = view !== 'closed';
  const subItem = menuItems.find((m) => m.key === view && m.renderPanel) ?? null;
  // useKeyboard 는 키보드가 내려가도 마지막 높이를 유지 → 패널을 같은 크기로 스왑.
  const panelHeight = kb.height || DEFAULT_PANEL_HEIGHT;

  // 입력바 아래 예약 공간 — 패널과 키보드가 공유하는 단일 슬롯. 패널↔키보드 전환에서
  // 높이가 한 순간도 0 으로 붕괴하지 않아야 iOS 가 웹뷰를 팬하지 않는다.
  const lastSpacerRef = useRef(0);
  let spacerHeight = 0;
  if (open) {
    spacerHeight = panelHeight;
  } else if (needsManualKeyboardLift && kb.visible) {
    spacerHeight = kb.height;
  } else if (needsManualKeyboardLift && focused && lastSpacerRef.current > 0) {
    // 포커스 직후 ~ keyboardWillShow 도착 전 공백 래치: 직전 스페이서 높이 유지.
    // (직전 높이가 0 이면 아무것도 예약하지 않음 → 하드웨어 키보드 등에서 빈 300px 방지)
    spacerHeight = lastSpacerRef.current;
  }
  lastSpacerRef.current = spacerHeight;

  // 본문 탭 등 외부에서 패널을 닫을 수 있게 노출 (키보드 띄우지 않음).
  useImperativeHandle(
    ref,
    () => ({
      close: () => setView('closed'),
      setValue: (text: string) => {
        if (inputRef.current) inputRef.current.value = text;
        setHasText(text.trim().length > 0);
      },
    }),
    [],
  );

  const handleSend = () => {
    const text = (inputRef.current?.value ?? '').trim();
    if (!text) return;
    onSend(text);
    if (inputRef.current) inputRef.current.value = '';
    setHasText(false);
  };

  // accessory bar(^ v Done) 는 App 부트스트랩에서 전역으로 숨긴다 — 여기서 관리하지 않음.

  const toggleMenu = () => {
    if (open) {
      setView('closed'); // 닫을 땐 키보드 띄우지 않음
    } else {
      setView('menu');
      inputRef.current?.blur(); // OS 키보드 dismiss
    }
  };

  const handleMenuItem = (item: ComposerMenuItem) => {
    if (item.renderPanel) {
      setView(item.key); // 같은 패널 안에서 피커로 전환
    } else {
      item.onPress?.();
      setView('closed');
    }
  };

  return (
    <div
      className={styles.composer}
      // 키보드가 떠 있을 땐 홈 인디케이터 safe-area 여백을 없앤다(키보드가 그 자리를 덮으므로).
      style={{ paddingBottom: kb.visible ? 0 : undefined }}
    >
      <div className={styles.inputBar}>
        {hasMenu && (
          <button
            type="button"
            className={`${styles.plusBtn} ${open ? styles.plusBtnOpen : ''}`}
            aria-label={menuAriaLabel}
            onClick={toggleMenu}
          >
            <Plus size={24} strokeWidth={2.2} />
          </button>
        )}
        <input
          ref={inputRef}
          className={styles.input}
          placeholder={placeholder}
          // uncontrolled input — DOM/IME 가 값을 직접 소유(React 가 매 키입력마다 재동기화하지
          // 않음). React 는 전송 버튼 활성화용 boolean 만 onInput 으로 읽는다.
          onInput={(e) => setHasText((e.target as HTMLInputElement).value.trim().length > 0)}
          onFocus={() => {
            setFocused(true);
            setView('closed'); // 패널 내용은 닫되 스페이서는 래치로 유지 → 키보드가 자리를 이어받음
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
        />
        <button
          type="button"
          className={`${styles.sendBtn} ${hasText ? styles.sendBtnActive : ''}`}
          onClick={handleSend}
          disabled={!hasText || sending}
          aria-label={sendAriaLabel}
        >
          ↗
        </button>
      </div>

      {spacerHeight > 0 && (
        <div className={styles.panel} style={{ height: spacerHeight }}>
          {open &&
            (subItem ? (
              <div className={styles.subPanel}>
                <button type="button" className={styles.backBtn} onClick={() => setView('menu')}>
                  <ChevronLeft size={20} />
                  <span>{subItem.label}</span>
                </button>
                <div className={styles.subContent}>{subItem.renderPanel!()}</div>
              </div>
            ) : (
              <div className={styles.menuGrid}>
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.menuItem}
                    onClick={() => handleMenuItem(item)}
                  >
                    <span className={styles.menuIcon}>{item.icon}</span>
                    <span className={styles.menuLabel}>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
});

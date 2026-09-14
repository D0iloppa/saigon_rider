/**
 * 앱 전역 폴링 스케줄러 — 반복 조회를 **타이머 하나**로 모은다.
 *
 * ## 왜 만들었나 (2026-09-13)
 *
 * 종전엔 화면·훅마다 `setInterval` 을 따로 들고 있었고, 그 결과 두 가지가 반복해서 어긋났다.
 *
 * 1. **백그라운드 가드를 빠뜨린다.** 조사 시점 폴러 9개 중 5개가 `visibilityState` 검사를
 *    하지 않아 화면이 꺼진 뒤에도 계속 요청했다. 3초짜리는 분당 20건씩 나간다.
 * 2. **같은 화면에서 타이머가 갈라진다.** DmDetail 은 5초 타이머를 텍스트·음성용으로 둘
 *    따로 돌려 서로 다른 시점에 요청을 쐈다.
 *
 * 가드를 "각자 알아서" 넣는 구조라 새 폴러를 추가할 때마다 같은 실수가 났다. 그래서 규칙을
 * 호출부가 아니라 **스케줄러가 강제**한다 — 등록만 하면 가드와 정렬은 자동이다.
 *
 * ## 보장하는 것
 *
 * - 앱 전체에서 동작하는 타이머는 **1개**. 다음에 실행할 작업 시각으로만 재예약한다.
 * - 화면이 보이지 않으면 실행하지 않는다(`runWhenHidden` 으로 명시적 예외만 허용).
 * - 포그라운드 복귀 시 밀린 작업을 **즉시 한 번** 돌린다 — 다음 주기를 기다리지 않는다.
 * - 같은 작업의 이전 실행이 아직 안 끝났으면 건너뛴다(느린 응답에 요청이 쌓이지 않는다).
 * - 한 작업이 던진 예외가 다른 작업이나 루프를 죽이지 않는다.
 *
 * ## 쓰는 법
 *
 * ```ts
 * useEffect(() => registerPollTask({
 *   id: `dm-messages:${conversationId}`,
 *   intervalMs: 5000,
 *   run: tick,
 * }), [conversationId]);
 * ```
 *
 * 반환값이 해제 함수라 `useEffect` 에서 그대로 return 하면 된다.
 */

export interface PollTask {
  /** 작업 식별자. 같은 id 로 다시 등록하면 이전 등록을 대체한다(화면 재마운트 대비). */
  id: string;
  intervalMs: number;
  run: () => void | Promise<void>;
  /**
   * 화면이 보이지 않을 때도 실행할지. 기본 false.
   * **길안내처럼 화면이 꺼져도 계속 돌아야 하는 작업에만** true 를 준다 — 배터리를 쓰는 선택이므로
   * 왜 필요한지 호출부에 주석을 남길 것.
   */
  runWhenHidden?: boolean;
  /** 등록 즉시 1회 실행할지. 기본 true. */
  runImmediately?: boolean;
}

interface Entry extends Required<Omit<PollTask, 'run'>> {
  run: () => void | Promise<void>;
  nextDueAt: number;
  inFlight: boolean;
}

const tasks = new Map<string, Entry>();
let timer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

const isVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

function runEntry(entry: Entry, now: number): void {
  // 이전 실행이 아직 안 끝났으면 이번 차례는 건너뛴다. 응답이 주기보다 느릴 때
  // 요청이 겹쳐 쌓이는 것을 막는다.
  if (entry.inFlight) {
    entry.nextDueAt = now + entry.intervalMs;
    return;
  }
  entry.inFlight = true;
  entry.nextDueAt = now + entry.intervalMs;
  let result: void | Promise<void>;
  try {
    result = entry.run();
  } catch {
    entry.inFlight = false; // 동기 예외 — 루프는 계속된다
    return;
  }
  if (result && typeof (result as Promise<void>).finally === 'function') {
    void (result as Promise<void>)
      .catch(() => {}) // 작업 하나의 실패가 다른 작업을 막지 않는다
      .finally(() => { entry.inFlight = false; });
  } else {
    entry.inFlight = false;
  }
}

function reschedule(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (tasks.size === 0) return;

  const now = Date.now();
  const visible = isVisible();
  let earliest = Infinity;
  for (const entry of tasks.values()) {
    if (!visible && !entry.runWhenHidden) continue;
    if (entry.nextDueAt < earliest) earliest = entry.nextDueAt;
  }
  // 보이지 않는 동안 돌 작업이 하나도 없으면 타이머를 아예 잡지 않는다.
  // 다시 보이게 되면 visibilitychange 핸들러가 깨운다.
  if (earliest === Infinity) return;

  timer = setTimeout(tick, Math.max(0, earliest - now));
}

function tick(): void {
  timer = null;
  const now = Date.now();
  const visible = isVisible();
  for (const entry of tasks.values()) {
    if (!visible && !entry.runWhenHidden) continue;
    if (entry.nextDueAt <= now) runEntry(entry, now);
  }
  reschedule();
}

function onVisibilityChange(): void {
  if (!isVisible()) { reschedule(); return; }
  // 포그라운드 복귀 — 가드에 막혀 **실행 시각이 지난** 작업만 따라잡는다.
  // 무조건 전부 실행하면 앱 전환을 빠르게 반복할 때 주기와 무관하게 요청이 몰린다.
  const now = Date.now();
  for (const entry of tasks.values()) {
    if (entry.runWhenHidden) continue; // 계속 돌고 있었으므로 따라잡을 것이 없다
    if (entry.nextDueAt <= now) runEntry(entry, now);
  }
  reschedule();
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  visibilityBound = true;
}

/**
 * 폴링 작업을 등록한다. 반환된 함수를 호출하면 해제된다.
 * `useEffect` 의 cleanup 으로 그대로 반환해 쓰는 것을 전제로 한다.
 */
export function registerPollTask(task: PollTask): () => void {
  const entry: Entry = {
    id: task.id,
    intervalMs: task.intervalMs,
    run: task.run,
    runWhenHidden: task.runWhenHidden ?? false,
    runImmediately: task.runImmediately ?? true,
    nextDueAt: Date.now() + task.intervalMs,
    inFlight: false,
  };
  tasks.set(task.id, entry);
  bindVisibility();

  if (entry.runImmediately && (isVisible() || entry.runWhenHidden)) {
    runEntry(entry, Date.now());
  }
  reschedule();

  return () => {
    // 같은 id 가 이미 다른 등록으로 교체됐다면(재마운트) 그 등록을 지우지 않는다.
    if (tasks.get(task.id) === entry) {
      tasks.delete(task.id);
      reschedule();
    }
  };
}

/** 테스트·진단용 — 현재 등록된 작업 id 목록. */
export function registeredPollTaskIds(): string[] {
  return [...tasks.keys()];
}

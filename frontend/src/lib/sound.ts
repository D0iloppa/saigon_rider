// DM 발신/수신 효과음. 브라우저 자동재생 정책으로 play()가 reject되는 경우가 있어
// 조용히 무시한다 — 효과음 실패가 앱 기능(전송/수신)을 막으면 안 된다.
export function playSound(name: 'dm_send' | 'dm_receive' | 'walkie_ptt_start' | 'walkie_ptt_end'): void {
  new Audio(`/sounds/${name}.mp3`).play().catch(() => {});
}

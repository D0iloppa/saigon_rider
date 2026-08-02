import { defineConfig, devices } from '@playwright/test';

/**
 * 브라우저 E2E — 정적 .mjs 계약 테스트로는 잡을 수 없는 "실제 화면이 뜨는지·클릭하면 동작하는지"를
 * 검증한다. 이미 docker compose 로 구동 중인 스택(:18090)을 대상으로 돈다 — 새 스택을 띄우지 않는다.
 * (ai-docs/context/adr.md "검증 하네스" 참조 — 이 프로젝트에는 브라우저 E2E가 이 도입 전까지 없었다)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // dev DB에 계정을 만드는 테스트라 동시성 레이스를 피한다(단순화 우선)
  retries: 0, // 재시도로 flaky를 감추지 않는다 — 실패는 그대로 드러낸다
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:18090',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});

# BizManage sticky tabs + exploration map regression review report

Date: 2026-09-09

## Scope and assumptions

- `BizManage` keeps the existing `TopBar` and store identity layout.
- Only the operations/performance tab row sticks; the store identity scrolls out.
- The map review first ran read-only against the completed map diff. The three findings below were recorded before any follow-up map edits.
- After the supervisor explicitly opened a separate fix phase, only the smallest corrections for those findings were applied. No new permission or coordinate subsystem was added.

## 1. BizManage sticky tabs implementation

`BizManage` already has the correct DOM ownership: `TopBar` is outside `.body`, while `.identity` and `.tabs` are ordered inside `.body`. Because `.body` is the actual `overflow-y:auto` scroll ancestor and begins below the status-bar-aware `TopBar`, `.tabs { position: sticky; top: 0 }` pins the tab row immediately below the whole TopBar without a duplicated safe-area offset.

Changes:

- `frontend/src/pages/biz/BizManage.module.css`: added `position: sticky`, `top: 0`, and `z-index: 10` to `.tabs`.
- `frontend/src/pages/biz/bizManageStickyTabs.contract.test.mjs`: locks the TopBar/body/identity/tabs order, scroll ownership, sticky offset, stacking, and non-sticky identity.
- `BizManage.tsx` did not need structural edits. The existing contract/payment CTA changes were preserved after confirming ownership with the other worker.

Actual browser geometry was attempted with the installed Playwright and `/usr/bin/google-chrome`, using a `/tmp` fixture matching the page flex/scroll structure. Chrome terminated at launch with crashpad `setsockopt: Operation not permitted` / `SIGTRAP` under the sandbox. Per instruction, no alternate browser environment was built. Therefore sticky geometry is verified at the DOM/CSS contract layer, not claimed as device/browser rendering evidence.

## 2. Independent map review findings (read-only phase)

### Finding A — preflight bypass and duplicate raw GPS requests (high)

At map mount, `NeighborhoodMapCanvas` called store `ensureLocation()`, but also called `requestDeviceLocation()` independently for card distances. At the same time, `SaigonMapV5`'s me-dot mount effect called `resolveUsableLocation()` independently. Those two raw calls did not share the store's in-flight promise and could race ahead of the explanatory preflight dialog, as well as violate the session-once measurement contract.

### Finding B — fallback camera/query and card distance used different coordinates (high)

The map and bbox query could fall back to Bến Thành, while `NeighborhoodMapCanvas` retained the raw outside-area GPS in `userPos` and used it for every `BizRichCard` distance. This mixed Bến Thành search results with distances calculated from a different location.

### Finding C — repeated outside-area ticks rewrote identical fallback state (medium)

`useLocationStore.startWatching()` wrote a fresh `{ ...BEN_THANH_FALLBACK }` object on every outside-area tick even if the store was already in the same fallback/reason state. `App.tsx` depends on the coordinate object, so each write causes render/effect cleanup and native watcher resubscription churn.

The existing helper/source policy tests did not cover these React/store integration paths; their labels alone were not treated as runtime evidence.

## 3. Follow-up fixes authorized after review

- Removed `NeighborhoodMapCanvas`'s independent `requestDeviceLocation()`/`userPos` state. Card distances now use the same store `coords` used by exploration, including Bến Thành fallback and `null` for explicit `pinnedAll`.
- Changed the `SaigonMapV5` me-dot mount effect to await `useLocationStore.getState().ensureLocation()` and consume `coords` only when `coordsSource === 'device'`. This shares the preflight/in-flight result and keeps fallback coordinates from drawing a fake me-dot.
- Added an early return when a watcher tick would reproduce the identical fallback source/reason, while retaining the watcher so a later in-area tick can recover to device coordinates.
- Added source contracts for the shared store path, fallback distance source, no fake me-dot, and identical fallback no-op.

## 4. Verification

- `node --test` across 7 focused BizManage/map policy files: **7 files passed, 0 failed**.
- Scoped ESLint over the six touched/reviewed TS/TSX modules: **0 errors**. It reports 60 pre-existing warnings in the large map components; no warning cleanup was attempted.
- `npx tsc -b --pretty false`: **passed**.
- `git diff --check`: **passed**.
- Temporary bundled Zustand store mock (esbuild, `/tmp`): **passed** — an identical outside-area fallback tick caused 0 store writes, while a subsequent in-area tick caused 1 write and restored `coordsSource: 'device'`. Zustand printed only the expected Node/no-storage warning.
- Playwright sticky geometry: **not executed**, because Chrome crashed under the filesystem/process sandbox as described above.

No commit, push, deploy, or Docker rebuild was performed.

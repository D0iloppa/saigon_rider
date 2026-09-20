#!/usr/bin/env node
// 사이공라이더 서비스 플로우 검토 킷 -> 프레임 단위 HTML 스토리보드 생성기
//
// 이 스크립트는 ai-docs/review/260919_service_flow_review_kit.md 를 결정적으로
// 파싱해 index.html 을 생성한다. 킷 본문을 재해석·요약하지 않는다 — 구조를 그대로
// HTML 태그로 옮길 뿐이다. 실행: `node ai-docs/review/storyboard/build.mjs`
// (저장소 루트에서, 인자 없이)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KIT_PATH = path.join(__dirname, '..', '260919_service_flow_review_kit.md');
const OUT_PATH = path.join(__dirname, 'index.html');

const warnings = [];
function warn(msg) {
  warnings.push(msg);
}

// ---------------------------------------------------------------------------
// 0. 로드
// ---------------------------------------------------------------------------

const raw = fs.readFileSync(KIT_PATH, 'utf8');
const lines = raw.split('\n');

// ---------------------------------------------------------------------------
// 1. 유틸 — 인라인 마크다운, 표, 이스케이프
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 킷 문장 자체는 절대 바꾸지 않는다 — `code`·**bold** 표기만 태그로 옮긴다.
function inlineMd(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return t;
}

function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function parseTable(tableLines) {
  const rows = tableLines.filter((l) => l.trim().length > 0).map(splitTableRow);
  if (rows.length === 0) return { header: [], dataRows: [] };
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => !isSeparatorRow(r));
  return { header, dataRows };
}

// "왜 여기" 칸이 "이유 없음"으로 *시작*하는 행만 표시(정확히 킷 §5 열람 목적).
// 굵게(**) 표기는 서식일 뿐이므로 판정 전에 벗겨낸다. 그 밖의 해석은 하지 않는다.
function cellStartsWithNoReason(cell) {
  if (!cell) return false;
  const t = cell.trim().replace(/^\*\*/, '');
  return t.startsWith('이유 없음');
}

function renderTable(tableLines) {
  const { header, dataRows } = parseTable(tableLines);
  if (header.length === 0) return '';
  const whyIdx = header.findIndex((h) => h.trim() === '왜 여기');
  let html = '<table><thead><tr>';
  for (const h of header) html += `<th>${inlineMd(h)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of dataRows) {
    const noReason = whyIdx >= 0 && cellStartsWithNoReason(row[whyIdx]);
    html += `<tr${noReason ? ' class="no-reason"' : ''}>`;
    for (const c of row) html += `<td>${inlineMd(c)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// 필드 본문(레이블 다음 줄들) 하나를 렌더링. 종류(표/코드펜스/평문)를 스스로 판별한다.
function renderFieldBody(fieldLines) {
  const nonEmptyEdgeTrimmed = fieldLines.slice();
  while (nonEmptyEdgeTrimmed.length && nonEmptyEdgeTrimmed[0].trim() === '') nonEmptyEdgeTrimmed.shift();
  while (nonEmptyEdgeTrimmed.length && nonEmptyEdgeTrimmed[nonEmptyEdgeTrimmed.length - 1].trim() === '')
    nonEmptyEdgeTrimmed.pop();

  if (nonEmptyEdgeTrimmed.length === 0) return { kind: 'empty', html: '' };

  if (nonEmptyEdgeTrimmed[0].trim().startsWith('```')) {
    const closeIdx = nonEmptyEdgeTrimmed.findIndex(
      (l, i) => i > 0 && l.trim() === '```'
    );
    if (closeIdx === -1) {
      warn('코드펜스 닫는 ``` 를 찾지 못함 — 펜스 없이 평문 처리: ' + nonEmptyEdgeTrimmed[0]);
    } else {
      const inner = nonEmptyEdgeTrimmed.slice(1, closeIdx);
      return { kind: 'pre', html: `<pre>${esc(inner.join('\n'))}</pre>` };
    }
  }

  if (nonEmptyEdgeTrimmed.every((l) => l.trim() === '' || l.trim().startsWith('|'))) {
    return { kind: 'table', html: renderTable(nonEmptyEdgeTrimmed) };
  }

  const html = nonEmptyEdgeTrimmed
    .filter((l) => l.trim() !== '')
    .map((l) => inlineMd(l))
    .join('<br>');
  return { kind: 'prose', html };
}

// 필드 목록(레이블 있는 "- **X**" 블록들)으로 쪼갠다. 그 앞의 라벨 없는 내용은
// preamble 로 별도 반환(킷 구조상 드물게 등장, 예: F-X-02 FR-1의 표).
const FIELD_LABEL_RE = /^- \*\*(.+?)\*\*(.*)$/;

function splitFields(bodyLines) {
  const labelIdx = [];
  bodyLines.forEach((l, i) => {
    if (FIELD_LABEL_RE.test(l)) labelIdx.push(i);
  });

  const preambleLines = labelIdx.length > 0 ? bodyLines.slice(0, labelIdx[0]) : bodyLines.slice();

  const fields = [];
  for (let k = 0; k < labelIdx.length; k++) {
    const idx = labelIdx[k];
    const nextIdx = k + 1 < labelIdx.length ? labelIdx[k + 1] : bodyLines.length;
    const m = bodyLines[idx].match(FIELD_LABEL_RE);
    const label = m[1];
    const restOfLine = m[2];
    const fieldLines = [];
    if (restOfLine.trim() !== '') fieldLines.push(restOfLine);
    fieldLines.push(...bodyLines.slice(idx + 1, nextIdx));
    fields.push({ label, fieldLines });
  }

  return { preambleLines, fields };
}

function renderPreamble(preambleLines) {
  const trimmed = preambleLines.filter((l) => l.trim() !== '');
  if (trimmed.length === 0) return '';
  // 킷 안에 있는 형태 그대로: 인용문(>), 목록(-), 나머지는 평문/표.
  if (trimmed.every((l) => l.trim().startsWith('|'))) {
    return `<div class="preamble">${renderTable(trimmed)}</div>`;
  }
  const html = trimmed
    .map((l) => {
      const t = l.trim();
      if (t.startsWith('> ')) return `<div class="quote">${inlineMd(t.slice(2))}</div>`;
      if (t.startsWith('- ')) return `<div class="bullet">${inlineMd(t.slice(2))}</div>`;
      return `<div>${inlineMd(t)}</div>`;
    })
    .join('');
  return `<div class="preamble">${html}</div>`;
}

// ---------------------------------------------------------------------------
// 2. 자유형 섹션 렌더러 (메타 표 / B0-1 / B0-3 / B0-4 / B1)
//    프레임 표기 규칙 밖의 일반 마크다운(제목·목록·인용·표·문단)을 처리한다.
// ---------------------------------------------------------------------------

function renderFreeform(sectionLines) {
  const out = [];
  let i = 0;
  const n = sectionLines.length;
  while (i < n) {
    const line = sectionLines[i];
    const t = line.trim();
    if (t === '') {
      i++;
      continue;
    }
    if (/^-{3,}$/.test(t)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^#{2,6}\s/.test(t)) {
      const level = t.match(/^(#{2,6})/)[1].length;
      const text = t.replace(/^#{2,6}\s*/, '');
      out.push(`<h${level}>${inlineMd(text)}</h${level}>`);
      i++;
      continue;
    }
    if (t.startsWith('|')) {
      const tbl = [];
      while (i < n && sectionLines[i].trim().startsWith('|')) {
        tbl.push(sectionLines[i]);
        i++;
      }
      out.push(renderTable(tbl));
      continue;
    }
    if (t.startsWith('> ') || t === '>') {
      const q = [];
      while (i < n && (sectionLines[i].trim().startsWith('>'))) {
        q.push(sectionLines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${q.map(inlineMd).join('<br>')}</blockquote>`);
      continue;
    }
    if (t.startsWith('- ')) {
      const items = [];
      while (i < n && sectionLines[i].trim().startsWith('- ')) {
        items.push(sectionLines[i].trim().slice(2));
        i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${inlineMd(it)}</li>`).join('') + '</ul>');
      continue;
    }
    // 일반 문단: 다음 빈 줄까지 모은다.
    const para = [];
    while (i < n && sectionLines[i].trim() !== '' && !/^#{2,6}\s/.test(sectionLines[i].trim()) &&
      !/^-{3,}$/.test(sectionLines[i].trim()) &&
      !sectionLines[i].trim().startsWith('|') && !sectionLines[i].trim().startsWith('>') &&
      !sectionLines[i].trim().startsWith('- ')) {
      para.push(sectionLines[i].trim());
      i++;
    }
    out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 3. 섹션 경계 찾기
// ---------------------------------------------------------------------------

function findLineIndex(re, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

function sliceSection(startRe, endRe, from = 0) {
  const s = findLineIndex(startRe, from);
  if (s === -1) {
    warn(`섹션 시작을 찾지 못함: ${startRe}`);
    return { lines: [], start: -1, end: -1 };
  }
  const e = findLineIndex(endRe, s + 1);
  const end = e === -1 ? lines.length : e;
  if (e === -1) warn(`섹션 끝을 찾지 못함(끝까지 사용): ${endRe}`);
  return { lines: lines.slice(s + 1, end), start: s, end };
}

const titleLine = lines[0].replace(/^#\s*/, '');

const metaTable = sliceSection(/^\| 항목 \| 값 \|$/, /^---/, 0);
// 표 시작 줄 자체(헤더 행)도 포함해야 하므로 start 줄부터 다시 슬라이스.
const metaTableLines = metaTable.start === -1 ? [] : lines.slice(metaTable.start, metaTable.end).filter((l) => l.trim().startsWith('|'));

const b01 = sliceSection(/^#### B0-1\./, /^#### B0-2\./);
const b03 = sliceSection(/^#### B0-3\./, /^#### B0-4\./);
const b04 = sliceSection(/^#### B0-4\./, /^### B1\./);
const b1 = sliceSection(/^### B1\./, /^### B2\./);

const b01Heading = lines[b01.start].replace(/^####\s*/, '');
const b03Heading = lines[b03.start].replace(/^####\s*/, '');
const b04Heading = lines[b04.start].replace(/^####\s*/, '');
const b1Heading = lines[b1.start].replace(/^###\s*/, '');

// ---------------------------------------------------------------------------
// 3b. B0-3 "판정자(대표) 기존 발언" 표 — 발언 원문 칸만 렌더에서 제거.
//     킷 원본(lines)은 건드리지 않는다 — b03.lines 의 복사본만 고쳐서 렌더에 쓴다.
//     표의 다른 칸(#, 발언이 가리키는 원칙, 현재 사실, 답하는 프레임)은 그대로 유지.
// ---------------------------------------------------------------------------

const quoteRemovals = [];

function scrubJudgeQuoteColumn(sectionLines, headerLabel) {
  const out = sectionLines.slice();
  let i = 0;
  while (i < out.length) {
    if (out[i].trim().startsWith('|')) {
      const tableStart = i;
      let j = i;
      while (j < out.length && out[j].trim().startsWith('|')) j++;
      const headerCells = splitTableRow(out[tableStart]);
      const colIdx = headerCells.findIndex((h) => h.trim() === headerLabel);
      if (colIdx !== -1) {
        for (let k = tableStart + 1; k < j; k++) {
          const cells = splitTableRow(out[k]);
          if (isSeparatorRow(cells)) continue;
          if (cells[colIdx] !== undefined && cells[colIdx].trim() !== '') {
            const rowLabel = (cells[0] || `row${k}`).replace(/\*\*/g, '').trim();
            quoteRemovals.push(`B0-3 표 "${headerLabel}" 열, 행 ${rowLabel}`);
            cells[colIdx] = '—';
            out[k] = '| ' + cells.join(' | ') + ' |';
          }
        }
      }
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

const b03LinesForRender = scrubJudgeQuoteColumn(b03.lines, '발언(요지, 채팅방 안에서)');

// ---------------------------------------------------------------------------
// 4. B2 — 플로우/프레임 파싱
// ---------------------------------------------------------------------------

const b2Start = findLineIndex(/^### B2\./);
const b3Start = findLineIndex(/^### B3\./, b2Start + 1);
if (b2Start === -1 || b3Start === -1) {
  throw new Error('B2/B3 섹션 경계를 찾지 못했습니다 — 킷 구조가 바뀐 것 같습니다.');
}

const F_HEADING_RE = /^#### (F-[A-Za-z0-9]+-\d+)\s*(.*)$/;
const FR_HEADING_RE = /^##### (FR-\d+)\s*(.*)$/;

// 킷 안의 실측 개수(파싱 결과와 별개로, 정규식만으로 재검증하기 위한 카운트)
let kitFCount = 0;
let kitFRCount = 0;
for (let i = b2Start + 1; i < b3Start; i++) {
  if (F_HEADING_RE.test(lines[i])) kitFCount++;
  if (FR_HEADING_RE.test(lines[i])) kitFRCount++;
}

const flowHeadingIdx = [];
for (let i = b2Start + 1; i < b3Start; i++) {
  if (F_HEADING_RE.test(lines[i])) flowHeadingIdx.push(i);
}

const flows = [];
let bareFCount = 0;

for (let fi = 0; fi < flowHeadingIdx.length; fi++) {
  const idx = flowHeadingIdx[fi];
  const nextFlowIdx = fi + 1 < flowHeadingIdx.length ? flowHeadingIdx[fi + 1] : b3Start;
  const m = lines[idx].match(F_HEADING_RE);
  const flowId = m[1];
  const flowTitle = m[2];
  const bodyLines = lines.slice(idx + 1, nextFlowIdx);

  const frIdx = [];
  bodyLines.forEach((l, i) => {
    if (FR_HEADING_RE.test(l)) frIdx.push(i);
  });

  const scenes = [];
  if (frIdx.length === 0) {
    // #### 자체가 하나의 scene.
    bareFCount++;
    const { preambleLines, fields } = splitFields(bodyLines);
    scenes.push({
      sceneId: flowId,
      label: flowId,
      title: flowTitle,
      preambleHtml: renderPreamble(preambleLines),
      fields,
    });
    flows.push({ flowId, flowTitle, introHtml: '', scenes });
    continue;
  }

  const introLines = bodyLines.slice(0, frIdx[0]);
  const introHtml = renderPreamble(introLines);

  for (let k = 0; k < frIdx.length; k++) {
    const fIdx = frIdx[k];
    const fNext = k + 1 < frIdx.length ? frIdx[k + 1] : bodyLines.length;
    const fm = bodyLines[fIdx].match(FR_HEADING_RE);
    const frId = fm[1];
    const frTitle = fm[2];
    const sceneBody = bodyLines.slice(fIdx + 1, fNext);
    const { preambleLines, fields } = splitFields(sceneBody);
    if (preambleLines.some((l) => l.trim() !== '')) {
      warn(`${flowId} ${frId}: 필드 레이블 앞에 라벨 없는 내용이 있습니다(표로 처리했는지 확인 필요).`);
    }
    scenes.push({
      sceneId: `${flowId}__${frId}`,
      label: `${flowId} ${frId}`,
      title: frTitle,
      preambleHtml: renderPreamble(preambleLines),
      fields,
    });
  }

  flows.push({ flowId, flowTitle, introHtml, scenes });
}

const totalScenes = flows.reduce((acc, f) => acc + f.scenes.length, 0);
const expectedScenes = kitFRCount + bareFCount;

if (totalScenes !== expectedScenes) {
  throw new Error(
    `프레임 수 불일치: 생성된 scene ${totalScenes}개, 기대값(FR ${kitFRCount} + FR 없는 F ${bareFCount}) ${expectedScenes}개. 파싱 로직을 점검하세요.`
  );
}
if (totalScenes !== kitFRCount + bareFCount) {
  throw new Error('내부 불일치');
}

// ---------------------------------------------------------------------------
// 5. 알려진 필드 라벨 화이트리스트 — 새 라벨이 나오면 경고만 하고 계속 진행
// ---------------------------------------------------------------------------

const KNOWN_LABEL_PREFIXES = [
  '단계', '상태', '적용 대상', '조건', '와이어', '요소 표', '주행동', '제안', '제안 요약',
  '잃는 것', '실패 시나리오', '근거', '판정', '현재', '당위', '레퍼런스', '판정자에게 반드시 물을 것',
  '대표 지시 이력',
];

for (const flow of flows) {
  for (const scene of flow.scenes) {
    for (const field of scene.fields) {
      const known = KNOWN_LABEL_PREFIXES.some((p) => field.label.startsWith(p));
      if (!known) warn(`알 수 없는 필드 라벨 "${field.label}" — ${scene.sceneId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5b. 요소 표 → 폰 목업 자동 생성
//     새 내용을 지어내지 않는다 — 요소 표에 이미 있는 (영역/요소/무게/왜 여기)
//     데이터를 세로 띠(H→C→B→K) + 오버레이(O) 레이아웃으로 다르게 렌더링할 뿐이다.
// ---------------------------------------------------------------------------

const mockupOkSceneIds = [];
const mockupFailedScenes = []; // { sceneId, reason }
const unmappedWeightValues = []; // { value, sceneId }

const WEIGHT_RULES = [
  { prefixes: ['주행동', '카드 주행동'], css: 'w-primary' },
  { prefixes: ['보조'], css: 'w-secondary' },
  { prefixes: ['숨김'], css: 'w-ghost' },
  { prefixes: ['파괴적'], css: 'w-danger' },
  { prefixes: ['표시'], css: 'w-text' },
];

// 무게 값 → 시각 스타일. 접두 일치. 매핑 안 되면 중립으로 그리되 보고 목록에 쌓는다.
function classifyWeight(rawValue, sceneId) {
  const v = String(rawValue).replace(/\*\*/g, '').trim();
  if (v === '' || v === '—') return 'w-neutral';
  for (const rule of WEIGHT_RULES) {
    if (rule.prefixes.some((p) => v.startsWith(p))) return rule.css;
  }
  unmappedWeightValues.push({ value: v, sceneId });
  return 'w-neutral';
}

const AREA_ORDER = ['H', 'C', 'B', 'K'];

// 영역 값(예: "K(고정 바)", "B(DM)")을 H/C/B/K/O 중 하나로 접두 일치. 그 밖의
// 값(예: "—")은 고정 레이아웃 어디에도 속하지 않으므로 목업에서 조용히 제외한다
// (요소 표 원본은 그대로 남아 있으므로 정보 손실은 없다).
function areaGroup(rawValue) {
  const v = String(rawValue).trim();
  if (v.startsWith('O')) return 'O';
  for (const a of AREA_ORDER) {
    if (v.startsWith(a)) return a;
  }
  return null;
}

function findElementTableField(scene) {
  return scene.fields.find((f) => f.label.startsWith('요소 표'));
}

function buildMockupData(scene) {
  const field = findElementTableField(scene);
  if (!field) return { ok: false, reason: '요소 표 필드 없음' };

  const tableLines = field.fieldLines.filter((l) => l.trim() !== '');
  const { header, dataRows } = parseTable(tableLines);
  const areaIdx = header.findIndex((h) => h.trim() === '영역');
  const elemIdx = header.findIndex((h) => h.trim() === '요소');
  const weightIdx = header.findIndex((h) => h.trim() === '무게');
  const whyIdx = header.findIndex((h) => h.trim() === '왜 여기');

  if (areaIdx === -1 || elemIdx === -1 || weightIdx === -1) {
    return { ok: false, reason: '요소 표에 영역/요소/무게 열이 없음' };
  }

  const bands = { H: [], C: [], B: [], K: [], O: [] };
  for (const row of dataRows) {
    const group = areaGroup(row[areaIdx]);
    if (!group) continue;
    bands[group].push({
      label: row[elemIdx],
      weightCss: classifyWeight(row[weightIdx], scene.sceneId),
      noReason: whyIdx >= 0 && cellStartsWithNoReason(row[whyIdx]),
    });
  }

  const total = AREA_ORDER.concat('O').reduce((acc, k) => acc + bands[k].length, 0);
  if (total === 0) return { ok: false, reason: '요소 표 행이 있으나 영역 값이 H/C/B/K/O 중 어느 것과도 일치하지 않음' };

  return { ok: true, bands };
}

const LEGEND_HTML =
  '<span class="legend-title">범례</span>' +
  '<span class="mock-item w-primary">채움</span><span class="legend-eq">=주행동</span>' +
  '<span class="mock-item w-secondary">외곽선</span><span class="legend-eq">=보조</span>' +
  '<span class="mock-item w-ghost">흐림</span><span class="legend-eq">=숨김</span>' +
  '<span class="mock-item w-danger">위험색</span><span class="legend-eq">=파괴적</span>' +
  '<span class="mock-item w-text">텍스트</span><span class="legend-eq">=표시</span>' +
  '<span class="warn-badge" title="이유 없음">⚠</span><span class="legend-eq">=이유 없음</span>';

function renderMockItem(item) {
  const warn = item.noReason ? ' <span class="warn-badge" title="이유 없음">⚠</span>' : '';
  return `<div class="mock-item ${item.weightCss}">${inlineMd(item.label)}${warn}</div>`;
}

function renderMockup(bands) {
  const bandsHtml = AREA_ORDER.filter((k) => bands[k].length > 0)
    .map(
      (k) =>
        `<div class="mock-band mock-band-${k}"><span class="band-tag">${k}</span><div class="mock-band-items">${bands[
          k
        ]
          .map(renderMockItem)
          .join('')}</div></div>`
    )
    .join('');
  const overlayHtml =
    bands.O.length > 0
      ? `<div class="overlay-tray"><div class="overlay-label">O · 떠 있는 것 / 고정 레이아웃 아님</div><div class="mock-band-items">${bands.O.map(
          renderMockItem
        ).join('')}</div></div>`
      : '';
  return (
    `<div class="mockup-wrap">` +
    `<div class="phone-mock">${bandsHtml || '<div class="mock-empty">고정 띠 없음</div>'}</div>` +
    overlayHtml +
    `<div class="mock-legend">${LEGEND_HTML}</div>` +
    `</div>`
  );
}

function renderMockupSection(scene) {
  const data = buildMockupData(scene);
  if (!data.ok) {
    mockupFailedScenes.push({ sceneId: scene.sceneId, reason: data.reason });
    return `<div class="mockup-none">화면 목업: 요소 표에 영역 정보가 없어 화면을 그릴 수 없음(${esc(
      data.reason
    )}).</div>`;
  }
  mockupOkSceneIds.push(scene.sceneId);
  return `<div class="field"><div class="field-label">화면 목업(자동 생성)</div>${renderMockup(data.bands)}</div>`;
}

// ---------------------------------------------------------------------------
// 5c. 화면 샘플 embed — screens/<sceneId>.html 이 있으면 그것을 iframe srcdoc 으로
//     끼우고(상위), 없으면 5b의 자동 폰 목업으로 폴백한다. 샘플 파일은 이 스크립트가
//     만들지 않는다 — 있으면 쓰고 없으면 조용히 폴백할 뿐.
// ---------------------------------------------------------------------------

const SCREENS_DIR = path.join(__dirname, 'screens');
const EXTERNAL_REF_RE = /(https?:\/\/|<script[^>]*\ssrc\s*=|<link[^>]*\srel\s*=\s*["']?stylesheet)/i;

let sampleEmbedCount = 0;
let sampleFallbackCount = 0;
const sampleExternalRefSkipped = [];

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function findScreenSample(sceneId) {
  const p = path.join(SCREENS_DIR, `${sceneId}.html`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function renderScreenSection(scene) {
  const sampleHtml = findScreenSample(scene.sceneId);
  if (sampleHtml !== null) {
    if (EXTERNAL_REF_RE.test(sampleHtml)) {
      warn(`화면 샘플에 외부 참조가 있어 embed 하지 않고 자동 목업으로 폴백: ${scene.sceneId}`);
      sampleExternalRefSkipped.push(scene.sceneId);
    } else {
      sampleEmbedCount++;
      return (
        `<div class="field"><div class="field-label">화면 샘플(제안 반영)</div>` +
        `<div class="screen-sample"><iframe srcdoc="${escAttr(sampleHtml)}" width="390" height="844"></iframe></div></div>`
      );
    }
  }
  sampleFallbackCount++;
  return renderMockupSection(scene);
}

// ---------------------------------------------------------------------------
// 6. Scene HTML 렌더링 (와이어(현재)/와이어(제안) 나란히 배치 포함)
// ---------------------------------------------------------------------------

function renderScene(scene) {
  const parts = [];
  parts.push(`<section class="scene" id="${esc(scene.sceneId)}">`);
  parts.push(`<h3 class="scene-id">${esc(scene.label)}${scene.title ? ` <span class="scene-title">${inlineMd(scene.title)}</span>` : ''}</h3>`);
  if (scene.preambleHtml) parts.push(scene.preambleHtml);

  const fields = scene.fields;
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    const isWire = f.label.startsWith('와이어');
    const nextIsWire = i + 1 < fields.length && fields[i + 1].label.startsWith('와이어');
    if (isWire && nextIsWire) {
      const a = renderFieldBody(f.fieldLines);
      const b = renderFieldBody(fields[i + 1].fieldLines);
      parts.push('<div class="wire-pair">');
      parts.push(`<div class="wire-col"><div class="field-label">${esc(f.label)}</div>${a.html}</div>`);
      parts.push(`<div class="wire-col"><div class="field-label">${esc(fields[i + 1].label)}</div>${b.html}</div>`);
      parts.push('</div>');
      i += 2;
      continue;
    }
    const r = renderFieldBody(f.fieldLines);
    parts.push(`<div class="field field-${r.kind}"><div class="field-label">${esc(f.label)}</div>${r.html}</div>`);
    i += 1;
  }

  parts.push(renderScreenSection(scene));

  parts.push('</section>');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 7. TOC + 전체 문서 조립
// ---------------------------------------------------------------------------

function renderToc() {
  const items = flows
    .map((flow) => {
      const sub = flow.scenes
        .map((s) => `<li><a href="#${esc(s.sceneId)}">${esc(s.label)}</a></li>`)
        .join('');
      return `<li><span class="toc-flow">${esc(flow.flowId)}</span><ul>${sub}</ul></li>`;
    })
    .join('');
  return `<ul class="toc-list">${items}</ul>`;
}

function renderFlowSection(flow) {
  const parts = [];
  parts.push(`<section class="flow">`);
  parts.push(`<h2 class="flow-id">${esc(flow.flowId)} <span class="flow-title">${inlineMd(flow.flowTitle)}</span></h2>`);
  if (flow.introHtml) parts.push(flow.introHtml);
  for (const scene of flow.scenes) parts.push(renderScene(scene));
  parts.push('</section>');
  return parts.join('\n');
}

const STYLE = `
:root {
  color-scheme: light;
  --border: #d9d9d9;
  --bg-code: #f4f4f4;
  --no-reason-bg: #fff1cc;
  --accent: #2b5fb0;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif;
  color: #1b1b1b;
  background: #fff;
  line-height: 1.55;
}
.layout { display: flex; align-items: flex-start; }
nav.toc {
  position: sticky;
  top: 0;
  width: 260px;
  flex: 0 0 260px;
  max-height: 100vh;
  overflow-y: auto;
  padding: 16px 12px;
  border-right: 1px solid var(--border);
  font-size: 13px;
}
nav.toc h2 { font-size: 14px; margin: 0 0 8px; }
.toc-list, .toc-list ul { list-style: none; margin: 0; padding-left: 0; }
.toc-list > li { margin-bottom: 6px; }
.toc-list ul { padding-left: 12px; }
.toc-flow { font-weight: 700; }
.toc-list a { color: var(--accent); text-decoration: none; }
.toc-list a:hover { text-decoration: underline; }
main { flex: 1 1 auto; min-width: 0; padding: 16px 24px 80px; max-width: 980px; }
h1 { font-size: 22px; margin: 0 0 12px; }
h2.flow-id { font-size: 20px; margin-top: 48px; border-bottom: 3px solid #222; padding-bottom: 4px; }
.flow-title { font-weight: 400; color: #444; }
h3.scene-id {
  font-size: 20px;
  background: #222;
  color: #fff;
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  margin: 28px 0 10px;
}
.scene-title { font-weight: 400; color: #ddd; margin-left: 6px; }
section.scene { border-left: 3px solid var(--border); padding-left: 14px; margin-bottom: 8px; }
.field { margin: 10px 0; }
.field-label { font-weight: 700; font-size: 13px; color: #555; margin-bottom: 3px; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 14px; font-size: 13px; }
th, td { border: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
tr.no-reason { background: var(--no-reason-bg); }
pre {
  background: var(--bg-code);
  border: 1px solid var(--border);
  padding: 10px 12px;
  overflow-x: auto;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  white-space: pre;
}
code { background: var(--bg-code); padding: 0 3px; font-family: Consolas, Menlo, monospace; }
blockquote { border-left: 3px solid var(--accent); margin: 10px 0; padding: 4px 12px; color: #333; background: #f7f9fc; }
.preamble { margin: 6px 0 12px; color: #333; }
.preamble .quote { border-left: 3px solid var(--accent); padding: 4px 12px; background: #f7f9fc; margin: 6px 0; }
.preamble .bullet { padding-left: 12px; }
.wire-pair { display: flex; flex-wrap: wrap; gap: 16px; margin: 10px 0; }
.wire-col { flex: 1 1 320px; min-width: 260px; }
ul { padding-left: 20px; }
p { margin: 8px 0; }
hr.sep { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
.mockup-none { margin: 10px 0; padding: 8px 10px; border: 1px dashed var(--border); color: #777; font-size: 13px; }
.screen-sample { margin: 6px 0; }
.screen-sample iframe { display: block; width: 390px; max-width: 100%; height: 844px; border: 2px solid #222; border-radius: 22px; background: #fff; }
.mockup-wrap { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 18px; margin: 6px 0; }
.phone-mock {
  width: 240px;
  border: 2px solid #222;
  border-radius: 22px;
  padding: 10px 8px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mock-band { border-bottom: 1px dashed var(--border); padding-bottom: 6px; }
.mock-band:last-child { border-bottom: none; padding-bottom: 0; }
.band-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #888;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 0 4px;
  margin-bottom: 4px;
}
.mock-band-items { display: flex; flex-direction: column; gap: 4px; }
.mock-empty { font-size: 12px; color: #999; padding: 6px 0; }
.mock-item {
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 6px;
  line-height: 1.3;
  word-break: break-word;
}
.mock-item.w-primary { background: var(--accent); color: #fff; font-weight: 700; }
.mock-item.w-secondary { background: #fff; border: 1px solid #888; color: #222; }
.mock-item.w-ghost { background: transparent; border: 1px dashed #aaa; color: #999; }
.mock-item.w-danger { background: #b3261e; color: #fff; font-weight: 700; }
.mock-item.w-text { background: transparent; border: none; padding-left: 2px; color: #444; }
.mock-item.w-neutral { background: #f0f0f0; border: 1px solid var(--border); color: #666; }
.warn-badge { color: #a15c00; font-weight: 700; }
.overlay-tray {
  width: 200px;
  border: 2px dashed #888;
  border-radius: 14px;
  padding: 8px;
  background: #fff8e6;
}
.overlay-label { font-size: 10px; font-weight: 700; color: #886400; margin-bottom: 6px; }
.mock-legend {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}
.legend-title { font-weight: 700; margin-right: 4px; }
.legend-eq { margin-right: 8px; }
@media (max-width: 780px) {
  .layout { flex-direction: column; }
  nav.toc { position: static; width: 100%; max-height: none; border-right: none; border-bottom: 1px solid var(--border); }
  main { padding: 16px; }
}
`;

const headHtml = [
  `<h1>${inlineMd(titleLine)}</h1>`,
  renderTable(metaTableLines),
  `<section id="B0-1"><h2>${inlineMd(b01Heading)}</h2>${renderFreeform(b01.lines)}</section>`,
  `<section id="B0-3"><h2>${inlineMd(b03Heading)}</h2>${renderFreeform(b03LinesForRender)}</section>`,
  `<section id="B0-4"><h2>${inlineMd(b04Heading)}</h2>${renderFreeform(b04.lines)}</section>`,
  `<section id="B1"><h2>${inlineMd(b1Heading)}</h2>${renderFreeform(b1.lines)}</section>`,
  '<hr class="sep">',
].join('\n');

const flowsHtml = flows.map(renderFlowSection).join('\n<hr class="sep">\n');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>사이공라이더 서비스 플로우 스토리보드</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${STYLE}</style>
</head>
<body>
<div class="layout">
<nav class="toc">
<h2>프레임 목차</h2>
${renderToc()}
</nav>
<main>
${headHtml}
${flowsHtml}
</main>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT_PATH, html, 'utf8');

// ---------------------------------------------------------------------------
// 8. 리포트
// ---------------------------------------------------------------------------

for (const w of warnings) {
  process.stderr.write(`[경고] ${w}\n`);
}

const uniqueUnmappedWeights = [...new Set(unmappedWeightValues.map((u) => u.value))];

process.stdout.write(
  `킷의 F-ID: ${kitFCount}개, FR-ID: ${kitFRCount}개 (FR 없는 F: ${bareFCount}개)\n` +
    `파싱된 프레임(scene) 수: ${totalScenes} / 킷 기준 기대값: ${expectedScenes}\n` +
    `경고 ${warnings.length}건\n` +
    `--- B0-3 판정자 발언 인용 제거(렌더 전용) ---\n` +
    `제거 위치 ${quoteRemovals.length}건: ${quoteRemovals.join(' / ')}\n` +
    `--- 화면 샘플 embed / 자동 목업 폴백 ---\n` +
    `샘플 embed: ${sampleEmbedCount}개\n` +
    `자동 목업 폴백: ${sampleFallbackCount}개` +
    (sampleExternalRefSkipped.length
      ? ` (외부 참조로 건너뛴 샘플: ${sampleExternalRefSkipped.join(', ')})\n`
      : '\n') +
    `--- 폰 목업 자동생성 ---\n` +
    `목업 생성 성공: ${mockupOkSceneIds.length}개\n` +
    `목업 생성 불가: ${mockupFailedScenes.length}개` +
    (mockupFailedScenes.length
      ? ` -> ${mockupFailedScenes.map((s) => `${s.sceneId}(${s.reason})`).join(', ')}\n`
      : '\n') +
    `매핑 안 된 무게 값: ${uniqueUnmappedWeights.length}개` +
    (uniqueUnmappedWeights.length ? ` -> ${uniqueUnmappedWeights.join(', ')}\n` : '\n') +
    `출력: ${path.relative(process.cwd(), OUT_PATH)}\n`
);

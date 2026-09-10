# -*- coding: utf-8 -*-
"""qm_recall.py — 기록 자동 소환 (T_RECALL) · 표준 도구 · 전 프로젝트 공통 · stdlib 전용.

★왜 (대표님 2026-08-29): 과거 작업을 md 에 적어도 **참조하지 못하고 같은 실수를 반복**한다.
  강제 규칙을 늘려도 소용없다 — 게으름이 아니라 **찾아야 할 것이 있는 줄 모르기 때문**이다.
  세션 시작 1회 주입(SessionStart)은 그 뒤의 질문을 못 본다. 코드 그래프(codebase-memory)는
  주석 속 결정("바꾸지 마라")과 한국어 md 를 못 찾는다(2026-08-29 실측).
  ⇒ **매 질문마다, 내 판단과 무관하게, 자동으로** 관련 기록을 찾아 컨텍스트에 넣는다.

★실측이 정한 설계 (2026-08-29 · Haiku 2콜):
  1) 코퍼스 45k 토큰을 통째로 주면 **34초·$0.24/콜** — 매 턴 불가. → 1단계 어휘 필터(0원·수십 ms)로
     후보 25줄을 추리고, 2단계 LLM 은 **번호만** 고른다(≈4k 토큰).
  2) LLM 이 "왜 중요한가"를 **요약하면 거기서 환각이 들어온다** — 실측: 출처 오귀속 1건 · 오도 요약 1건
     ("2개 DB 동시 연결 완결" = 실제와 정반대). ⇒ **LLM 은 고르기만, 출력은 인덱스 원문 그대로.**
  3) 사고 5건 중 4건은 "몰라서 못 찾은 것"(질문·파일에 단서가 있다) — 이 도구가 잡는다.
     단서가 지시문에 없는 1건(골든셋 expect)은 **계약 테스트**가 맞는 처방이다. 만능이 아니다.

★계약
  · 기억 폴더 = 레포 `.agent_memory/` **또는** Claude 자동 메모리 `~/.claude/projects/<slug>/memory/`
    (둘 다 색인 · junction 이면 중복 제거). 둘 다 없는 프로젝트에서는 **무출력·0 토큰**.
  · 실패는 조용히 흡수한다 — 이 도구가 대표님의 질문을 막거나 지연시키면 그것이 사고다.
  · 중첩 호출 금지: env QM_RECALL_NESTED=1 이면 즉시 종료(2단계가 띄우는 claude -p 가 자기 hook 을
    다시 부르는 무한 재귀 차단).
  · 정본 = querymind 레포 `scripts/hooks/qm_recall.py`(git). 전역 `~/.claude/hooks/qm_recall.py` 는 사본.
    (global_memory_guard.ps1 과 같은 배치 — 전역 ~/.claude 는 다른 PC 로 따라가지 않는다.)

사용 (Claude Code hooks · 전역 settings.json):
  UserPromptSubmit : python ~/.claude/hooks/qm_recall.py --event prompt
  PreToolUse Edit|Write : python ~/.claude/hooks/qm_recall.py --event pretool
  수동: python qm_recall.py --event build [--root DIR] · --event test (회귀 세트) · --event query "질문"
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

VERSION = "1.0.0"
TOP_K = 3
CANDIDATES_FOR_LLM = 25
LLM_MODEL = os.environ.get("QM_RECALL_MODEL", "claude-haiku-4-5-20251001")
# ★2026-08-29 실측: 회귀 6건 중 LLM 단계가 제때 응답한 것은 1건뿐(나머지 15초 타임아웃 → 어휘 폴백),
#   그 1건은 오답을 골랐다. 어휘 단계만으로 4/5. ⇒ hook 에서는 **어휘만**(0.4초) 이 기본이고,
#   LLM 단계는 QM_RECALL_LLM=1 로 켠다(수동 query/test 나 지연을 감수할 때).
LLM_DEFAULT_ON = os.environ.get("QM_RECALL_LLM") == "1"
LLM_TIMEOUT_SEC = float(os.environ.get("QM_RECALL_LLM_TIMEOUT", "15"))
LINE_MAX = 220
MAX_FILES_SCAN = 6000

EXCLUDE_DIRS = {".git", ".venv", "venv", "node_modules", "dist", "build", ".pg", "scratchpad",
                "__pycache__", "run", ".artifacts", ".mypy_cache", ".pytest_cache", "site-packages",
                "bindata", ".cache"}
MEMORY_EXCLUDE_PREFIX = "_"          # _MEMORY_ARCHIVE_*.md · _relay_*.md — 노이즈가 상위를 독점한다
CODE_EXT = {".py", ".json", ".ps1", ".sh", ".ts", ".tsx"}
STAR = "★"

# ASCII 식별자(3+) · 한글 연속(2+). 한글은 **문자 bigram** 으로 색인한다 — 조사·띄어쓰기 차이를
# 형태소 분석 없이 흡수한다("재고 금액"·"재고금액은"·"재고금액" 이 같은 bigram 을 낸다).
_ASCII = re.compile(r"[A-Za-z_][A-Za-z0-9_\-\.]{1,}")
_PARTICLE = set("이가을를은는에의로도서과와고해면다요며게지만나야까든")   # bigram 둘째 글자가 이것이면 조사/어미 조각
_HANGUL = re.compile(r"[가-힣]{2,}")
_STOP_ASCII = {"the", "and", "for", "with", "that", "this", "from", "not", "are", "was", "def",
               "return", "import", "self", "none", "true", "false", "str", "int", "list", "dict",
               "https", "http", "com", "www", "md", "py", "json"}
_STOP_BIGRAM = {"하다", "한다", "된다", "있다", "없다", "이다", "것이", "것을", "에서", "으로",
                "그리", "리고", "하지", "지만", "때문", "위해", "대해", "관련", "확인", "필요",
                "사용", "가능", "해야", "경우", "우리", "지금", "다음", "이것", "그것"}


def _terms(text: str) -> set[str]:
    out: set[str] = set()
    for m in _ASCII.finditer(text):
        raw = m.group(0)
        parts = [raw] + re.split(r"[\-\._]+", raw)          # QM-MULTIDB → qm-multidb · qm · multidb
        for w0 in parts:
            w = w0.lower().strip(".-_")
            ok = len(w) >= 3 or (len(w) == 2 and w0.isupper())   # DB·PG·UI 같은 2글자 대문자 식별자
            if ok and w not in _STOP_ASCII:
                out.add(w)
    for m in _HANGUL.finditer(text):
        run = m.group(0)
        for i in range(len(run) - 1):
            bg = run[i:i + 2]
            if bg[1] in _PARTICLE or bg in _STOP_BIGRAM:
                continue
            out.add(bg)
    return out


# ---------------------------------------------------------------- 루트·캐시
def _auto_memory_dir(project_path: Path) -> Path | None:
    """Claude Code 자동 메모리 폴더 — ~/.claude/projects/<slug>/memory. slug = 경로의 비영숫자를 '-' 로.
    실측: C:\\insang\\kr_s3_engine → C--insang-kr-s3-engine (밑줄도 '-')."""
    home = Path(os.environ.get("USERPROFILE") or Path.home())
    slug = re.sub(r"[^A-Za-z0-9]", "-", str(project_path))
    d = home / ".claude" / "projects" / slug / "memory"
    return d if d.is_dir() and any(d.glob("*.md")) else None


def locate(start: Path) -> tuple[Path, list[Path]] | None:
    """(루트, 기억 폴더들). 레포 `.agent_memory/` **또는** Claude 자동 메모리 — 둘 다 없으면 None(무출력).
    ★junction(querymind·kr_s3 처럼 자동 메모리가 .agent_memory 를 가리킴)은 realpath 로 중복 제거."""
    p = start.resolve()
    repo_root, repo_mem, auto_root, auto_mem = None, None, None, None
    for _ in range(6):
        if repo_root is None and (p / ".agent_memory").is_dir():
            repo_root, repo_mem = p, p / ".agent_memory"
        if auto_root is None:
            d = _auto_memory_dir(p)
            if d is not None:
                auto_root, auto_mem = p, d
        if p.parent == p:
            break
        p = p.parent
    root = repo_root or auto_root
    if root is None:
        return None
    mems: list[Path] = []
    seen: set[str] = set()
    for m in (repo_mem, auto_mem):
        if m is None:
            continue
        key = os.path.realpath(str(m)).lower()
        if key not in seen:
            seen.add(key)
            mems.append(m)
    return root, mems


def find_root(start: Path) -> Path | None:               # (호환용)
    loc = locate(start)
    return loc[0] if loc else None


def cache_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    d = Path(base) / "qm_recall"
    d.mkdir(parents=True, exist_ok=True)
    return d


def cache_path(root: Path, mem_dirs: list[Path] | None = None) -> Path:
    key = str(root).lower() + "|" + "|".join(sorted(str(m).lower() for m in (mem_dirs or [])))
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    return cache_dir() / f"index_{h}.json"


# ---------------------------------------------------------------- 인덱스 구축
def _md_line_strong(s: str) -> bool:
    return s.startswith("#") or STAR in s or s.startswith("- [") or s.startswith("description:")


def _is_summary_line(s: str) -> bool:
    """큐레이션된 요약줄 — 파일 설명·인덱스 항목. 사람이 '이 파일은 무엇' 이라고 적어둔 자리라 가중한다."""
    return s.startswith("description:") or s.startswith("- [")


def _code_line_strong(s: str) -> bool:
    return STAR in s or re.search(r"\bT_[A-Z][A-Z0-9_]{2,}", s) is not None


def _iter_sources(root: Path, mem_dirs: list[Path] | None = None):
    """(경로, 종류) — 기록(md) 과 코드 결정(★/T_ 줄)만."""
    for mem in (mem_dirs or [root / ".agent_memory"]):
        for f in sorted(mem.glob("*.md")):
            if f.name.startswith(MEMORY_EXCLUDE_PREFIX):
                continue
            yield f, "memory"
    # ★자동 메모리만 있는 루트(C:\ 같은 곳)에서 코드·docs 를 훑으면 재앙이다 — 레포 표식이 있을 때만
    if not ((root / ".git").exists() or (root / ".agent_memory").is_dir() or (root / "CLAUDE.md").is_file()):
        return
    for name in ("CLAUDE.md", "README.md"):
        f = root / name
        if f.is_file():
            yield f, "memory"
    docs = root / "docs"
    if docs.is_dir():
        for f in sorted(docs.rglob("*.md")):
            if any(part in EXCLUDE_DIRS or part.startswith(".") for part in f.relative_to(root).parts):
                continue
            yield f, "docs"
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        # ★가지치기: 제외 디렉터리는 들어가지도 않는다 — rglob 은 훑고 나서 거르느라 32초가 걸렸다
        dirnames[:] = [d for d in dirnames
                       if d not in EXCLUDE_DIRS and not (d.startswith(".") and d != ".agent_memory")
                       and not (Path(dirpath) == root and d in (".agent_memory", "docs"))]
        for name in filenames:
            if n > MAX_FILES_SCAN:
                return
            if os.path.splitext(name)[1] not in CODE_EXT:
                continue
            n += 1
            yield Path(dirpath) / name, "code"


def _parse_file(f: Path, rel: str, kind: str) -> list[dict]:
    try:
        lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:                                        # noqa: BLE001
        return []
    out: list[dict] = []
    strong = _md_line_strong if kind != "code" else _code_line_strong
    kept = 0
    for i, ln in enumerate(lines, start=1):
        s = ln.strip()
        if len(s) < 8 or not strong(s):
            continue
        terms = _terms(s)
        if not terms:
            continue
        kept += 1
        if kept > (200 if kind == "code" else 400):
            break                                            # 세션로그처럼 긴 파일은 앞(최신)만
        weight = 1.0 + (0.15 * min(s.count(STAR), 3))
        if kind == "memory":
            weight *= 1.1
        if kind != "code" and _is_summary_line(s):
            weight *= 2.0
        out.append({"f": rel, "l": i, "t": sorted(terms), "w": round(weight, 3), "s": s[:LINE_MAX]})
    return out


def build_index(root: Path, prev: dict | None = None, mem_dirs: list[Path] | None = None) -> dict:
    """증분: prev 의 파일별 mtime 과 같으면 다시 읽지 않는다(첫 빌드만 전량)."""
    t0 = time.time()
    prev_files = (prev or {}).get("files") or {}
    files: dict[str, dict] = {}
    entries: list[dict] = []
    df: dict[str, int] = defaultdict(int)
    reused = 0
    for f, kind in _iter_sources(root, mem_dirs):
        try:
            rel = str(f.relative_to(root)).replace("\\", "/")
        except ValueError:
            rel = "memory/" + f.name                         # Claude 자동 메모리(레포 밖)
        try:
            mt = f.stat().st_mtime
        except Exception:                                    # noqa: BLE001
            continue
        pf = prev_files.get(rel)
        if pf and pf.get("m") == mt:
            ents = pf["e"]
            reused += 1
        else:
            ents = _parse_file(f, rel, kind)
        files[rel] = {"m": mt, "e": ents}
        entries.extend(ents)
        for e in ents:
            for tm in e["t"]:
                df[tm] += 1
    return {"version": VERSION, "root": str(root), "built": time.time(), "checked": time.time(),
            "n_files": len(files), "n": len(entries), "files": files,
            "reused": reused, "build_ms": int((time.time() - t0) * 1000)}


def _hydrate(idx: dict) -> dict:
    """캐시(files 만 저장)에서 entries·df 를 파생한다 — 14k 항목 기준 수십 ms."""
    if "entries" in idx and "df" in idx:
        return idx
    entries: list[dict] = []
    df: dict[str, int] = defaultdict(int)
    for pf in (idx.get("files") or {}).values():
        for e in pf["e"]:
            entries.append(e)
            for tm in e["t"]:
                df[tm] += 1
    idx["entries"] = entries
    idx["df"] = df
    idx["n"] = len(entries)
    return idx


def _persist(idx: dict, cp: Path) -> None:
    slim = {k: v for k, v in idx.items() if k not in ("entries", "df")}
    try:
        cp.write_text(json.dumps(slim, ensure_ascii=False), encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass


def _sources_newer_than(root: Path, ts: float, mem_dirs: list[Path] | None = None) -> bool:
    """캐시보다 새 파일이 있나 — 기록·코드 전부 stat 만 본다(수백 ms 이내)."""
    try:
        for f, _kind in _iter_sources(root, mem_dirs):
            if f.stat().st_mtime > ts:
                return True
    except Exception:                                        # noqa: BLE001
        return True
    return False


FRESH_CHECK_SEC = 300


def load_index(root: Path, force: bool = False, mem_dirs: list[Path] | None = None) -> dict:
    """캐시 우선. 파일 변경 검사(수천 파일 stat)는 5분에 1회만 — 매 턴 비용을 수십 ms 로 묶는다."""
    cp = cache_path(root, mem_dirs)
    if not force and cp.is_file():
        try:
            idx = json.loads(cp.read_text(encoding="utf-8"))
            if idx.get("version") == VERSION:
                now = time.time()
                if now - idx.get("checked", 0) < FRESH_CHECK_SEC:
                    return _hydrate(idx)
                if not _sources_newer_than(root, idx.get("built", 0), mem_dirs):
                    idx["checked"] = now
                    _persist(idx, cp)
                    return _hydrate(idx)
        except Exception:                                    # noqa: BLE001
            pass
    prev = None
    if cp.is_file():
        try:
            prev = json.loads(cp.read_text(encoding="utf-8"))
        except Exception:                                    # noqa: BLE001
            prev = None
    idx = build_index(root, prev, mem_dirs)
    _persist(idx, cp)
    return _hydrate(idx)


# ---------------------------------------------------------------- 1단계: 어휘 검색
HIGH_DF_RATIO = 0.02      # 전체 항목의 2% 넘게 등장하는 토큰은 신호가 아니다


def lexical(idx: dict, query: str, k: int, exclude_file: str | None = None,
            per_file: int = 2, summary_only: bool = False) -> list[dict]:
    n = max(1, idx["n"])
    df = idx["df"]
    q = {t for t in _terms(query) if df.get(t, 0) <= HIGH_DF_RATIO * n}
    if not q:
        return []
    idf = {t: math.log((n + 1) / (df.get(t, 0) + 1)) for t in q}
    scored = []
    for e in idx["entries"]:
        if exclude_file and e["f"] == exclude_file:
            continue
        if summary_only and not _is_summary_line(e["s"]):
            continue
        hit = q.intersection(e["t"])
        if not hit:
            continue
        # 상위 idf 4개만 합산 — 흔한 조각 여러 개가 정확한 조각 둘을 이기지 못하게(포화)
        sc = sum(sorted((idf[t] for t in hit), reverse=True)[:4]) * e["w"]
        scored.append((sc, e))
    scored.sort(key=lambda x: -x[0])
    out: list[dict] = []
    seen: dict[str, int] = defaultdict(int)
    for sc, e in scored:
        if seen[e["f"]] >= per_file:
            continue
        seen[e["f"]] += 1
        out.append({**e, "score": round(sc, 3)})
        if len(out) >= k:
            break
    return out


# ---------------------------------------------------------------- 2단계: LLM 선택(번호만)
def llm_pick(query: str, cands: list[dict], k: int) -> list[int] | None:
    """후보 번호만 고르게 한다. 실패·타임아웃 = None(호출부가 어휘 순위로 폴백)."""
    if os.environ.get("QM_RECALL_NO_LLM") == "1" or not cands:
        return None
    listing = "\n".join(f"{i + 1}) [{c['f']}:{c['l']}] {c['s'][:160]}" for i, c in enumerate(cands))
    prompt = (
        "아래 [질문]에 착수하기 전에 반드시 먼저 읽어야 할 기록을 [후보] 중에서 고른다. "
        f"가장 관련 높은 것부터 최대 {k}개의 **번호만** 쉼표로 출력하라(예: 3,1,7). "
        "관련이 정말 없으면 0 만 출력. 설명·요약·다른 말 금지.\n\n"
        f"[질문]\n{query.strip()[:1200]}\n\n[후보]\n{listing}\n"
    )
    env = dict(os.environ, QM_RECALL_NESTED="1")
    try:
        r = subprocess.run(
            ["claude", "-p", "--model", LLM_MODEL, "--output-format", "text"],
            input=prompt.encode("utf-8"), capture_output=True, timeout=LLM_TIMEOUT_SEC,
            cwd=str(cache_dir()), env=env, shell=(os.name == "nt"),
        )
        text = r.stdout.decode("utf-8", errors="replace")
    except Exception:                                        # noqa: BLE001
        return None
    nums = [int(x) for x in re.findall(r"\d+", text)]
    picks = [x - 1 for x in nums if 1 <= x <= len(cands)]
    if not picks:
        return [] if "0" in nums else None
    seen, out = set(), []
    for p in picks:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out[:k]


def recall(idx: dict, query: str, k: int = TOP_K, use_llm: bool = True,
           exclude_file: str | None = None) -> tuple[list[dict], str]:
    cands = lexical(idx, query, CANDIDATES_FOR_LLM, exclude_file=exclude_file, per_file=3)
    if use_llm:
        # 파일 요약줄(description·인덱스 항목) 풀을 섞는다 — "2개 DB 동시" ↔ "멀티-DB" 처럼
        # 어휘로 못 잇는 것을 LLM 이 요약줄을 보고 잇게 한다.
        pool = lexical(idx, query, 15, exclude_file=exclude_file, per_file=1, summary_only=True)
        seen = {(c["f"], c["l"]) for c in cands}
        cands = cands + [c for c in pool if (c["f"], c["l"]) not in seen]
    if not cands:
        return [], "none"
    if use_llm:
        picks = llm_pick(query, cands, k)
        if picks is not None:
            return [cands[i] for i in picks], "llm"
    return cands[:k], "lexical"


# ---------------------------------------------------------------- 출력
def render(hits: list[dict], mode: str, header: str) -> str:
    if not hits:
        return ""
    lines = [f"=== 기록 소환 qm_recall · {header} · {len(hits)}건 ({mode}) — 착수 전 각 건을 읽고 "
             f"'확인' 또는 '무관' 으로 답하라 ==="]
    for i, h in enumerate(hits, start=1):
        lines.append(f"{i}) {h['f']}:{h['l']} · {h['s'][:LINE_MAX]}")
    return "\n".join(lines)


def _read_hook_input() -> dict:
    try:
        raw = sys.stdin.buffer.read()
        return json.loads(raw.decode("utf-8", errors="replace")) if raw.strip() else {}
    except Exception:                                        # noqa: BLE001
        return {}


def _markers_in_file(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:                                        # noqa: BLE001
        return []
    cnt: dict[str, int] = defaultdict(int)
    for m in re.finditer(r"\bT_[A-Z][A-Z0-9_]{2,}", text):
        cnt[m.group(0)] += 1
    return [k for k, _ in sorted(cnt.items(), key=lambda kv: -kv[1])[:8]]


# ---------------------------------------------------------------- 이벤트
def ev_prompt(root: Path, data: dict, use_llm: bool, mem: list[Path] | None = None) -> str:
    q = (data.get("prompt") or "").strip()
    if len(q) < 4:
        return ""
    idx = load_index(root, mem_dirs=mem)
    hits, mode = recall(idx, q, TOP_K, use_llm)
    return render(hits, mode, "이 질문 관련")


def ev_pretool(root: Path, data: dict, mem: list[Path] | None = None) -> str:
    ti = data.get("tool_input") or {}
    fp = ti.get("file_path") or ti.get("path") or ""
    if not fp:
        return ""
    p = Path(fp)
    try:
        rel = str(p.resolve().relative_to(root)).replace("\\", "/")
    except Exception:                                        # noqa: BLE001
        rel = p.name
    if rel.startswith(".agent_memory/") or rel.startswith("scratchpad/"):
        return ""                                            # 기록 자체를 고칠 땐 소환 불요
    markers = _markers_in_file(p) if p.is_file() else []
    q = " ".join([p.stem, p.name] + markers)
    idx = load_index(root, mem_dirs=mem)
    # ★1블록: 편집 대상 파일 **자신의** ★ 경고를 점수와 무관하게 먼저 낸다(★ 많은 순).
    #   "이 값은 nano 가 정답이다. 바꾸지 마라" 는 바로 그 파일(pricing.py:49) 안에 있었는데 파일명도
    #   T_ 마커도 없는 줄이라 어휘 점수로는 닿지 않는다 — 그것을 못 본 것이 2026-08-13 사고였다.
    own = [e for e in idx["entries"] if e["f"] == rel and STAR in e["s"]]
    own.sort(key=lambda e: (-e["s"].count(STAR), e["l"]))
    own = own[:TOP_K]
    # 2블록: 다른 기록에서의 관련 줄(파일명·마커 기준 · 빨라야 하므로 어휘만)
    hits, mode = recall(idx, q, TOP_K, use_llm=False, exclude_file=rel)
    parts = []
    if own:
        parts.append(render(own, "이 파일 안의 ★ 경고", f"편집 대상 {p.name} 자체"))
    if hits:
        parts.append(render(hits, mode, f"편집 대상 {p.name} 관련 기록"))
    return "\n".join(parts)


def ev_test(root: Path, use_llm: bool, mem: list[Path] | None = None) -> int:
    cases_p = root / ".agent_memory" / "recall_cases.json"
    if not cases_p.is_file():
        print(f"NO_CASES {cases_p}")
        return 0
    cases = json.loads(cases_p.read_text(encoding="utf-8"))
    idx = load_index(root, force=True, mem_dirs=mem)
    print(f"INDEX files={idx['n_files']} entries={idx['n']} build={idx['build_ms']}ms  llm={'on' if use_llm else 'off'}")
    fails = 0
    gaps = 0
    for c in cases:
        hits, mode = recall(idx, c["query"], c.get("k", TOP_K), use_llm)
        ok = any(any(exp in h["f"] for exp in c["expect_any_file"]) for h in hits)
        tag = "PASS" if ok else ("GAP " if c.get("known_gap") else "FAIL")
        if not ok:
            if c.get("known_gap"):
                gaps += 1                                    # 알려진 한계 — 정직하게 표시만(회귀 아님)
            else:
                fails += 1
        print(f"[{tag}] {c['id']} ({mode}) → {[h['f'] + ':' + str(h['l']) for h in hits]}")
        if not ok:
            print(f"       expected one of: {c['expect_any_file']}")
    print(f"RESULT {len(cases) - fails - gaps}/{len(cases) - gaps} passed · known_gap={gaps}")
    return 1 if fails else 0


def ev_init(start: Path) -> int:
    """레포에 git 추적 기억 폴더 골격을 만든다(이미 있으면 건드리지 않는다).
    Claude 자동 메모리만 쓰는 프로젝트는 이것 없이도 소환된다 — 팀·PC 간 공유가 필요할 때만."""
    root = start.resolve()
    mem = root / ".agent_memory"
    made = []
    mem.mkdir(exist_ok=True)
    skel = {
        "MEMORY.md": ("# MEMORY.md — 살아있는 기억 인덱스\n\n"
                      "> 세션 시작 시 이 인덱스를 먼저 읽고 관련 항목 파일을 펼쳐 읽어라.\n"
                      "> **파일당 사실 1개 · 인덱스 한 줄 200자 이내**(넘으면 끝이 잘려 로드된다).\n"
                      "> 형식: `- [제목](파일명.md) — 한 줄 요약`\n\n## feedback (협업 약속)\n\n## project (진행상황·결정·검증)\n\n## reference\n"),
        "INDEX_ARCHIVE.md": "# INDEX_ARCHIVE.md — 종결 트랙 인덱스(검색용 · 손댈 일 생기면 활성으로 올린다)\n",
        "recall_cases.json": "[]\n",
    }
    for name, body in skel.items():
        f = mem / name
        if not f.exists():
            f.write_text(body, encoding="utf-8")
            made.append(name)
    print(f"INIT {mem} · created={made or '없음(이미 있음)'}")
    print("기록 규약: 파일당 사실 1개 · 앞머리 `description:` 한 줄이 소환의 핵심 · 중요 줄엔 ★ · 코드 결정엔 T_ 마커+★ 주석")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--event", choices=["prompt", "pretool", "build", "test", "query", "init"], required=True)
    ap.add_argument("--root", default=None)
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("text", nargs="?", default="")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                                        # noqa: BLE001
        pass
    if os.environ.get("QM_RECALL_NESTED") == "1":
        return 0
    data = _read_hook_input() if a.event in ("prompt", "pretool") else {}
    start = Path(a.root) if a.root else Path(data.get("cwd") or os.getcwd())
    if a.event == "init":
        return ev_init(start)
    loc = locate(start)
    if loc is None:
        return 0                                             # 기록 없는 프로젝트 = 무출력
    root, mem = loc
    use_llm = (not a.no_llm) and (LLM_DEFAULT_ON or a.event in ("test", "query"))
    try:
        if a.event == "prompt":
            out = ev_prompt(root, data, use_llm, mem)
        elif a.event == "pretool":
            out = ev_pretool(root, data, mem)
        elif a.event == "build":
            idx = load_index(root, force=True, mem_dirs=mem)
            out = (f"BUILT files={idx['n_files']} entries={idx['n']} in {idx['build_ms']}ms "
                   f"→ {cache_path(root, mem)} · memory={[str(m) for m in mem]}")
        elif a.event == "test":
            return ev_test(root, use_llm, mem)
        else:
            idx = load_index(root, mem_dirs=mem)
            hits, mode = recall(idx, a.text, TOP_K, use_llm)
            out = render(hits, mode, "query")
        if out:
            print(out)
    except Exception as e:                                   # noqa: BLE001
        # 이 도구는 절대 대표님의 작업을 막지 않는다 — 실패는 한 줄로만 남긴다.
        print(f"(qm_recall 실패 · 무시 가능: {type(e).__name__}: {str(e)[:80]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

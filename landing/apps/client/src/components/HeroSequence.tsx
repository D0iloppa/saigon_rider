/* @section: hero-sequence */
import { Fragment, useEffect, useReducer, useRef, useState } from "react";

const QUESTIONS = [
  { text: "이번 달 거래처별 수주 금액 알려줘", label: "기업 · ERP", sql: "SELECT customer_name, SUM(order_amount) AS total\nFROM   orders WHERE order_month = :month\nGROUP  BY customer_name ORDER BY total DESC", rows: [["거래처 A", "집계값"], ["거래처 B", "집계값"], ["거래처 C", "집계값"], ["거래처 D", "집계값"], ["거래처 E", "집계값"]], audit: "audit logged · analyst · result rows · read-only" },
  { text: "학과별 재학생 수는?", label: "대학 · 학사시스템", sql: "SELECT department_name, COUNT(*) AS students\nFROM   enrollment\nWHERE  status = 'active'\nGROUP  BY department_name ORDER BY students DESC", rows: [["학과 A", "집계값"], ["학과 B", "집계값"], ["학과 C", "집계값"], ["학과 D", "집계값"], ["학과 E", "집계값"]], audit: "audit logged · registrar · result rows · read-only" },
  { text: "부서별 예산 집행률은?", label: "공공기관 · 행정시스템", sql: "SELECT department, budget, executed\nFROM   budget_execution\nWHERE  fiscal_period = :period\nORDER  BY executed DESC", rows: [["부서 A", "집계값"], ["부서 B", "집계값"], ["부서 C", "집계값"], ["부서 D", "집계값"], ["부서 E", "집계값"]], audit: "audit logged · admin · result rows · read-only" },
];

type Phase = "typing" | "sql_gen" | "gate" | "results" | "audit" | "pause";

interface State {
  qIdx: number;
  phase: Phase;
  typedLen: number;
  sqlLines: number;
  gates: number;
  rows: number;
  showAudit: boolean;
}

type Action =
  | { type: "TICK_TYPE" }
  | { type: "NEXT_PHASE" }
  | { type: "SQL_LINE" }
  | { type: "GATE" }
  | { type: "ROW" }
  | { type: "AUDIT" }
  | { type: "NEXT_Q" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "TICK_TYPE": return { ...s, typedLen: s.typedLen + 1 };
    case "NEXT_PHASE": return { ...s, phase: nextPhase(s.phase) };
    case "SQL_LINE": return { ...s, sqlLines: s.sqlLines + 1 };
    case "GATE": return { ...s, gates: s.gates + 1 };
    case "ROW": return { ...s, rows: s.rows + 1 };
    case "AUDIT": return { ...s, showAudit: true };
    case "NEXT_Q": return { qIdx: (s.qIdx + 1) % 3, phase: "typing", typedLen: 0, sqlLines: 0, gates: 0, rows: 0, showAudit: false };
    default: return s;
  }
}

function nextPhase(p: Phase): Phase {
  const map: Record<Phase, Phase> = { typing: "sql_gen", sql_gen: "gate", gate: "results", results: "audit", audit: "pause", pause: "typing" };
  return map[p];
}

export default function HeroSequence() {
  const q = QUESTIONS[2];
  const initState: State = { qIdx: 0, phase: "results", typedLen: q.text.length, sqlLines: 4, gates: 3, rows: 5, showAudit: true };
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [state, dispatch] = useReducer(reducer, { qIdx: 0, phase: "typing", typedLen: 0, sqlLines: 0, gates: 0, rows: 0, showAudit: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const display = prefersReduced ? initState : state;
  const cur = prefersReduced ? q : QUESTIONS[display.qIdx];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(media.matches);
    const onChange = () => setPrefersReduced(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (prefersReduced) return;
    const clear = () => { if (timerRef.current) clearTimeout(timerRef.current); if (frameRef.current) cancelAnimationFrame(frameRef.current); };

    if (display.phase === "typing") {
      if (display.typedLen < cur.text.length) {
        const delay = 60 + Math.random() * 20;
        timerRef.current = setTimeout(() => dispatch({ type: "TICK_TYPE" }), delay);
      } else {
        timerRef.current = setTimeout(() => dispatch({ type: "NEXT_PHASE" }), 400);
      }
    } else if (display.phase === "sql_gen") {
      const sqlTotal = cur.sql.split("\n").length;
      if (display.sqlLines < sqlTotal) {
        timerRef.current = setTimeout(() => dispatch({ type: "SQL_LINE" }), 220);
      } else {
        timerRef.current = setTimeout(() => dispatch({ type: "NEXT_PHASE" }), 300);
      }
    } else if (display.phase === "gate") {
      if (display.gates < 3) {
        timerRef.current = setTimeout(() => dispatch({ type: "GATE" }), 300);
      } else {
        timerRef.current = setTimeout(() => dispatch({ type: "NEXT_PHASE" }), 400);
      }
    } else if (display.phase === "results") {
      if (display.rows < cur.rows.length) {
        timerRef.current = setTimeout(() => dispatch({ type: "ROW" }), 120);
      } else {
        timerRef.current = setTimeout(() => dispatch({ type: "NEXT_PHASE" }), 600);
      }
    } else if (display.phase === "audit") {
      if (!display.showAudit) {
        timerRef.current = setTimeout(() => dispatch({ type: "AUDIT" }), 100);
      } else {
        timerRef.current = setTimeout(() => dispatch({ type: "NEXT_PHASE" }), 900);
      }
    } else if (display.phase === "pause") {
      timerRef.current = setTimeout(() => dispatch({ type: "NEXT_Q" }), 420);
    }
    return clear;
  }, [state, cur, prefersReduced]);

  const sqlLines = cur.sql.split("\n");
  const gateLabels = ["읽기 전용", "권한 필터", "비용 게이트"];
  const opacity = display.phase === "pause" ? 0 : 1;

  return (
    <div className="hero-frame w-full overflow-hidden select-none" style={{ transition: "opacity 400ms cubic-bezier(0.22,1,0.36,1)", opacity }}>
      {/* header bar */}
      <div style={{ background: "oklch(0.20 0.015 235)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57", display: "inline-block" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ffbd2e", display: "inline-block" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840", display: "inline-block" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 10 }}>QueryMind · {cur.label}</span>
      </div>

      {/* body */}
      <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 11, background: "oklch(0.14 0.015 235)" }}>
        {/* question input */}
        <div style={{ background: "oklch(0.18 0.015 235)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "white", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "oklch(0.70 0.14 220)", fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0 }}>❯</span>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{cur.text.slice(0, display.typedLen)}</span>
          {(display.phase === "typing" || display.typedLen === 0) && (
            <span className="cursor-blink" style={{ width: 2, height: 16, background: "oklch(0.70 0.14 220)", display: "inline-block" }} />
          )}
        </div>

        {display.sqlLines === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, color: "rgba(255,255,255,0.46)", background: "oklch(0.16 0.015 235)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
            <span>schema context ready</span>
            <span style={{ color: "oklch(0.72 0.15 155)" }}>read-only · policy active</span>
          </div>
        )}

        {/* SQL */}
        {display.sqlLines > 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.7, color: "oklch(0.70 0.14 220)", background: "oklch(0.12 0.015 235)", borderRadius: 6, padding: "10px 14px" }}>
            {sqlLines.slice(0, display.sqlLines).map((l, i) => (
              <div key={i} style={{ opacity: 0, animation: `fadeUp 200ms cubic-bezier(0.22,1,0.36,1) ${i * 40}ms both` }}>{l}</div>
            ))}
          </div>
        )}

        {/* gates */}
        {display.gates > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            {gateLabels.slice(0, display.gates).map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "oklch(0.72 0.15 155)", opacity: 0, animation: `fadeUp 200ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both` }}>
                <span style={{ fontSize: 13 }}>✓</span>{g}
              </div>
            ))}
          </div>
        )}

        {/* results */}
        {display.rows > 0 && (
          <div style={{ background: "oklch(0.18 0.015 235)", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "rgba(255,255,255,0.4)", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>항목</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "rgba(255,255,255,0.4)", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "right" }}>값</div>
              {cur.rows.slice(0, display.rows).map(([label, val], i) => (
                <Fragment key={`${label}-${i}`}>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", padding: "5px 12px", borderBottom: i < display.rows - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", opacity: 0, animation: `fadeUp 160ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "oklch(0.70 0.14 220)", padding: "5px 12px", borderBottom: i < display.rows - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", textAlign: "right", opacity: 0, animation: `fadeUp 160ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`, whiteSpace: "nowrap" }}>{val}</div>
                </Fragment>
              ))}
            </div>
          </div>
        )}

        {/* audit log */}
        {display.showAudit && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.35)", opacity: 0, animation: "fadeUp 200ms cubic-bezier(0.22,1,0.36,1) both" }}>
            {cur.audit}
          </div>
        )}
      </div>
    </div>
  );
}

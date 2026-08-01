import React, { useEffect, useState } from 'react';

interface ContextEntry {
  value: string;
  status: string;
}

interface SummaryData {
  context: Record<string, string | ContextEntry>;
  features: Record<string, number>;
  todos: Record<string, number>;
}

interface Feature {
  id: number;
  category: string;
  name: string;
  status: string;
  sort_order: number;
}

interface Todo {
  id: number;
  title: string;
  priority: string;
  status: string;
  feature: { name: string; category: string } | null;
}

const API_BASE = '/api/bff';

const STATUS_ICON: Record<string, string> = {
  DONE: '█',
  IN_PROGRESS: '▓',
  PLANNED: '░',
  DEFERRED: '·',
};

const STATUS_CLASS: Record<string, string> = {
  DONE: 'cli-done',
  IN_PROGRESS: 'cli-wip',
  PLANNED: 'cli-plan',
  DEFERRED: 'cli-defer',
  TODO: 'cli-plan',
  BLOCKED: 'cli-blocked',
};

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: '!!!',
  HIGH: '!! ',
  MEDIUM: '!  ',
  LOW: '.  ',
};

function ProgressBar({ done, total, width = 24 }: { done: number; total: number; width?: number }) {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span>
      <span className="cli-done">{bar.slice(0, filled)}</span>
      <span className="cli-dim">{bar.slice(filled)}</span>
      <span className="cli-dim"> {pct}%</span>
    </span>
  );
}

export default function DevProgress(): React.JSX.Element {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/dev/summary`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSummary)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    if (features.length > 0) return;
    Promise.all([
      fetch(`${API_BASE}/dev/features?size=200`).then((r) => r.json()),
      fetch(`${API_BASE}/dev/todos?size=200`).then((r) => r.json()),
    ]).then(([fData, tData]) => {
      setFeatures(fData.items || []);
      setTodos(tData.items || []);
    });
  }, [detailOpen]);

  if (error) return null;
  if (!summary) {
    return (
      <div className="cli-terminal">
        <div className="cli-titlebar">
          <span className="cli-dot cli-dot--red" />
          <span className="cli-dot cli-dot--yellow" />
          <span className="cli-dot cli-dot--green" />
          <span className="cli-titlebar__text">saigon-rider — progress</span>
        </div>
        <div className="cli-body">
          <span className="cli-dim">loading...</span>
        </div>
      </div>
    );
  }

  const rawCtx = summary.context;
  const ctx: Record<string, ContextEntry> = {};
  for (const [k, v] of Object.entries(rawCtx)) {
    ctx[k] = typeof v === 'object' && v !== null ? (v as ContextEntry) : { value: v, status: '⏸' };
  }
  const ft = summary.features;
  const td = summary.todos;
  const totalFeatures = Object.values(ft).reduce((a, b) => a + b, 0);
  const doneFeatures = ft.DONE || 0;
  const totalTodos = Object.values(td).reduce((a, b) => a + b, 0);
  const doneTodos = td.DONE || 0;

  const grouped: Record<string, Feature[]> = {};
  for (const f of features) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  }

  return (
    <div className="cli-terminal">
      <div className="cli-titlebar">
        <span className="cli-dot cli-dot--red" />
        <span className="cli-dot cli-dot--yellow" />
        <span className="cli-dot cli-dot--green" />
        <span className="cli-titlebar__text">saigon-rider — progress</span>
      </div>
      <div className="cli-body">
        <div className="cli-line">
          <span className="cli-prompt">$</span>{' '}
          <span className="cli-cmd">saigon status</span>
        </div>
        <br />
        <div className="cli-line">
          <span className="cli-label">  sprint </span>
          <span className="cli-wip">{ctx.current_sprint?.status} {ctx.current_sprint?.value || '—'}</span>
        </div>
        <div className="cli-line">
          <span className="cli-label">   focus </span>
          <span>{ctx.current_focus?.status} {ctx.current_focus?.value || '—'}</span>
        </div>
        <div className="cli-line">
          <span className="cli-label">  deploy </span>
          <span className="cli-dim">{ctx.last_deploy?.value || '—'}</span>
        </div>
        {ctx.blocker?.value && (
          <div className="cli-line">
            <span className="cli-label"> blocker </span>
            <span className="cli-blocked">{ctx.blocker.status} {ctx.blocker.value}</span>
          </div>
        )}
        <div className="cli-line">
          <span className="cli-label">    next </span>
          <span className="cli-dim">{ctx.next_milestone?.value || '—'}</span>
        </div>
        <br />
        <div className="cli-line">
          <span className="cli-label">features </span>
          <ProgressBar done={doneFeatures} total={totalFeatures} />
          <span className="cli-dim">
            {' '}{doneFeatures}/{totalFeatures}
            {' '}(wip:{ft.IN_PROGRESS || 0} plan:{ft.PLANNED || 0})
          </span>
        </div>
        <div className="cli-line">
          <span className="cli-label">   todos </span>
          <ProgressBar done={doneTodos} total={totalTodos} />
          <span className="cli-dim">
            {' '}{doneTodos}/{totalTodos}
            {' '}(wip:{td.IN_PROGRESS || 0} blocked:{td.BLOCKED || 0})
          </span>
        </div>

        <br />
        <div className="cli-line">
          <span className="cli-prompt">$</span>{' '}
          <button
            className="cli-details-btn"
            onClick={() => setDetailOpen(!detailOpen)}
          >
            {detailOpen ? 'saigon status --short' : 'saigon status --detail'}
            <span className="cli-cursor">_</span>
          </button>
        </div>

        {detailOpen && features.length > 0 && (
          <>
            <br />
            <div className="cli-line cli-dim">{'─'.repeat(56)}</div>
            <div className="cli-line">
              <span className="cli-cmd">  FEATURES</span>
            </div>
            <br />
            {Object.entries(grouped).map(([cat, items]) => (
              <React.Fragment key={cat}>
                <div className="cli-line">
                  <span className="cli-label">  [{cat}]</span>
                </div>
                {items
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((f) => (
                    <div className="cli-line" key={f.id}>
                      <span className={STATUS_CLASS[f.status] || ''}>
                        {'    '}{STATUS_ICON[f.status] || '?'} {f.name}
                      </span>
                      <span className="cli-dim"> {f.status}</span>
                    </div>
                  ))}
                <br />
              </React.Fragment>
            ))}

            <div className="cli-line cli-dim">{'─'.repeat(56)}</div>
            <div className="cli-line">
              <span className="cli-cmd">  TODOS</span>
              <span className="cli-dim"> ({todos.length})</span>
            </div>
            <br />
            {todos
              .filter((t) => t.status !== 'DONE')
              .map((t) => (
                <div className="cli-line" key={t.id}>
                  <span className={STATUS_CLASS[t.priority] || ''}>
                    {'    '}{PRIORITY_LABEL[t.priority] || '   '}
                  </span>
                  <span className={STATUS_CLASS[t.status] || ''}>{t.title}</span>
                  <span className="cli-dim">
                    {' '}[{t.status}]
                    {t.feature ? ` → ${t.feature.category}/${t.feature.name}` : ''}
                  </span>
                </div>
              ))}
            {todos.filter((t) => t.status === 'DONE').length > 0 && (
              <>
                <br />
                <div className="cli-line cli-dim">
                  {'    '}+ {todos.filter((t) => t.status === 'DONE').length} completed tasks (hidden)
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

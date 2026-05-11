"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "rnaves.simulator.session";

function loadStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionToken) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

const LEVEL_LABEL = { "1": "Júnior", "2": "Pleno", "3": "Sênior" };
const INITIAL_FILTERS = { from: "", to: "", company_id: "", user_id: "", level: "" };

function formatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return "US$ 0,00";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  });
}

function formatNumber(value) {
  if (value == null) return "0";
  return Number(value).toLocaleString("pt-BR");
}

function formatScore(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function formatDateBR(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))
  ].join("\n");
}

const STATUS_CONFIG = {
  completed: { label: "Completa", className: "is-completed" },
  scenario_ready: { label: "Cenário pronto", className: "is-ready" },
  in_progress: { label: "Em andamento", className: "is-progress" },
  authenticated: { label: "Autenticada", className: "is-ready" },
  failed: { label: "Falha", className: "is-failed" },
  created: { label: "Criada", className: "is-ready" }
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.scenario_ready;
  return (
    <span className={`dash-status ${cfg.className}`}>
      <span className="dash-status-dot" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

const LEVEL_CONFIG = {
  Sênior: "is-senior",
  Pleno: "is-pleno",
  Júnior: "is-junior"
};

function LevelBadge({ level }) {
  const label = LEVEL_LABEL[String(level)] ?? "—";
  const cls = LEVEL_CONFIG[label] ?? "";
  return <span className={`dash-level ${cls}`}>{label}</span>;
}

function ScoreCell({ value }) {
  const n = formatScore(value);
  if (n == null) return <span className="dash-score-empty">—</span>;
  let tone = "dash-score-rose";
  if (n >= 7) tone = "dash-score-green";
  else if (n >= 4) tone = "dash-score-amber";
  return <strong className={`dash-score-cell ${tone}`}>{n.toFixed(1)}</strong>;
}

function GlassCard({ children, className = "", delay = 0, style }) {
  return (
    <section
      className={`dash-card ${className}`}
      style={{ animationDelay: `${delay}ms`, ...style }}
    >
      {children}
    </section>
  );
}

function SectionTitle({ children, subtitle }) {
  return (
    <header className="dash-section-title">
      <h2>{children}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

function PaceRadial({ score }) {
  const pct = Math.max(0, Math.min(1, (Number(score) || 0) / 10));
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div className="dash-pace-radial">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#14b8a6"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.23,1,0.32,1)" }}
        />
      </svg>
      <div className="dash-pace-radial-value">
        <span>{Number.isFinite(Number(score)) ? Number(score).toFixed(1) : "—"}</span>
        <em>de 10</em>
      </div>
    </div>
  );
}

function PaceBar({ letter, label, score, color }) {
  const n = Number(score) || 0;
  const pct = Math.max(0, Math.min(100, (n / 10) * 100));
  return (
    <div className="dash-pace-bar">
      <span className="dash-pace-letter" style={{ background: `${color}26`, color }}>
        {letter}
      </span>
      <div className="dash-pace-bar-body">
        <div className="dash-pace-bar-head">
          <span>{label}</span>
          <strong>{Number.isFinite(n) ? n.toFixed(1) : "—"}</strong>
        </div>
        <div className="dash-pace-bar-track">
          <div className="dash-pace-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

function LineChart({ series, labels }) {
  const W = 600;
  const H = 240;
  const pad = { t: 24, r: 16, b: 30, l: 36 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const allVals = series.flatMap((s) => s.data);
  const maxV = Math.max(...allVals, 1);
  const minV = 0;
  const range = maxV - minV || 1;
  const toX = (i, total) =>
    pad.l + (total === 1 ? plotW / 2 : (i / (total - 1)) * plotW);
  const toY = (v) => pad.t + plotH - ((v - minV) / range) * plotH;
  const gridLines = [0, 2.5, 5, 7.5, 10].filter((v) => v <= maxV + 1);

  if (labels.length === 0 || series.length === 0) {
    return <p className="dash-empty">Sem dados no recorte atual.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart" role="img">
      {gridLines.map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            y1={toY(v)}
            x2={W - pad.r}
            y2={toY(v)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
          <text
            x={pad.l - 8}
            y={toY(v) + 4}
            fill="#64748b"
            fontSize="10"
            textAnchor="end"
          >
            {v}
          </text>
        </g>
      ))}
      {labels.map((lbl, i) => (
        <text
          key={lbl + i}
          x={toX(i, labels.length)}
          y={H - 6}
          fill="#64748b"
          fontSize="10"
          textAnchor="middle"
        >
          {lbl}
        </text>
      ))}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => `${toX(i, s.data.length)},${toY(v)}`);
        const line = pts.join(" ");
        const areaPath = `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(" ")} L${toX(s.data.length - 1, s.data.length)},${pad.t + plotH} L${toX(0, s.data.length)},${pad.t + plotH} Z`;
        return (
          <g key={s.name + si}>
            <defs>
              <linearGradient id={`grad-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#grad-${si})`} />
            <polyline
              points={line}
              fill="none"
              stroke={s.color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {s.data.map((v, i) => (
              <circle
                key={s.name + i}
                cx={toX(i, s.data.length)}
                cy={toY(v)}
                r="4"
                fill="#060b18"
                stroke={s.color}
                strokeWidth="2.5"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const SERIES_COLORS = ["#14b8a6", "#8b5cf6", "#3b82f6", "#f59e0b", "#f43f5e", "#34d399"];

export function AdminDashboard() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored?.sessionToken) setToken(stored.sessionToken);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function fetchStats() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) {
          if (v) params.set(k, v);
        }
        const response = await fetch(`/api/admin/stats?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error?.message ?? `Erro ${response.status} ao buscar estatísticas.`
          );
        }
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [token, filters]);

  // Accumulate filter options over time (UNION across all fetched datasets),
  // so switching between companies/sellers doesn't require first clearing
  // the active filter.
  const [filterOptions, setFilterOptions] = useState({ companies: [], sellers: [] });
  useEffect(() => {
    if (!data?.simulations) return;
    setFilterOptions((prev) => {
      const companies = new Map(prev.companies.map((c) => [c.id, c.name]));
      const sellers = new Map(prev.sellers.map((s) => [s.id, s.name]));
      for (const s of data.simulations) {
        if (s.companyId && s.company && s.company !== "—") companies.set(s.companyId, s.company);
        if (s.userId && s.sellerName && s.sellerName !== "—") sellers.set(s.userId, s.sellerName);
      }
      return {
        companies: Array.from(companies.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        sellers: Array.from(sellers.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      };
    });
  }, [data]);

  const chart = useMemo(() => {
    const rows = data?.sellerEvolution ?? [];
    const labels = Array.from(new Set(rows.map((r) => r.day))).sort();
    const sellers = Array.from(new Set(rows.map((r) => r.seller)));
    const series = sellers.map((seller, idx) => ({
      name: seller,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
      data: labels.map((day) => {
        const point = rows.find((r) => r.seller === seller && r.day === day);
        return Number.isFinite(Number(point?.average)) ? Number(point.average) : 0;
      })
    }));
    const formattedLabels = labels.map((l) => l.slice(5));
    return { labels: formattedLabels, series };
  }, [data]);

  function updateFilter(key, value) {
    setFilters((c) => ({ ...c, [key]: value }));
  }

  function clearAll() {
    setFilters({ ...INITIAL_FILTERS });
  }

  function exportCsv() {
    if (!data?.simulations?.length) return;
    const rows = data.simulations.map((s) => ({
      data: formatDateBR(s.date),
      vendedor: s.sellerName,
      empresa: s.company,
      nivel: LEVEL_LABEL[String(s.sellerLevel)] ?? "",
      status: s.status,
      P: s.P ?? "",
      A: s.A ?? "",
      C: s.C ?? "",
      E: s.E ?? "",
      Media: s.Media ?? ""
    }));
    const csv = toCsv(rows);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `simulador-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function signOut() {
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setToken("");
    if (typeof window !== "undefined") {
      window.location.href = "/admin/login";
    }
  }

  if (!hydrated) {
    return (
      <div className="dash-shell">
        <div className="dash-loading">Carregando…</div>
      </div>
    );
  }

  if (!token) {
    if (typeof window !== "undefined") {
      window.location.replace("/admin/login");
      return null;
    }
    return (
      <div className="dash-shell">
        <div className="dash-loading">
          <h1>Acesso restrito</h1>
          <p>
            É necessário estar autenticado como admin. <a href="/admin/login">Entrar</a>.
          </p>
        </div>
      </div>
    );
  }

  const totals = data?.totals;
  const paceAverages = data?.paceAverages ?? {};
  const companies = data?.companyConsumption ?? [];
  const simulations = data?.simulations ?? [];

  return (
    <div className="dash-shell">
      <div className="dash-bg" aria-hidden="true">
        <div className="dash-bg-gradient" />
        <div className="dash-bg-glow-teal" />
        <div className="dash-bg-glow-purple" />
      </div>

      <div className="dash-container">
        <header className="dash-header">
          <span className="dash-header-logo">
            <img src="/Logos/Vertical branco.png?v=6" alt="R Naves Consultoria" />
          </span>
          <div className="dash-header-title">
            <h1>
              Painel do <span className="dash-brand-accent">Gestor</span>
            </h1>
            <p>Visão consolidada das simulações</p>
          </div>
          <button type="button" className="dash-logout" onClick={signOut}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8.5 1.5H4a1.5 1.5 0 00-1.5 1.5v8A1.5 1.5 0 004 12.5h4.5M9 9.5L12 7 9 4.5M5 7h7" />
            </svg>
            Sair
          </button>
        </header>

        {error ? (
          <div className="dash-error">
            <span>{error}</span>
            {/admin access required|forbidden/i.test(error) ? (
              <button type="button" className="dash-error-action" onClick={signOut}>
                Entrar com outra conta
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="dash-filterbar">
          <div className="dash-filterbar-label">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 3.5h11M3 7h8M5 10.5h4" />
            </svg>
            Filtros
          </div>
          <div className="dash-filterbar-divider" aria-hidden="true" />

          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            aria-label="Data inicial"
          />
          <span className="dash-filterbar-sep">até</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            aria-label="Data final"
          />

          <div className="dash-filterbar-divider" aria-hidden="true" />

          <select
            value={filters.company_id}
            onChange={(e) => updateFilter("company_id", e.target.value)}
            aria-label="Empresa"
          >
            <option value="">Todas empresas</option>
            {filterOptions.companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filters.user_id}
            onChange={(e) => updateFilter("user_id", e.target.value)}
            aria-label="Vendedor"
          >
            <option value="">Todos vendedores</option>
            {filterOptions.sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={filters.level}
            onChange={(e) => updateFilter("level", e.target.value)}
            aria-label="Senioridade"
          >
            <option value="">Todas senioridades</option>
            <option value="1">Júnior</option>
            <option value="2">Pleno</option>
            <option value="3">Sênior</option>
          </select>

          <div className="dash-filterbar-spacer" />

          <button type="button" className="dash-filterbar-ghost" onClick={clearAll}>
            Limpar
          </button>
          <button
            type="button"
            className="dash-filterbar-ghost"
            onClick={exportCsv}
            disabled={!simulations.length}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M2 6h8M6 2v8" />
            </svg>
            Exportar CSV
          </button>
        </div>

        <div className="dash-kpis">
          <div className="dash-kpi">
            <div className="dash-kpi-label">Simulações</div>
            <div className="dash-kpi-value">{formatNumber(totals?.simulations)}</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Moderadas</div>
            <div className="dash-kpi-value">{formatNumber(totals?.moderationFlags)}</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Tokens usados</div>
            <div className="dash-kpi-value">{formatNumber(totals?.tokensUsed)}</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Custos OpenAI</div>
            <div className="dash-kpi-value">{formatMoney(totals?.openaiCost)}</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Vendedores ativos</div>
            <div className="dash-kpi-value">{formatNumber(totals?.activeSellers)}</div>
          </div>
        </div>

        <div className="dash-grid-main">
          <GlassCard delay={100}>
            <div className="dash-card-head">
              <SectionTitle subtitle="Últimas datas do recorte">Evolução dos vendedores</SectionTitle>
              <div className="dash-legend">
                {chart.series.map((s) => (
                  <span key={s.name}>
                    <i style={{ background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
            <LineChart series={chart.series} labels={chart.labels} />
          </GlassCard>

          <div className="dash-grid-right">
            <GlassCard delay={200} className="dash-card-pace-hero">
              <div className="dash-card-pace-bubble" aria-hidden="true" />
              <div className="dash-pace-row">
                <PaceRadial score={totals?.avgPace} />
                <div className="dash-pace-bars">
                  <PaceBar letter="P" label="Preparação" score={paceAverages.P} color="#14b8a6" />
                  <PaceBar letter="A" label="Análise" score={paceAverages.A} color="#3b82f6" />
                  <PaceBar letter="C" label="Cocriação" score={paceAverages.C} color="#8b5cf6" />
                  <PaceBar letter="E" label="Engajamento" score={paceAverages.E} color="#f59e0b" />
                </div>
              </div>
            </GlassCard>

            <GlassCard delay={300}>
              <SectionTitle>Consumo por empresa</SectionTitle>
              {companies.length === 0 ? (
                <p className="dash-empty">Sem dados no recorte atual.</p>
              ) : (
                <ul className="dash-companies">
                  {companies.map((c, idx) => (
                    <li key={c.company}>
                      <span className="dash-company-dot" style={{ background: SERIES_COLORS[idx % SERIES_COLORS.length] }} />
                      <span className="dash-company-name">{c.company}</span>
                      <span className="dash-company-meta">
                        <strong>{formatMoney(c.cost)}</strong>
                        <em>{c.simulations} sim.</em>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>
        </div>

        <GlassCard className="dash-card-table" delay={400}>
          <div className="dash-card-head">
            <SectionTitle subtitle={`${simulations.length} registros no recorte`}>
              Simulações
            </SectionTitle>
            {loading ? <span className="dash-loading-inline">Atualizando…</span> : null}
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Vendedor</th>
                  <th>Empresa</th>
                  <th>Nível</th>
                  <th className="num">P</th>
                  <th className="num">A</th>
                  <th className="num">C</th>
                  <th className="num">E</th>
                  <th className="num">Média</th>
                  <th style={{ textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {simulations.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={10} className="dash-empty-row">
                      Nenhuma simulação encontrada nesse recorte.
                    </td>
                  </tr>
                ) : (
                  simulations.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDateBR(s.date)}</td>
                      <td className="bold">{s.sellerName}</td>
                      <td>{s.company}</td>
                      <td>
                        <LevelBadge level={s.sellerLevel} />
                      </td>
                      <td className="num"><ScoreCell value={s.P} /></td>
                      <td className="num"><ScoreCell value={s.A} /></td>
                      <td className="num"><ScoreCell value={s.C} /></td>
                      <td className="num"><ScoreCell value={s.E} /></td>
                      <td className="num"><ScoreCell value={s.Media} /></td>
                      <td style={{ textAlign: "right" }}>
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

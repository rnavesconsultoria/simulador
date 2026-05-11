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

function formatBRL(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  });
}

function formatNumber(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR");
}

function formatScore(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(1);
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

export function AdminDashboard() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [draft, setDraft] = useState(INITIAL_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored?.sessionToken) setToken(stored.sessionToken);
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

  const filterOptions = useMemo(() => {
    if (!data?.simulations) return { companies: [], sellers: [] };
    const companies = new Map();
    const sellers = new Map();
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
  }, [data]);

  function applyDraft() {
    setFilters({ ...draft });
  }

  function clearAll() {
    setDraft({ ...INITIAL_FILTERS });
    setFilters({ ...INITIAL_FILTERS });
  }

  function exportCsv() {
    if (!data?.simulations?.length) return;
    const rows = data.simulations.map((s) => ({
      data: formatDateBR(s.date),
      vendedor: s.sellerName,
      empresa: s.company,
      status: s.status,
      fase: s.currentPhase ?? "",
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

  if (!token) {
    return (
      <div className="admin-shell">
        <div className="admin-empty">
          <h1>Acesso restrito</h1>
          <p>
            É necessário estar autenticado. <a href="/">Voltar ao login</a>.
          </p>
        </div>
      </div>
    );
  }

  const totals = data?.totals;
  const paceAverages = data?.paceAverages;
  const sellerEvolution = data?.sellerEvolution ?? [];
  const companyConsumption = data?.companyConsumption ?? [];
  const simulations = data?.simulations ?? [];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/Logos/vertical-black.png" alt="R Naves Consultoria" />
        </div>

        <div className="admin-filter">
          <label>
            <span>De</span>
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
          </label>
          <label>
            <span>Até</span>
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </label>
        </div>

        <label className="admin-filter-block">
          <span>Empresa</span>
          <select
            value={draft.company_id}
            onChange={(e) => setDraft((d) => ({ ...d, company_id: e.target.value }))}
          >
            <option value="">Todas</option>
            {filterOptions.companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="admin-filter-block">
          <span>Vendedor</span>
          <select
            value={draft.user_id}
            onChange={(e) => setDraft((d) => ({ ...d, user_id: e.target.value }))}
          >
            <option value="">Todos</option>
            {filterOptions.sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        <label className="admin-filter-block">
          <span>Senioridade</span>
          <select
            value={draft.level}
            onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value }))}
          >
            <option value="">Todas</option>
            <option value="1">Júnior</option>
            <option value="2">Pleno</option>
            <option value="3">Sênior</option>
          </select>
        </label>

        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={applyDraft}>
            Aplicar filtros
          </button>
          <button type="button" className="admin-btn" onClick={clearAll}>
            Limpar filtros
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={exportCsv}
            disabled={!simulations.length}
          >
            Exportar CSV
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {error ? <div className="admin-error">{error}</div> : null}

        <section className="admin-kpis">
          <div className="admin-kpi">
            <div className="admin-kpi-label">Simulações</div>
            <div className="admin-kpi-value">{formatNumber(totals?.simulations)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Moderador</div>
            <div className="admin-kpi-value">{formatNumber(totals?.moderationFlags)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Tokens usados</div>
            <div className="admin-kpi-value">{formatNumber(totals?.tokensUsed)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Custos OpenAI</div>
            <div className="admin-kpi-value">{formatBRL(totals?.openaiCost)}</div>
          </div>
          <div className="admin-kpi admin-kpi-accent">
            <div className="admin-kpi-label">PACE médio</div>
            <div className="admin-kpi-value">{formatScore(totals?.avgPace)}</div>
          </div>
        </section>

        <section className="admin-grid-2">
          <div className="admin-card">
            <h3>Evolução dos vendedores</h3>
            {sellerEvolution.length === 0 ? (
              <p className="admin-empty-inline">Sem dados no recorte atual.</p>
            ) : (
              <SellerEvolutionChart data={sellerEvolution} />
            )}
          </div>

          <div className="admin-card">
            <h3>Consumo por empresa</h3>
            {companyConsumption.length === 0 ? (
              <p className="admin-empty-inline">Sem dados no recorte atual.</p>
            ) : (
              <CompanyConsumption data={companyConsumption} />
            )}
          </div>
        </section>

        <section className="admin-card">
          <h3>Médias PACE no recorte</h3>
          <div className="admin-pace-row">
            {[
              { key: "P", label: "Preparação" },
              { key: "A", label: "Análise" },
              { key: "C", label: "Cocriação" },
              { key: "E", label: "Engajamento" }
            ].map((p) => (
              <div key={p.key} className="admin-pace-cell">
                <span className="admin-pace-label">{p.label}</span>
                <strong>{formatScore(paceAverages?.[p.key])}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card admin-card-table">
          <div className="admin-card-head">
            <h3>Simulações ({simulations.length})</h3>
            {loading ? <span className="admin-loading">Carregando…</span> : null}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
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
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {simulations.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateBR(s.date)}</td>
                    <td>{s.sellerName}</td>
                    <td>{s.company}</td>
                    <td>{LEVEL_LABEL[String(s.sellerLevel)] ?? "—"}</td>
                    <td className="num">{formatScore(s.P)}</td>
                    <td className="num">{formatScore(s.A)}</td>
                    <td className="num">{formatScore(s.C)}</td>
                    <td className="num">{formatScore(s.E)}</td>
                    <td className="num"><strong>{formatScore(s.Media)}</strong></td>
                    <td>{s.status}</td>
                  </tr>
                ))}
                {simulations.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={10} className="admin-empty-inline">
                      Nenhuma simulação encontrada nesse recorte.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function SellerEvolutionChart({ data }) {
  // Group by seller, build series
  const grouped = useMemo(() => {
    const bySeller = new Map();
    for (const point of data) {
      if (!bySeller.has(point.seller)) bySeller.set(point.seller, []);
      bySeller.get(point.seller).push(point);
    }
    return Array.from(bySeller.entries()).map(([seller, points]) => ({
      seller,
      points: points.sort((a, b) => (a.day < b.day ? -1 : 1))
    }));
  }, [data]);

  const days = useMemo(() => {
    const set = new Set();
    for (const p of data) set.add(p.day);
    return Array.from(set).sort();
  }, [data]);

  if (days.length === 0) return null;
  const width = 480;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 28, left: 32 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xStep = days.length > 1 ? innerW / (days.length - 1) : innerW;
  const yMax = 10;
  const colors = ["#14b8a6", "#6366f1", "#f59e0b", "#f43f5e", "#10b981", "#8b5cf6"];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="admin-chart" role="img">
      {[0, 2.5, 5, 7.5, 10].map((y) => (
        <g key={y}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerH - (y / yMax) * innerH}
            y2={padding.top + innerH - (y / yMax) * innerH}
            stroke="#e5e7eb"
            strokeWidth="0.5"
          />
          <text
            x={padding.left - 6}
            y={padding.top + innerH - (y / yMax) * innerH + 4}
            textAnchor="end"
            fontSize="10"
            fill="#6b7280"
          >
            {y}
          </text>
        </g>
      ))}
      {days.map((d, i) => (
        <text
          key={d}
          x={padding.left + i * xStep}
          y={height - 6}
          textAnchor="middle"
          fontSize="9"
          fill="#6b7280"
        >
          {d.slice(5)}
        </text>
      ))}
      {grouped.map((series, idx) => {
        const color = colors[idx % colors.length];
        const points = series.points
          .map((p) => {
            const i = days.indexOf(p.day);
            const x = padding.left + i * xStep;
            const y = padding.top + innerH - (p.average / yMax) * innerH;
            return `${x},${y}`;
          })
          .join(" ");
        return (
          <g key={series.seller}>
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
            {series.points.map((p) => {
              const i = days.indexOf(p.day);
              const x = padding.left + i * xStep;
              const y = padding.top + innerH - (p.average / yMax) * innerH;
              return <circle key={`${series.seller}-${p.day}`} cx={x} cy={y} r="2.5" fill={color} />;
            })}
          </g>
        );
      })}
      <g>
        {grouped.map((s, idx) => (
          <g key={s.seller} transform={`translate(${padding.left + idx * 110}, ${padding.top - 2})`}>
            <circle cx="0" cy="0" r="4" fill={colors[idx % colors.length]} />
            <text x="8" y="3" fontSize="10" fill="#374151">{s.seller}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function CompanyConsumption({ data }) {
  const max = Math.max(...data.map((d) => d.cost), 0.0001);
  return (
    <ul className="admin-bars">
      {data.map((c) => (
        <li key={c.company}>
          <div className="admin-bars-head">
            <span>{c.company}</span>
            <span className="admin-bars-value">
              {formatBRL(c.cost)} · {c.simulations} sim.
            </span>
          </div>
          <div className="admin-bars-track">
            <div
              className="admin-bars-fill"
              style={{ width: `${(c.cost / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

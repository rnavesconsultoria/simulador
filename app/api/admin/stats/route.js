import { NextResponse } from "next/server";
import { internalError } from "../../../../src/lib/api-error.js";
import { requireAdmin } from "../../../../src/lib/admin-auth.js";
import { getSupabaseAdmin } from "../../../../src/lib/supabase-admin.js";

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function emptyStats() {
  return {
    totals: {
      simulations: 0,
      moderationFlags: 0,
      tokensUsed: 0,
      openaiCost: 0,
      avgPace: null,
      activeSellers: 0
    },
    paceAverages: { P: null, A: null, C: null, E: null },
    sellerEvolution: [],
    companyConsumption: [],
    simulations: []
  };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));
    const companyId = url.searchParams.get("company_id");
    const userId = url.searchParams.get("user_id");
    const level = url.searchParams.get("level");

    const supabase = getSupabaseAdmin();

    // Fetch all simulation_sessions in range
    let sessionsQuery = supabase
      .from("simulation_sessions")
      .select(
        `
          id,
          session_key,
          created_at,
          status,
          current_phase,
          user_id,
          company_id,
          users:user_id ( name, email, level ),
          companies:company_id ( trade_name )
        `
      )
      .order("created_at", { ascending: false });

    if (from) sessionsQuery = sessionsQuery.gte("created_at", from);
    if (to) sessionsQuery = sessionsQuery.lte("created_at", to);
    if (companyId) sessionsQuery = sessionsQuery.eq("company_id", companyId);
    if (userId) sessionsQuery = sessionsQuery.eq("user_id", userId);

    const { data: sessionsRaw, error: sessionsError } = await sessionsQuery;
    if (sessionsError) throw new Error(`sessions: ${sessionsError.message}`);

    const sessions = (sessionsRaw ?? []).filter((s) =>
      level ? String(s.users?.level ?? "") === String(level) : true
    );

    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) {
      const stats = emptyStats();
      return NextResponse.json({ ok: true, ...stats });
    }

    // Reports per simulation (for PACE scores)
    const { data: reportsRaw, error: reportsError } = await supabase
      .from("reports")
      .select(
        "id, session_id, user_id, questions_score, analysis_score, creativity_score, engagement_score, average_score, created_at"
      )
      .in("session_id", sessionIds);
    if (reportsError) throw new Error(`reports: ${reportsError.message}`);
    const reportsBySession = new Map((reportsRaw ?? []).map((r) => [r.session_id, r]));

    // Moderation events
    const { count: moderationFlags, error: modError } = await supabase
      .from("session_messages")
      .select("id", { head: true, count: "exact" })
      .in("session_id", sessionIds)
      .eq("actor", "moderator")
      .eq("moderation_flag", true);
    if (modError) throw new Error(`moderation: ${modError.message}`);

    // OpenAI costs
    const { data: costsRaw, error: costsError } = await supabase
      .from("openai_costs")
      .select("session_id, input_tokens, output_tokens, total_cost")
      .in("session_id", sessionIds);
    if (costsError) throw new Error(`costs: ${costsError.message}`);
    const costs = costsRaw ?? [];

    const tokensUsed = costs.reduce(
      (acc, c) => acc + (c.input_tokens ?? 0) + (c.output_tokens ?? 0),
      0
    );
    const openaiCost = costs.reduce(
      (acc, c) => acc + Number(c.total_cost ?? 0),
      0
    );

    const costBySession = new Map();
    for (const c of costs) {
      const prev = costBySession.get(c.session_id) ?? 0;
      costBySession.set(c.session_id, prev + Number(c.total_cost ?? 0));
    }

    const reports = Array.from(reportsBySession.values());
    const avg = (arr) =>
      arr.length === 0
        ? null
        : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
    const paceAverages = {
      P: avg(reports.map((r) => Number(r.questions_score ?? 0)).filter((v) => Number.isFinite(v))),
      A: avg(reports.map((r) => Number(r.analysis_score ?? 0)).filter((v) => Number.isFinite(v))),
      C: avg(reports.map((r) => Number(r.creativity_score ?? 0)).filter((v) => Number.isFinite(v))),
      E: avg(reports.map((r) => Number(r.engagement_score ?? 0)).filter((v) => Number.isFinite(v)))
    };
    const avgPace = avg(
      reports.map((r) => Number(r.average_score ?? 0)).filter((v) => Number.isFinite(v))
    );

    // Seller evolution: per (user, day) average PACE
    const sellerSeries = new Map();
    for (const s of sessions) {
      const r = reportsBySession.get(s.id);
      if (!r) continue;
      const day = new Date(s.created_at).toISOString().slice(0, 10);
      const sellerName = s.users?.name ?? "—";
      const key = `${sellerName}|${day}`;
      const prev = sellerSeries.get(key) ?? { seller: sellerName, day, total: 0, n: 0 };
      prev.total += Number(r.average_score ?? 0);
      prev.n += 1;
      sellerSeries.set(key, prev);
    }
    const sellerEvolution = Array.from(sellerSeries.values())
      .map((s) => ({ seller: s.seller, day: s.day, average: Math.round((s.total / s.n) * 100) / 100 }))
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

    // Company consumption
    const companyAgg = new Map();
    for (const s of sessions) {
      const company = s.companies?.trade_name ?? "—";
      const cost = costBySession.get(s.id) ?? 0;
      const prev = companyAgg.get(company) ?? { company, simulations: 0, cost: 0 };
      prev.simulations += 1;
      prev.cost += cost;
      companyAgg.set(company, prev);
    }
    const companyConsumption = Array.from(companyAgg.values())
      .map((c) => ({ ...c, cost: Math.round(c.cost * 1000) / 1000 }))
      .sort((a, b) => b.cost - a.cost);

    // Recent simulations table (cap 100 rows)
    const simulationsTable = sessions.slice(0, 100).map((s) => {
      const r = reportsBySession.get(s.id);
      return {
        id: s.id,
        userId: s.user_id,
        companyId: s.company_id,
        date: s.created_at,
        sellerName: s.users?.name ?? "—",
        sellerLevel: s.users?.level ?? null,
        company: s.companies?.trade_name ?? "—",
        status: s.status,
        currentPhase: s.current_phase,
        P: r ? Number(r.questions_score) : null,
        A: r ? Number(r.analysis_score) : null,
        C: r ? Number(r.creativity_score) : null,
        E: r ? Number(r.engagement_score) : null,
        Media: r ? Number(r.average_score) : null
      };
    });

    const activeSellers = new Set(
      sessions.map((s) => s.user_id).filter(Boolean)
    ).size;

    return NextResponse.json({
      ok: true,
      totals: {
        simulations: sessions.length,
        moderationFlags: moderationFlags ?? 0,
        tokensUsed,
        openaiCost: Math.round(openaiCost * 1000) / 1000,
        activeSellers,
        avgPace
      },
      paceAverages,
      sellerEvolution,
      companyConsumption,
      simulations: simulationsTable
    });
  } catch (error) {
    return internalError(error);
  }
}

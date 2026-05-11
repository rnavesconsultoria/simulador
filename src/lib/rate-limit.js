import { getSupabaseAdmin } from "./supabase-admin.js";

export async function rateLimit({ key, limit, windowMs }) {
  const supabase = getSupabaseAdmin();
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error) {
    throw new Error(`Failed to apply rate limit: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Rate limit function returned no result.");
  }

  return {
    ok: row.allowed === true,
    remaining: Number(row.remaining ?? 0),
    resetAt: row.reset_at
  };
}

export function getRequestIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "anonymous";
}

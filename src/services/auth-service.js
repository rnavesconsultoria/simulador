import crypto from "node:crypto";
import { env } from "../config/env.js";
import { generateAppSessionToken, hashAppSessionToken } from "../lib/app-session-token.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";

function generateNumericCode(length = 6) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function findUserByEmail(email) {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, level, temporary_access, temporary_credits, is_active, company_id, companies(id, trade_name, cnpj, briefing_markdown)")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find user: ${error.message}`);
  }

  return data;
}

export async function findUserById(userId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, level, temporary_access, temporary_credits, is_active, company_id, companies(id, trade_name, cnpj, briefing_markdown)")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find user by id: ${error.message}`);
  }

  return data;
}

export async function requestAccessCode(email) {
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    return {
      ok: false,
      reason: "user_not_found"
    };
  }

  const code = generateNumericCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + env.authCodeTtlMinutes * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("access_codes").insert({
    user_id: user.id,
    code_hash: codeHash,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Failed to create access code: ${error.message}`);
  }

  return {
    ok: true,
    user,
    code,
    expiresAt
  };
}

export async function verifyAccessCode(email, code) {
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    return {
      ok: false,
      reason: "user_not_found"
    };
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("access_codes")
    .select("id, code_hash, expires_at, used_at")
    .eq("user_id", user.id)
    .is("used_at", null)
    .gte("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify access code: ${error.message}`);
  }

  if (!data) {
    return {
      ok: false,
      reason: "code_not_found"
    };
  }

  const isValid = hashCode(code) === data.code_hash;
  if (!isValid) {
    return {
      ok: false,
      reason: "invalid_code"
    };
  }

  const { error: updateError } = await supabase
    .from("access_codes")
    .update({ used_at: nowIso })
    .eq("id", data.id);

  if (updateError) {
    throw new Error(`Failed to consume access code: ${updateError.message}`);
  }

  return {
    ok: true,
    user
  };
}

export async function createAppSession(userId) {
  const token = generateAppSessionToken();
  const tokenHash = hashAppSessionToken(token, env.appSessionSecret);
  const expiresAt = new Date(Date.now() + env.appSessionTtlHours * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("app_sessions").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Failed to create app session: ${error.message}`);
  }

  return {
    token,
    expiresAt
  };
}

export async function findUserByAppSessionToken(token) {
  if (!token) {
    return null;
  }

  const tokenHash = hashAppSessionToken(token, env.appSessionSecret);
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { data: session, error: sessionError } = await supabase
    .from("app_sessions")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gte("expires_at", nowIso)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to resolve app session: ${sessionError.message}`);
  }

  if (!session) {
    return null;
  }

  const { error: touchError } = await supabase
    .from("app_sessions")
    .update({ last_used_at: nowIso })
    .eq("id", session.id);

  if (touchError) {
    throw new Error(`Failed to update app session usage: ${touchError.message}`);
  }

  return findUserById(session.user_id);
}

import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  generateAppSessionToken,
  hashAccessCode,
  hashAppSessionToken
} from "../lib/app-session-token.js";
import { sendMagicLinkEmail } from "../lib/email.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";

function generateNumericCode(length = 6) {
  const buffer = crypto.randomBytes(4);
  const value = buffer.readUInt32BE(0) % 10 ** length;
  return value.toString().padStart(length, "0");
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

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { error: invalidateError } = await supabase
    .from("access_codes")
    .update({ used_at: nowIso })
    .eq("user_id", user.id)
    .is("used_at", null);

  if (invalidateError) {
    throw new Error(`Failed to invalidate previous codes: ${invalidateError.message}`);
  }

  const code = generateNumericCode();
  const codeHash = hashAccessCode(code, env.appSessionSecret);
  const expiresAt = new Date(Date.now() + env.authCodeTtlMinutes * 60 * 1000).toISOString();

  const { error } = await supabase.from("access_codes").insert({
    user_id: user.id,
    code_hash: codeHash,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Failed to create access code: ${error.message}`);
  }

  // Fire-and-forget e-mail dispatch via Resend. We don't block the API on this:
  // the dev preview pill and the manual code entry still work if the e-mail
  // service is unavailable. Errors are logged but never raised.
  const magicUrl = `${env.appBaseUrl.replace(/\/$/, "")}/auth/verify?email=${encodeURIComponent(user.email)}&code=${encodeURIComponent(code)}`;
  sendMagicLinkEmail({ to: user.email, name: user.name, code, magicUrl })
    .then((result) => {
      if (!result.ok && result.reason !== "missing_api_key") {
        console.warn(`[auth] magic link e-mail failed for ${user.email}:`, result.error ?? result.status);
      }
    })
    .catch((err) => console.warn(`[auth] magic link dispatch error:`, err?.message ?? err));

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
    .select("id, code_hash, expires_at, used_at, attempts")
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

  if ((data.attempts ?? 0) >= env.authMaxVerifyAttempts) {
    await supabase
      .from("access_codes")
      .update({ used_at: nowIso })
      .eq("id", data.id);
    return {
      ok: false,
      reason: "too_many_attempts"
    };
  }

  const candidateHash = hashAccessCode(code, env.appSessionSecret);
  const expectedBuf = Buffer.from(data.code_hash, "hex");
  const candidateBuf = Buffer.from(candidateHash, "hex");
  const isValid =
    expectedBuf.length === candidateBuf.length &&
    crypto.timingSafeEqual(expectedBuf, candidateBuf);

  if (!isValid) {
    await supabase
      .from("access_codes")
      .update({ attempts: (data.attempts ?? 0) + 1 })
      .eq("id", data.id);
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

  const user = await findUserById(session.user_id);
  if (!user) {
    return null;
  }

  supabase
    .from("app_sessions")
    .update({ last_used_at: nowIso })
    .eq("id", session.id)
    .then(() => null, () => null);

  return { user, sessionId: session.id };
}

export async function revokeAppSession(token) {
  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  const tokenHash = hashAppSessionToken(token, env.appSessionSecret);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("app_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null);

  if (error) {
    throw new Error(`Failed to revoke session: ${error.message}`);
  }

  return { ok: true };
}

import { NextResponse } from "next/server";
import { errorResponse, internalError, readJsonBody } from "../../../../src/lib/api-error.js";
import { env } from "../../../../src/config/env.js";
import { getRequestIp, rateLimit } from "../../../../src/lib/rate-limit.js";
import { isValidAuthCode, isValidEmail } from "../../../../src/lib/validation.js";
import { createAppSession, verifyAccessCode } from "../../../../src/services/auth-service.js";

function mapUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    level: user.level,
    company: user.companies
      ? {
          id: user.companies.id,
          tradeName: user.companies.trade_name,
          cnpj: user.companies.cnpj
        }
      : null
  };
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (parseError) {
      return errorResponse({
        status: 400,
        code: parseError.message === "payload_too_large" ? "payload_too_large" : "invalid_payload",
        message: "Invalid request body."
      });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!isValidEmail(email) || !isValidAuthCode(code)) {
      return errorResponse({
        status: 400,
        code: "invalid_credentials",
        message: "Invalid e-mail or code format."
      });
    }

    const ip = getRequestIp(request);
    const ipLimit = await rateLimit({
      key: `verify-code:ip:${ip}`,
      limit: 10,
      windowMs: 60_000
    });
    const emailLimit = await rateLimit({
      key: `verify-code:email:${email}`,
      limit: env.authMaxVerifyAttempts,
      windowMs: env.authCodeTtlMinutes * 60_000
    });

    if (!ipLimit.ok || !emailLimit.ok) {
      return errorResponse({
        status: 429,
        code: "rate_limited",
        message: "Too many attempts. Please request a new code."
      });
    }

    const result = await verifyAccessCode(email, code);
    if (!result.ok) {
      return errorResponse({
        status: 401,
        code: "invalid_credentials",
        message: "Code is invalid or expired."
      });
    }

    const session = await createAppSession(result.user.id);

    return NextResponse.json({
      ok: true,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      user: mapUser(result.user)
    });
  } catch (error) {
    return internalError(error);
  }
}

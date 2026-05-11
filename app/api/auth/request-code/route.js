import crypto from "node:crypto";
import { errorResponse, internalError, readJsonBody } from "../../../../src/lib/api-error.js";
import { NextResponse } from "next/server";
import { env } from "../../../../src/config/env.js";
import { getRequestIp, rateLimit } from "../../../../src/lib/rate-limit.js";
import { isValidEmail } from "../../../../src/lib/validation.js";
import { requestAccessCode } from "../../../../src/services/auth-service.js";

function generatePreviewCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
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
    if (!isValidEmail(email)) {
      return errorResponse({
        status: 400,
        code: "invalid_email",
        message: "A valid e-mail is required."
      });
    }

    // Optional next path: where the magic-link should redirect after sign-in.
    // Whitelisted to internal absolute paths so it can't be used for open redirects.
    let nextPath = null;
    if (typeof body.next === "string" && /^\/[A-Za-z0-9_\-./]*$/.test(body.next)) {
      nextPath = body.next;
    }

    const ip = getRequestIp(request);
    const ipLimit = await rateLimit({
      key: `request-code:ip:${ip}`,
      limit: env.authRequestRateLimitPerMinute,
      windowMs: 60_000
    });
    const emailLimit = await rateLimit({
      key: `request-code:email:${email}`,
      limit: env.authRequestRateLimitPerMinute,
      windowMs: 60_000
    });

    if (!ipLimit.ok || !emailLimit.ok) {
      return errorResponse({
        status: 429,
        code: "rate_limited",
        message: "Too many requests. Please try again shortly."
      });
    }

    const result = await requestAccessCode(email, { nextPath });

    const allowPreview = !env.isProduction || env.showDevelopmentCodePreview;
    const genericExpiresAt = new Date(Date.now() + env.authCodeTtlMinutes * 60 * 1000).toISOString();

    return NextResponse.json(
      {
        ok: true,
        message: "If the e-mail is registered, a code has been issued.",
        expiresAt: genericExpiresAt,
        developmentCodePreview: allowPreview ? (result.ok ? result.code : generatePreviewCode()) : undefined
      },
      { status: 202 }
    );
  } catch (error) {
    return internalError(error);
  }
}

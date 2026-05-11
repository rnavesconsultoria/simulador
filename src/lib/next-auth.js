import { NextResponse } from "next/server";
import { findUserByAppSessionToken } from "../services/auth-service.js";

function unauthorized(code, message) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message }
    },
    { status: 401 }
  );
}

export function extractBearerToken(request) {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

export async function requireNextUser(request) {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      error: unauthorized("missing_token", "Authentication required.")
    };
  }

  try {
    const result = await findUserByAppSessionToken(token);
    if (!result) {
      return {
        error: unauthorized("invalid_session", "Session is invalid or expired.")
      };
    }

    return { user: result.user, sessionId: result.sessionId, token };
  } catch {
    return {
      error: unauthorized("invalid_session", "Session is invalid or expired.")
    };
  }
}

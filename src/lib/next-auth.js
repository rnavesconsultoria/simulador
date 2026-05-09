import { NextResponse } from "next/server";
import { findUserByAppSessionToken } from "../services/auth-service.js";

export async function requireNextUser(request) {
  const header = request.headers.get("authorization");
  if (!header) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: {
            code: "missing_token",
            message: "Bearer token is required."
          }
        },
        { status: 401 }
      )
    };
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: {
            code: "invalid_token_format",
            message: "Authorization header must use Bearer token."
          }
        },
        { status: 401 }
      )
    };
  }

  const user = await findUserByAppSessionToken(token.trim());
  if (!user) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: {
            code: "invalid_session",
            message: "Session is invalid or expired."
          }
        },
        { status: 401 }
      )
    };
  }

  return { user };
}

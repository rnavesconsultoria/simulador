import { NextResponse } from "next/server";
import { internalError } from "../../../../src/lib/api-error.js";
import { extractBearerToken } from "../../../../src/lib/next-auth.js";
import { revokeAppSession } from "../../../../src/services/auth-service.js";

export async function POST(request) {
  try {
    const token = extractBearerToken(request);
    if (token) {
      await revokeAppSession(token);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalError(error);
  }
}

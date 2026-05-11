import { NextResponse } from "next/server";
import { env } from "../config/env.js";
import { requireNextUser } from "./next-auth.js";

export function isAdminUser(user) {
  if (!user?.email) return false;
  return env.adminEmails.includes(user.email.toLowerCase());
}

export async function requireAdmin(request) {
  const auth = await requireNextUser(request);
  if (auth.error) return auth;
  if (!isAdminUser(auth.user)) {
    return {
      error: NextResponse.json(
        { ok: false, error: { code: "forbidden", message: "Admin access required." } },
        { status: 403 }
      )
    };
  }
  return auth;
}

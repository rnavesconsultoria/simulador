import { NextResponse } from "next/server";
import { internalError } from "../../../../src/lib/api-error.js";
import { requireNextUser } from "../../../../src/lib/next-auth.js";

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

export async function GET(request) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) return auth.error;
    return NextResponse.json({ ok: true, user: mapUser(auth.user) });
  } catch (error) {
    return internalError(error);
  }
}

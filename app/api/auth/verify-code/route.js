import { NextResponse } from "next/server";
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
    const body = await request.json();
    const email = body.email?.trim();
    const code = body.code?.trim();

    if (!email || !code) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "missing_credentials",
            message: "Fields 'email' and 'code' are required."
          }
        },
        { status: 400 }
      );
    }

    const result = await verifyAccessCode(email, code);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: result.reason,
            message: "Code is invalid or expired."
          }
        },
        { status: 401 }
      );
    }

    const session = await createAppSession(result.user.id);

    return NextResponse.json({
      ok: true,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      user: mapUser(result.user)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "internal_error",
          message: error.message ?? "Unexpected error."
        }
      },
      { status: 500 }
    );
  }
}

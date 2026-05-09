import { NextResponse } from "next/server";
import { requestAccessCode } from "../../../../src/services/auth-service.js";

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

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "missing_email",
            message: "The field 'email' is required."
          }
        },
        { status: 400 }
      );
    }

    const result = await requestAccessCode(email);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: result.reason,
            message: "User not found or inactive."
          }
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Access code generated.",
        expiresAt: result.expiresAt,
        user: mapUser(result.user),
        developmentCodePreview: process.env.NODE_ENV === "production" ? undefined : result.code
      },
      { status: 202 }
    );
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

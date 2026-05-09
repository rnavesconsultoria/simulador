import { NextResponse } from "next/server";
import { requireNextUser } from "../../../../../src/lib/next-auth.js";
import { processVendorMessage } from "../../../../../src/services/message-service.js";

export async function POST(request, { params }) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();
    const result = await processVendorMessage({
      sessionId: params.sessionId,
      user: auth.user,
      message: body.message
    });

    if (!result.ok && result.reason === "simulation_not_found") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "simulation_not_found",
            message: "Simulation not found."
          }
        },
        { status: 404 }
      );
    }

    if (!result.ok && result.reason === "missing_message") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "missing_message",
            message: "Field 'message' is required."
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
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

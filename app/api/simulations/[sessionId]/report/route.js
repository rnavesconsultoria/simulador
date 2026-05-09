import { NextResponse } from "next/server";
import { requireNextUser } from "../../../../../src/lib/next-auth.js";
import { generateReportForSimulation } from "../../../../../src/services/report-service.js";

export async function POST(request, { params }) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
    }

    const result = await generateReportForSimulation({
      sessionId: params.sessionId,
      user: auth.user
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

    if (!result.ok && result.reason === "empty_conversation") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "empty_conversation",
            message: "Simulation has no conversation yet."
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

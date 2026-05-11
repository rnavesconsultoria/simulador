import { NextResponse } from "next/server";
import { errorResponse, internalError } from "../../../../../src/lib/api-error.js";
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

    if (!result.ok) {
      const map = {
        simulation_not_found: { status: 404, message: "Simulation not found." },
        empty_conversation: { status: 400, message: "Simulation has no conversation yet." }
      };
      const cfg = map[result.reason] ?? { status: 400, message: "Invalid request." };
      return errorResponse({ status: cfg.status, code: result.reason, message: cfg.message });
    }

    return NextResponse.json(result);
  } catch (error) {
    return internalError(error);
  }
}

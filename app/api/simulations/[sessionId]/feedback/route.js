import { NextResponse } from "next/server";
import { errorResponse, internalError, readJsonBody } from "../../../../../src/lib/api-error.js";
import { requireNextUser } from "../../../../../src/lib/next-auth.js";
import { saveSimulationFeedback } from "../../../../../src/services/feedback-service.js";

export async function POST(request, { params }) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (parseError) {
      return errorResponse({
        status: 400,
        code: parseError.message === "payload_too_large" ? "payload_too_large" : "invalid_payload",
        message: "Invalid request body."
      });
    }

    const result = await saveSimulationFeedback({
      sessionId: params.sessionId,
      userId: auth.user.id,
      payload: body
    });

    if (!result.ok) {
      const map = {
        simulation_not_found: { status: 404, message: "Simulation not found." },
        invalid_scores: { status: 400, message: "Scores must be integers between 1 and 5." }
      };
      const cfg = map[result.reason] ?? { status: 400, message: "Invalid request." };
      return errorResponse({ status: cfg.status, code: result.reason, message: cfg.message });
    }

    return NextResponse.json({ ok: true, feedback: result.feedback });
  } catch (error) {
    return internalError(error);
  }
}

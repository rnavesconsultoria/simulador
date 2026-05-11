import { NextResponse } from "next/server";
import { errorResponse, internalError, readJsonBody } from "../../../../../src/lib/api-error.js";
import { requireNextUser } from "../../../../../src/lib/next-auth.js";
import { processVendorMessage } from "../../../../../src/services/message-service.js";

export async function POST(request, { params }) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
    }

    let body;
    try {
      body = await readJsonBody(request, { maxBytes: 16_384 });
    } catch (parseError) {
      return errorResponse({
        status: 400,
        code: parseError.message === "payload_too_large" ? "payload_too_large" : "invalid_payload",
        message: "Invalid request body."
      });
    }

    const result = await processVendorMessage({
      sessionId: params.sessionId,
      user: auth.user,
      message: body.message
    });

    if (!result.ok) {
      const map = {
        simulation_not_found: { status: 404, message: "Simulation not found." },
        missing_message: { status: 400, message: "Field 'message' is required." },
        message_too_long: { status: 400, message: "Message exceeds the allowed length." }
      };
      const cfg = map[result.reason] ?? { status: 400, message: "Invalid request." };
      return errorResponse({ status: cfg.status, code: result.reason, message: cfg.message });
    }

    return NextResponse.json(result);
  } catch (error) {
    return internalError(error);
  }
}

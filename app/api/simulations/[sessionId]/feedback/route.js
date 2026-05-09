import { NextResponse } from "next/server";
import { requireNextUser } from "../../../../../src/lib/next-auth.js";
import { saveSimulationFeedback } from "../../../../../src/services/feedback-service.js";

export async function POST(request, { params }) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();
    const feedback = await saveSimulationFeedback({
      sessionId: params.sessionId,
      userId: auth.user.id,
      payload: body
    });

    return NextResponse.json({
      ok: true,
      feedback
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

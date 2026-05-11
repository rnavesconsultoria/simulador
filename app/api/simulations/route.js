import { NextResponse } from "next/server";
import { errorResponse, internalError } from "../../../src/lib/api-error.js";
import { requireNextUser } from "../../../src/lib/next-auth.js";
import { generateScenarioForUser } from "../../../src/services/scenario-service.js";

export async function POST(request) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
    }

    if (!auth.user.companies?.briefing_markdown) {
      return errorResponse({
        status: 400,
        code: "missing_briefing",
        message: "User does not have an associated company briefing."
      });
    }

    const result = await generateScenarioForUser(auth.user);

    return NextResponse.json(
      {
        ok: true,
        session: result.simulationSession,
        scenario: result.scenario
      },
      { status: 201 }
    );
  } catch (error) {
    return internalError(error);
  }
}

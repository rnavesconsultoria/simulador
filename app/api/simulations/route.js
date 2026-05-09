import { NextResponse } from "next/server";
import { requireNextUser } from "../../../src/lib/next-auth.js";
import { generateScenarioForUser } from "../../../src/services/scenario-service.js";

export async function POST(request) {
  try {
    const auth = await requireNextUser(request);
    if (auth.error) {
      return auth.error;
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

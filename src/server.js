import "dotenv/config";
import dotenv from "dotenv";
import http from "node:http";
import { URL } from "node:url";
import { env, validateEnv } from "./config/env.js";
import {
  createAppSession,
  findUserByAppSessionToken,
  requestAccessCode,
  verifyAccessCode
} from "./services/auth-service.js";
import { saveSimulationFeedback } from "./services/feedback-service.js";
import { processVendorMessage } from "./services/message-service.js";
import { generateReportForSimulation } from "./services/report-service.js";
import { generateScenarioForUser } from "./services/scenario-service.js";
import { createHttpError, normalizeAuthorizationToken, readJsonBody, sendJson } from "./lib/http.js";
import { serveStaticAsset } from "./lib/static-files.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

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

async function handleRequestCode(request, response) {
  const body = await readJsonBody(request);
  const email = body.email?.trim();

  if (!email) {
    throw createHttpError(400, "missing_email", "The field 'email' is required.");
  }

  const result = await requestAccessCode(email);
  if (!result.ok) {
    throw createHttpError(404, result.reason, "User not found or inactive.");
  }

  sendJson(response, 202, {
    ok: true,
    message: "Access code generated.",
    expiresAt: result.expiresAt,
    user: mapUser(result.user),
    developmentCodePreview: process.env.NODE_ENV === "production" && !env.showDevelopmentCodePreview ? undefined : result.code
  });
}

async function handleVerifyCode(request, response) {
  const body = await readJsonBody(request);
  const email = body.email?.trim();
  const code = body.code?.trim();

  if (!email || !code) {
    throw createHttpError(400, "missing_credentials", "Fields 'email' and 'code' are required.");
  }

  const result = await verifyAccessCode(email, code);
  if (!result.ok) {
    throw createHttpError(401, result.reason, "Code is invalid or expired.");
  }

  const session = await createAppSession(result.user.id);

  sendJson(response, 200, {
    ok: true,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    user: mapUser(result.user)
  });
}

async function handleCreateSimulation(request, response) {
  const token = normalizeAuthorizationToken(request.headers.authorization);
  if (!token) {
    throw createHttpError(401, "missing_token", "Bearer token is required.");
  }

  const user = await findUserByAppSessionToken(token);
  if (!user) {
    throw createHttpError(401, "invalid_session", "Session is invalid or expired.");
  }

  const result = await generateScenarioForUser(user);

  sendJson(response, 201, {
    ok: true,
    session: result.simulationSession,
    scenario: result.scenario
  });
}

async function handleSimulationMessage(request, response, sessionId) {
  const user = await requireAuthenticatedUser(request);

  const body = await readJsonBody(request);
  const result = await processVendorMessage({
    sessionId,
    user,
    message: body.message
  });

  if (!result.ok && result.reason === "simulation_not_found") {
    throw createHttpError(404, "simulation_not_found", "Simulation not found.");
  }

  if (!result.ok && result.reason === "missing_message") {
    throw createHttpError(400, "missing_message", "Field 'message' is required.");
  }

  sendJson(response, 200, result);
}

async function requireAuthenticatedUser(request) {
  const token = normalizeAuthorizationToken(request.headers.authorization);
  if (!token) {
    throw createHttpError(401, "missing_token", "Bearer token is required.");
  }

  const user = await findUserByAppSessionToken(token);
  if (!user) {
    throw createHttpError(401, "invalid_session", "Session is invalid or expired.");
  }

  return user;
}

async function handleGenerateReport(request, response, sessionId) {
  const user = await requireAuthenticatedUser(request);
  const result = await generateReportForSimulation({ sessionId, user });

  if (!result.ok && result.reason === "simulation_not_found") {
    throw createHttpError(404, "simulation_not_found", "Simulation not found.");
  }

  if (!result.ok && result.reason === "empty_conversation") {
    throw createHttpError(400, "empty_conversation", "Simulation has no conversation yet.");
  }

  sendJson(response, 200, result);
}

async function handleSimulationFeedback(request, response, sessionId) {
  const user = await requireAuthenticatedUser(request);
  const body = await readJsonBody(request);
  const feedback = await saveSimulationFeedback({
    sessionId,
    userId: user.id,
    payload: body
  });

  sendJson(response, 200, {
    ok: true,
    feedback
  });
}

async function router(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    const served = await serveStaticAsset(response, url.pathname);
    if (served) {
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/request-code") {
    await handleRequestCode(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/verify-code") {
    await handleVerifyCode(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulations") {
    await handleCreateSimulation(request, response);
    return;
  }

  const simulationMessageMatch = url.pathname.match(/^\/api\/simulations\/([a-f0-9-]+)\/messages$/i);
  if (request.method === "POST" && simulationMessageMatch) {
    await handleSimulationMessage(request, response, simulationMessageMatch[1]);
    return;
  }

  const simulationReportMatch = url.pathname.match(/^\/api\/simulations\/([a-f0-9-]+)\/report$/i);
  if (request.method === "POST" && simulationReportMatch) {
    await handleGenerateReport(request, response, simulationReportMatch[1]);
    return;
  }

  const simulationFeedbackMatch = url.pathname.match(/^\/api\/simulations\/([a-f0-9-]+)\/feedback$/i);
  if (request.method === "POST" && simulationFeedbackMatch) {
    await handleSimulationFeedback(request, response, simulationFeedbackMatch[1]);
    return;
  }

  throw createHttpError(404, "not_found", "Route not found.");
}

async function main() {
  validateEnv();

  const port = Number(process.env.PORT ?? 3000);
  const server = http.createServer(async (request, response) => {
    try {
      await router(request, response);
    } catch (error) {
      const statusCode = error.statusCode ?? 500;
      const code = error.code ?? "internal_error";
      sendJson(response, statusCode, {
        ok: false,
        error: {
          code,
          message: error.message ?? "Unexpected error."
        }
      });
    }
  });

  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

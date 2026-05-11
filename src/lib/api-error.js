import { NextResponse } from "next/server";
import { env } from "../config/env.js";

export function errorResponse({ status, code, message, details }) {
  const body = {
    ok: false,
    error: { code, message }
  };
  if (details && !env.isProduction) {
    body.error.details = details;
  }
  return NextResponse.json(body, { status });
}

export function internalError(error, fallback = "Unexpected error.") {
  if (typeof console !== "undefined" && console.error) {
    console.error("[api]", error?.stack ?? error?.message ?? error);
  }
  return errorResponse({
    status: 500,
    code: "internal_error",
    message: fallback
  });
}

export async function readJsonBody(request, { maxBytes = 32_768 } = {}) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new Error("payload_too_large");
  }
  try {
    return await request.json();
  } catch {
    throw new Error("invalid_json");
  }
}

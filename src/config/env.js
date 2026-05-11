const requiredEnvVars = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "APP_SESSION_SECRET"
];

function readEnv(name, { required = false, fallback = undefined } = {}) {
  const value = process.env[name] ?? fallback;
  if (required && (!value || value.trim() === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBooleanEnv(name, fallback = false) {
  const value = readEnv(name, { fallback: fallback ? "true" : "false" });
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function validateEnv() {
  for (const name of requiredEnvVars) {
    readEnv(name, { required: true });
  }
}

export const env = {
  get supabaseUrl() {
    return readEnv("SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return readEnv("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return readEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get supabaseDbPassword() {
    return readEnv("SUPABASE_DB_PASSWORD");
  },
  get openAiApiKey() {
    return readEnv("OPENAI_API_KEY");
  },
  get openAiModelCriador() {
    return readEnv("OPENAI_MODEL_CRIADOR", { fallback: "gpt-5.4-2026-03-05" });
  },
  get openAiModelCliente() {
    return readEnv("OPENAI_MODEL_CLIENTE", { fallback: "gpt-5.4-2026-03-05" });
  },
  get openAiModelModerador() {
    return readEnv("OPENAI_MODEL_MODERADOR", { fallback: "gpt-5.4-mini-2026-03-17" });
  },
  get openAiModelIntencao() {
    return readEnv("OPENAI_MODEL_INTENCAO", { fallback: "gpt-5.4-mini-2026-03-17" });
  },
  get openAiModelGerente() {
    return readEnv("OPENAI_MODEL_GERENTE", { fallback: "gpt-5.4-2026-03-05" });
  },
  get appSessionSecret() {
    return readEnv("APP_SESSION_SECRET", { required: true });
  },
  get appSessionTtlHours() {
    return Number(readEnv("APP_SESSION_TTL_HOURS", { fallback: "24" }));
  },
  get authCodeTtlMinutes() {
    return Number(readEnv("AUTH_CODE_TTL_MINUTES", { fallback: "15" }));
  },
  get authMaxVerifyAttempts() {
    return Number(readEnv("AUTH_MAX_VERIFY_ATTEMPTS", { fallback: "5" }));
  },
  get authRequestRateLimitPerMinute() {
    return Number(readEnv("AUTH_REQUEST_RATE_LIMIT_PER_MINUTE", { fallback: "5" }));
  },
  get adminEmails() {
    const raw = readEnv("ADMIN_EMAILS", { fallback: "" });
    return (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get showDevelopmentCodePreview() {
    return readBooleanEnv("SHOW_DEVELOPMENT_CODE_PREVIEW", false);
  },
  get appBaseUrl() {
    return readEnv("APP_BASE_URL", { fallback: "http://localhost:3000" });
  },
  get nodeEnv() {
    return readEnv("NODE_ENV", { fallback: "development" });
  },
  get isProduction() {
    return readEnv("NODE_ENV", { fallback: "development" }) === "production";
  }
};

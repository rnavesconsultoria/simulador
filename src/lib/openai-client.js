import OpenAI from "openai";
import { env, validateEnv } from "../config/env.js";

let client;

export function getOpenAiClient() {
  if (!client) {
    validateEnv();
    client = new OpenAI({ apiKey: env.openAiApiKey });
  }
  return client;
}

import { readFile } from "node:fs/promises";
import path from "node:path";

const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");
const CACHE_TTL_MS = 60_000;

const cache = new Map();

export async function loadPrompt(promptName) {
  const cached = cache.get(promptName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const filePath = path.join(PROMPTS_DIR, `${promptName}.md`);
  const value = await readFile(filePath, "utf8");
  cache.set(promptName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function clearPromptCache() {
  cache.clear();
}

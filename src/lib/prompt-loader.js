import { readFile } from "node:fs/promises";
import path from "node:path";

const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

export async function loadPrompt(promptName) {
  const filePath = path.join(PROMPTS_DIR, `${promptName}.md`);
  return readFile(filePath, "utf8");
}

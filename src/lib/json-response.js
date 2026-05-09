export function extractJsonPayload(rawText) {
  if (!rawText || rawText.trim() === "") {
    throw new Error("OpenAI response did not include output text.");
  }

  let text = rawText.trim();
  text = text.replace(/^\s*```(?:json)?\s*/i, "");
  text = text.replace(/\s*```\s*$/i, "");

  const firstBrace = text.search(/[\[{]/);
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

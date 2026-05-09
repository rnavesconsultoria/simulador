export function extractUsage(response) {
  const usage = response?.usage;
  if (!usage) {
    return null;
  }

  return {
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null
  };
}

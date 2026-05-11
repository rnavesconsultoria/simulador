const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function escapeBraces(input) {
  return String(input).replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");
}

export function renderPrompt(template, values) {
  return template.replace(PLACEHOLDER_REGEX, (_match, key) => {
    const value = values?.[key];
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return escapeBraces(value);
    }
    return escapeBraces(JSON.stringify(value));
  });
}

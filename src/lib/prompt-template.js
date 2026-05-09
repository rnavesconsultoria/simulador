const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function renderPrompt(template, values) {
  return template.replace(PLACEHOLDER_REGEX, (_, key) => {
    const value = values[key];
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value);
  });
}

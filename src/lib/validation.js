const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^[0-9]{4,8}$/;

export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function isValidAuthCode(value) {
  return typeof value === "string" && CODE_REGEX.test(value.trim());
}

export function clampString(value, maxLength) {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

export function isInt(value, { min, max } = {}) {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  if (typeof min === "number" && value < min) return false;
  if (typeof max === "number" && value > max) return false;
  return true;
}

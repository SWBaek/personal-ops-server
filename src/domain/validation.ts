const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireNonEmptyText(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== "string") {
    throw new InputError(`${field} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new InputError(`${field} must not be empty`);
  }
  if (normalized.length > maxLength) {
    throw new InputError(`${field} must be at most ${maxLength} characters`);
  }

  return normalized;
}

export function optionalIsoDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new InputError(`${field} must use YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InputError(`${field} must be a real calendar date`);
  }

  return value;
}

export function localDateString(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class InputError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}


export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function text(
  value: unknown,
  name: string,
  max: number,
  required = true,
): string {
  if (typeof value !== "string")
    throw new HttpError(400, `${name} must be text.`);
  const clean = value.trim();
  if (
    (required && !clean) ||
    clean.length > max ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(clean)
  ) {
    throw new HttpError(
      400,
      `${name} must be ${required ? "1" : "0"}–${max} characters.`,
    );
  }
  return clean;
}
export function skuCode(value: unknown, label = "SKU"): string {
  const sku = text(value, label, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(sku))
    throw new HttpError(
      400,
      `${label} must start with a letter or number and contain only letters, numbers, dots, hyphens, slashes or underscores.`,
    );
  return sku;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
  )
    throw new HttpError(400, "Invalid request or receipt ID.");
  return value.toLowerCase();
}
export function quantity(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1_000_000
  )
    throw new HttpError(
      400,
      "Quantity must be a whole number from 0 to 1,000,000.",
    );
  return value;
}

import { HttpError } from "./errors";

export function readGridDimension(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 128
  ) {
    throw new HttpError(400, `${label} must be an integer from 1 to 128`);
  }

  return value;
}

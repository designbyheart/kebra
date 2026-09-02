/**
 * Coded, speakable tool errors. Handlers throw these; the dispatcher turns
 * them into { ok:false, error:{code,message,details}, speech_hint } with a 4xx.
 * Codes: see docs/TOOLS.md "Error codes".
 */
export type ToolErrorCode =
  | "not_found"
  | "ambiguous"
  | "slot_taken"
  | "outside_hours"
  | "invalid_state"
  | "validation"
  | "upstream"
  | "unauthorized";

const STATUS: Record<ToolErrorCode, number> = {
  not_found: 404,
  ambiguous: 409,
  slot_taken: 409,
  outside_hours: 422,
  invalid_state: 422,
  validation: 400,
  upstream: 502,
  unauthorized: 401,
};

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly speechHint: string;
  readonly details?: unknown;
  constructor(code: ToolErrorCode, message: string, speechHint: string, details?: unknown) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.speechHint = speechHint;
    this.details = details;
  }
  get status() {
    return STATUS[this.code];
  }
}

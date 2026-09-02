/**
 * Door / gate / lockbox codes and phone numbers are masked by default in the
 * office UI and revealed per click (nothing is logged). The import already
 * replaced most codes with "[code]"; this catches literal digits that slipped
 * through and anything typed later by the office or the agent.
 *
 * Pure; unit tested in sensitive.test.ts. Rendered by `atoms/masked-text`.
 */
export const SENSITIVE_RE =
  /((?:(?:door|gate|garage|access|master|alarm|keypad|entry|unit|building|lock\s*box|lockbox)\s*)?(?:code|pin|passcode|combo|combination)s?\s*(?:is|:|#|-|=)?\s*#?\s*)([A-Za-z]?\d{3,8}[A-Za-z]?(?:\s*[#*]\s*)?)|((?:lock\s*box|lockbox)\s*(?:is|:|#|-|=)?\s*#?\s*)(\d{3,8})|((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/gi;

export type MaskedSegment = { text: string; sensitive: boolean };

/** Split text into plain and sensitive segments. */
export function splitSensitive(text: string): MaskedSegment[] {
  const out: MaskedSegment[] = [];
  let last = 0;
  const re = new RegExp(SENSITIVE_RE.source, SENSITIVE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const full = m[0];
    const start = m.index;
    // Keep the label ("gate code: ") visible, mask only the secret part.
    const label = m[1] ?? m[3] ?? "";
    const secret = m[2] ?? m[4] ?? m[5] ?? "";
    if (start > last) out.push({ text: text.slice(last, start), sensitive: false });
    if (label) out.push({ text: label, sensitive: false });
    out.push({ text: secret || full, sensitive: true });
    last = start + full.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), sensitive: false });
  if (out.length === 0) return [{ text, sensitive: false }];
  return out;
}

export function hasSensitive(text: string): boolean {
  return splitSensitive(text).some((s) => s.sensitive);
}

/** "••••" placeholder sized to the secret (4–8 dots). */
export function maskDots(length: number): string {
  return "•".repeat(Math.max(4, Math.min(length, 8)));
}

/** Placeholder line for a whole hidden block (16–48 dots, ~1/3 of the text). */
export function blockDots(length: number): string {
  return "•".repeat(Math.min(48, Math.max(16, Math.round(length / 3))));
}

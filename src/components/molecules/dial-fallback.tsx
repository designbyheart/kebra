export type DialFallbackProps = { phoneE164: string; phoneLabel: string };

/** "Prefer to dial?" footer under the web-call panel, with the recording note. */
export function DialFallback({ phoneE164, phoneLabel }: DialFallbackProps) {
  return (
    <>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Prefer to dial?{" "}
        <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${phoneE164}`}>
          {phoneLabel}
        </a>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">Calls are recorded and appear on the office board live. Uses your microphone.</p>
    </>
  );
}

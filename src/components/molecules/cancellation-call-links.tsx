import Link from "next/link";

export type CancellationCallLinksProps = {
  callId: string;
  recordingUrl: string | null;
  callerNumberMasked: string | null;
};

/** "Full call → · Recording ↗ · +1 (305) •••-1234" beside the transcript heading. */
export function CancellationCallLinks({ callId, recordingUrl, callerNumberMasked }: CancellationCallLinksProps) {
  return (
    <span className="ml-auto flex items-center gap-3 text-sm">
      <Link href={`/calls/${callId}`} className="font-medium text-primary hover:underline">
        Full call →
      </Link>
      {recordingUrl && (
        <a href={recordingUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-primary hover:underline">
          Recording ↗
        </a>
      )}
      {!recordingUrl && <span className="text-muted-foreground">No recording</span>}
      {callerNumberMasked && <span className="text-xs text-muted-foreground">{callerNumberMasked}</span>}
    </span>
  );
}

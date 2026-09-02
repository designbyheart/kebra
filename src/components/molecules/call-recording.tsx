export type CallRecordingProps = { url: string };

/** "Recording" card with the native audio player under the transcript. */
export function CallRecording({ url }: CallRecordingProps) {
  return (
    <div className="mt-3 rounded-lg border bg-card p-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recording</div>
      <audio controls preload="none" src={url} className="h-9 w-full" />
    </div>
  );
}

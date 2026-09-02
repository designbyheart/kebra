import { MaskedBlock } from "@/components/atoms/masked-block";

export type AccessNotesProps = { text: string | null };

/** Masked access notes on the address dossier; nothing when there are none. */
export function AccessNotes({ text }: AccessNotesProps) {
  if (!text) return null;
  return <MaskedBlock text={text} label="Access notes · masked" />;
}

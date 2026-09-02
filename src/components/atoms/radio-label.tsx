import { RadioInput } from "@/components/atoms/radio-input";

export type RadioLabelProps = {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
};

/** A radio with its text beside it (dialog choice rows). */
export function RadioLabel({ name, checked, onChange, children }: RadioLabelProps) {
  return (
    <label className="flex items-center gap-2">
      <RadioInput name={name} checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

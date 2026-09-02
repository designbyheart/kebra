const WRAPPER = {
  /** Label text is uppercase and muted; the control keeps its own type. */
  upper: "flex flex-col gap-1",
  /** Label carries the type so the control inherits `text-sm font-medium`. */
  plain: "flex flex-col gap-1 text-sm font-medium",
  /** Label carries the uppercase muted type (job actions). */
  wrapping: "flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground",
} as const;

const LABEL = {
  upper: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
  plain: undefined,
  wrapping: undefined,
} as const;

export type FormFieldProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  variant?: keyof typeof WRAPPER;
  htmlFor?: string;
};

/** A label stacked above its control. */
export function FormField({ label, children, variant = "upper", htmlFor }: FormFieldProps) {
  return (
    <label className={WRAPPER[variant]} htmlFor={htmlFor}>
      <span className={LABEL[variant]}>{label}</span>
      {children}
    </label>
  );
}

import { cn } from "@/lib/utils";

export type NativeSelectProps = React.ComponentProps<"select">;

/**
 * Styled native <select>. Callers pass `className` for size / surface
 * overrides (`cn` resolves Tailwind conflicts).
 */
export function NativeSelect({ className, ...props }: NativeSelectProps) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

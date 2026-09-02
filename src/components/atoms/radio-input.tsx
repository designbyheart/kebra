export type RadioInputProps = Omit<React.ComponentProps<"input">, "type">;

/** Native radio button tinted with the foreground colour. */
export function RadioInput(props: RadioInputProps) {
  return <input type="radio" className="accent-foreground" {...props} />;
}

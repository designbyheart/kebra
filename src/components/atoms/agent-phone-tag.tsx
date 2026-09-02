export type AgentPhoneTagProps = { className?: string };

/** Tiny "Agent" mark after a phone number the agent captured on a call. */
export function AgentPhoneTag({ className = "rounded bg-teal-600 px-1 text-xs font-medium text-white" }: AgentPhoneTagProps) {
  return <span className={className}>Agent</span>;
}

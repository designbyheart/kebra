import { LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  office: "Office",
  tech: "Tech",
};

/** Signed-in user (name, role) and a Logout button. Renders nothing when there is no session. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="mt-auto flex items-center gap-2 border-t px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={user.email}>
          {user.name}
        </div>
        <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</div>
      </div>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

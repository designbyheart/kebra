import { Toaster } from "@/components/atoms/ui/sonner";
import { TooltipProvider } from "@/components/atoms/ui/tooltip";
import { BrandLink } from "@/components/atoms/brand-link";
import { ThemeToggle } from "@/components/molecules/theme-toggle";
import { Nav } from "@/components/organisms/nav";
import { UserMenu } from "@/components/organisms/user-menu";
import { ThemeProvider } from "./theme-provider";

export type AppShellProps = { children: React.ReactNode };

/** Root layout body: providers, the sidebar (brand, nav, user, theme) and the main column. */
export function AppShell({ children }: AppShellProps) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="flex min-h-screen">
          <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
            <div className="flex h-14 items-center border-b px-4">
              <BrandLink />
            </div>
            <Nav />
            <UserMenu />
            <div className="mt-auto flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
              <span>America/New_York</span>
              <ThemeToggle />
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

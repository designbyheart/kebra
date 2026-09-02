import type { Metadata } from "next";
import { Urbanist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Nav } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const urbanist = Urbanist({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kebra Front Desk", template: "%s · Kebra Front Desk" },
  description: "AI front desk for an HVAC service business",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${urbanist.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
              <div className="flex h-14 items-center border-b px-4">
                <Link href="/today" className="text-sm font-semibold tracking-tight">
                  Kebra Front Desk
                </Link>
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
      </body>
    </html>
  );
}

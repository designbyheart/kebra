import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kebra Front Desk", template: "%s · Kebra Front Desk" },
  description: "AI front desk for an HVAC service business",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
              <div className="flex h-14 items-center border-b px-4">
                <Link href="/today" className="text-sm font-semibold tracking-tight">
                  Kebra Front Desk
                </Link>
              </div>
              <Nav />
              <div className="mt-auto border-t p-3 text-xs text-muted-foreground">America/New_York</div>
            </aside>
            <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
          </div>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}

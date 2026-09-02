"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export type ThemeProviderProps = { children: React.ReactNode };

/** next-themes: class strategy, follows the OS by default. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

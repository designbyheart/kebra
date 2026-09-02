"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/atoms/ui/button";

const ORDER = ["light", "dark", "system"] as const;
type Theme = (typeof ORDER)[number];
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
const ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

function isTheme(value: string | undefined): value is Theme {
  return ORDER.includes(value as Theme);
}

export type ThemeToggleProps = { className?: string };

/** Cycles light → dark → system. Renders a neutral placeholder until mounted to avoid hydration mismatch. */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current: Theme = (mounted && isTheme(theme) && theme) || "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICON[current];

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[current]} (click for ${LABEL[next]})`}
    >
      <Icon className="size-4" aria-hidden />
      <span>{LABEL[current]}</span>
    </Button>
  );
}

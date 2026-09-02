import { cn } from "@/lib/utils";

const WIDTH = { sm: "w-full max-w-sm", md: "w-full max-w-md" } as const;
const SCROLL = { on: "overflow-y-auto py-8", off: undefined } as const;

export type OverlayPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  width?: keyof typeof WIDTH;
  /** Let the panel scroll on short viewports (the call page). */
  scrollable?: boolean;
  children: React.ReactNode;
};

/** Centered panel that covers the app shell: Login and the public Call page. */
export function OverlayPage({ eyebrow, title, description, width = "sm", scrollable = false, children }: OverlayPageProps) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-background px-4", scrollable && SCROLL.on)}>
      <div className={WIDTH[width]}>
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

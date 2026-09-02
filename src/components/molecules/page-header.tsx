export type PageHeaderProps = { title: string; description?: string };

/** Title and optional one-line description at the top of a list page. */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-6 border-b pb-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}

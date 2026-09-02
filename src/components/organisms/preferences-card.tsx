import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { preferenceValue } from "@/lib/ui/customer-view";

export type PreferencesCardProps = {
  /** Non-empty dossier preferences as [key, value] pairs. */
  prefs: [string, unknown][];
};

/** Dossier preferences as a definition list; nothing when there are none. */
export function PreferencesCard({ prefs }: PreferencesCardProps) {
  if (prefs.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1.5 text-sm">
          {prefs.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
              <dd className="min-w-0">{preferenceValue(v)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

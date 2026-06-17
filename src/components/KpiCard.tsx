import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  hint,
  icon,
  to,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  to?: string;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
}) {
  const toneClass: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  const inner = (
    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-card/80">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <div className={`mt-2 font-mono text-2xl font-semibold ${toneClass[tone]}`}>{value}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to} className="block focus:outline-none">{inner}</Link>;
  return inner;
}

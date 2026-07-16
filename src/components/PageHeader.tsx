import { type ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  titleClassName,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className={titleClassName ?? "text-2xl font-bold tracking-tight"}>{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}


import type { ReactNode } from "react";

export type PropRow = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description: ReactNode;
};

interface PropTableProps {
  rows: PropRow[];
  nameLabel?: string;
}

export function PropTable({ rows, nameLabel = "Parameter" }: PropTableProps) {
  return (
    <div className="my-space-lg overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-body-sm">
        <thead className="bg-muted/30 text-caption uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">{nameLabel}</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-border">
              <td className="px-4 py-3 align-top">
                <code className="font-mono text-foreground">{row.name}</code>
                {row.required && (
                  <span className="ml-2 inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-destructive">
                    required
                  </span>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <code className="font-mono text-muted-foreground">{row.type}</code>
                {row.defaultValue && (
                  <div className="mt-1 text-caption text-muted-foreground">
                    default: <code className="font-mono text-foreground/80">{row.defaultValue}</code>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 align-top text-foreground/85">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

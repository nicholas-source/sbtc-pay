export function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(rows: Record<string, string | number>[], filename: string): void {
  if (rows.length === 0) {
    console.warn("exportToCSV: No data to export");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => headers.map((h) => escapeCSV(row[h] ?? "")).join(",")),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

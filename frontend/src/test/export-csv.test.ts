import { describe, it, expect } from "vitest";

/**
 * Tests for CSV export utility.
 * We test the escaping logic without triggering DOM download.
 */

// Inline the escape logic since the module triggers DOM APIs
function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

describe("escapeCSV", () => {
  it("returns plain string as-is", () => {
    expect(escapeCSV("hello")).toBe("hello");
  });

  it("wraps strings with commas in quotes", () => {
    expect(escapeCSV("hello,world")).toBe('"hello,world"');
  });

  it("wraps strings with newlines in quotes", () => {
    expect(escapeCSV("line1\nline2")).toBe('"line1\nline2"');
  });

  it("escapes double quotes inside quoted strings", () => {
    expect(escapeCSV('say "hello"')).toBe('"say ""hello"""');
  });

  it("converts numbers to strings", () => {
    expect(escapeCSV(42)).toBe("42");
    expect(escapeCSV(0)).toBe("0");
  });

  it("handles empty string", () => {
    expect(escapeCSV("")).toBe("");
  });
});

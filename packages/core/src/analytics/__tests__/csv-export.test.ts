import { describe, expect, it } from "vitest";
import { toCsv } from "../csv-export";

describe("toCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a header row from the first row's keys, then one line per row", () => {
    const csv = toCsv([
      { hook: "Why nobody talks about this", views: 1000 },
      { hook: "Stop doing this", views: 500 },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("hook,views");
    expect(lines[1]).toBe("Why nobody talks about this,1000");
    expect(lines[2]).toBe("Stop doing this,500");
  });

  it("quotes and escapes a field containing a comma", () => {
    const csv = toCsv([{ hook: "Hooks, hooks, hooks", views: 1 }]);
    expect(csv).toContain('"Hooks, hooks, hooks"');
  });

  it("quotes and doubles an embedded quote", () => {
    const csv = toCsv([{ hook: 'She said "wow"', views: 1 }]);
    expect(csv).toContain('"She said ""wow"""');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv([{ hook: "Line one\nLine two", views: 1 }]);
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("renders null as an empty field", () => {
    const csv = toCsv([{ hook: null, views: 1 }]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(",1");
  });
});

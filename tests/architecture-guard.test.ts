import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, acc);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("Architecture guard — client secret boundary", () => {
  it("app/ never imports server-only credential modules", () => {
    const appRoot = join(process.cwd(), "app");
    const offenders = walk(appRoot).filter((file) => {
      const content = readFileSync(file, "utf8");
      return (
        /CALLE_API_KEY|process\.env\.CALLE|server\/calle\/config|server\/_core\/env/.test(content)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("architecture modules exist for V5 snapshot", () => {
    const required = [
      "server/calle/v5-flags.ts",
      "server/calle/call-events.ts",
      "server/calle/correlation.ts",
      "server/calle/command-center.ts",
      "docs/calle-v5/architecture.md",
    ];
    for (const path of required) {
      expect(() => readFileSync(join(process.cwd(), path), "utf8")).not.toThrow();
    }
  });
});

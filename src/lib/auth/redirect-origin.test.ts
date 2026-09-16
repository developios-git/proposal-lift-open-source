import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the ERR_ADDRESS_INVALID regression at its source.
 *
 * Next.js builds `request.url` from the address the server bound to, not from
 * the Host header the browser sent. Under the standalone server in Docker
 * (`HOSTNAME=0.0.0.0`) its origin is `http://0.0.0.0:3000` — a wildcard listen
 * address no browser will connect to — so every redirect built from it dies,
 * including the one at the end of email confirmation. `getRequestOrigin` in
 * @/lib/url reads the headers instead.
 *
 * Routes are not unit-tested in this codebase (they would be mostly Supabase
 * mocks), so this scans them instead: any route that redirects must not derive
 * its origin from the request URL.
 */
const APP_DIR = path.join(process.cwd(), "src", "app");

/** The shapes that reintroduce the bug. */
const BANNED = [
  { pattern: /\{[^}]*\borigin\b[^}]*\}\s*=\s*new URL\(\s*request\.url/, name: "destructured origin from new URL(request.url)" },
  { pattern: /new URL\(\s*request\.url\s*\)\s*\.origin/, name: "new URL(request.url).origin" },
  { pattern: /\bnextUrl\.origin\b/, name: "request.nextUrl.origin" },
];

function routeFiles(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(`route.ts`))
    .map((entry) => path.join(APP_DIR, entry));
}

describe("redirect origins", () => {
  it("finds the route files it is supposed to be scanning", () => {
    // A rename that empties the glob would turn every assertion below into a
    // vacuous pass.
    expect(routeFiles().length).toBeGreaterThan(5);
  });

  it.each(routeFiles().map((file) => [path.relative(process.cwd(), file), file]))(
    "%s does not build a redirect from the request URL",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      // A route that never redirects is free to use the request URL: the Upwork
      // portfolio import, for one, needs a server-reachable origin to call
      // itself with, which is a different question from where a browser lives.
      if (!source.includes("NextResponse.redirect")) return;

      const found = BANNED.filter(({ pattern }) => pattern.test(source)).map(
        ({ name }) => name,
      );
      expect(
        found,
        `use getRequestOrigin(request) from @/lib/url instead`,
      ).toEqual([]);
    },
  );
});

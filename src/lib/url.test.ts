import { afterEach, describe, expect, it, vi } from "vitest";
import { getRequestOrigin, getURL } from "./url";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Every URL variable `getURL` consults, stubbed on every call so a real one
 * leaking in from the shell (CI on Vercel sets these) cannot change a result.
 */
function stubUrls(
  overrides: Partial<{
    app: string;
    site: string;
    publicProdUrl: string;
    prodUrl: string;
    publicVercelUrl: string;
    vercelUrl: string;
  }> = {},
) {
  const v = {
    app: "",
    site: "",
    publicProdUrl: "",
    prodUrl: "",
    publicVercelUrl: "",
    vercelUrl: "",
    ...overrides,
  };
  vi.stubEnv("NEXT_PUBLIC_APP_URL", v.app);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", v.site);
  vi.stubEnv(
    "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
    v.publicProdUrl,
  );
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", v.prodUrl);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", v.publicVercelUrl);
  vi.stubEnv("VERCEL_URL", v.vercelUrl);
}

/** A request carrying just the headers these helpers read. */
function requestWith(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

describe("getURL", () => {
  it("uses NEXT_PUBLIC_APP_URL with a trailing slash", () => {
    stubUrls({ app: "https://proposals.example.com" });
    expect(getURL()).toBe("https://proposals.example.com/");
  });

  /**
   * docker-compose passes a blank .env value through as "", not as unset. It
   * must fall through to the next candidate, not become "https://".
   */
  it("falls back to localhost when every URL variable is empty", () => {
    stubUrls();
    expect(getURL()).toBe("http://localhost:3000/");
  });

  it("falls through an empty NEXT_PUBLIC_APP_URL to the Vercel URL", () => {
    stubUrls({ publicVercelUrl: "my-app.vercel.app" });
    expect(getURL()).toBe("https://my-app.vercel.app/");
  });

  /**
   * VERCEL_URL is per-deployment and changes on every push; the project's
   * production domain is stable and is set even inside preview deployments.
   * Sending confirmation emails to a URL that dies next deploy is the bug this
   * ordering prevents.
   */
  it("prefers the stable production domain over the per-deployment URL", () => {
    stubUrls({
      prodUrl: "proposals.example.com",
      vercelUrl: "my-app-a1b2c3.vercel.app",
    });
    expect(getURL()).toBe("https://proposals.example.com/");
  });

  /**
   * Vercel exposes the unprefixed names to the server unconditionally; the
   * NEXT_PUBLIC_ copies only exist once the project opts into exposing system
   * environment variables. Reading both is what keeps a stock Vercel deploy
   * from falling through to localhost and mailing users a link to their own
   * machine.
   */
  it("reads the unprefixed Vercel variables", () => {
    stubUrls({ vercelUrl: "my-app-a1b2c3.vercel.app" });
    expect(getURL()).toBe("https://my-app-a1b2c3.vercel.app/");
  });
});

describe("getRequestOrigin", () => {
  /**
   * The regression this exists for. Next.js builds `request.url` from the
   * server's bind address, so the standalone server in Docker (HOSTNAME=0.0.0.0)
   * produced `http://0.0.0.0:3000` — a wildcard listen address the browser
   * refuses to connect to. The Host header the browser actually sent was
   * correct the whole time.
   */
  it("uses the Host header, not the 0.0.0.0 address the server bound to", () => {
    stubUrls();
    expect(getRequestOrigin(requestWith({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("honours a dev server on a non-default port", () => {
    stubUrls();
    expect(getRequestOrigin(requestWith({ host: "localhost:3001" }))).toBe(
      "http://localhost:3001",
    );
  });

  /** Vercel, a reverse proxy, any TLS terminator in front of the app. */
  it("prefers x-forwarded-host and its protocol", () => {
    stubUrls();
    const request = requestWith({
      host: "internal-abc123.vercel.internal",
      "x-forwarded-host": "proposals.example.com",
      "x-forwarded-proto": "https",
    });
    expect(getRequestOrigin(request)).toBe("https://proposals.example.com");
  });

  /** A preview deploy gets its own hostname that no env var was set for. */
  it("follows a Vercel preview deployment's own host", () => {
    stubUrls({ prodUrl: "proposals.example.com" });
    const request = requestWith({
      "x-forwarded-host": "my-app-git-fix-abc.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(getRequestOrigin(request)).toBe(
      "https://my-app-git-fix-abc.vercel.app",
    );
  });

  /**
   * Configuration outranks the request. A deployment that pins its own address
   * never consults a header a client could forge.
   */
  it("lets NEXT_PUBLIC_APP_URL override the request headers", () => {
    stubUrls({ app: "https://proposals.example.com" });
    const request = requestWith({
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
    });
    expect(getRequestOrigin(request)).toBe("https://proposals.example.com");
  });

  it("returns an origin with no trailing slash", () => {
    stubUrls({ app: "https://proposals.example.com/" });
    expect(getRequestOrigin(requestWith({ host: "localhost:3000" }))).toBe(
      "https://proposals.example.com",
    );
  });

  /** Nothing configured and no Host header: fall back to the static origin. */
  it("falls back to the configured site origin when no host is present", () => {
    stubUrls({ prodUrl: "proposals.example.com" });
    expect(getRequestOrigin(requestWith({}))).toBe(
      "https://proposals.example.com",
    );
  });

  /** An https deployment that never set a proto header still must not emit http://. */
  it("assumes https for a non-loopback host with no proto header", () => {
    stubUrls();
    expect(
      getRequestOrigin(requestWith({ host: "proposals.example.com" })),
    ).toBe("https://proposals.example.com");
  });

  it("assumes http for a loopback host with no proto header", () => {
    stubUrls();
    expect(getRequestOrigin(requestWith({ host: "127.0.0.1:3000" }))).toBe(
      "http://127.0.0.1:3000",
    );
  });
});

import { describe, expect, it } from "vitest";
import { findEnvProblems, type ServerEnv } from "./env";

const VALID: ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890",
  SUPABASE_SECRET_KEY: "sb_secret_1234567890",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  UPWORK_REDIRECT_URI: "http://localhost:3000/auth/upwork/callback",
};

describe("findEnvProblems", () => {
  it("reports nothing for a complete configuration", () => {
    expect(findEnvProblems(VALID)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ] as const)("names %s when it is unset, empty, or whitespace", (name) => {
    for (const value of [undefined, "", "   "]) {
      const { errors } = findEnvProblems({ ...VALID, [name]: value });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`${name} is not set`);
    }
  });

  /** The .env.example value is non-empty, so a bare "is it set" check would wave it through. */
  it("rejects the placeholder Supabase URL from .env.example", () => {
    const { errors } = findEnvProblems({
      ...VALID,
      NEXT_PUBLIC_SUPABASE_URL: "https://your-project-ref.supabase.co",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(errors[0]).toContain("example value");
  });

  it("rejects a Supabase URL that is not http(s)", () => {
    const { errors } = findEnvProblems({
      ...VALID,
      NEXT_PUBLIC_SUPABASE_URL: "abcdefghijklmnopqrst.supabase.co",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  /** NEXT_PUBLIC_* are compiled in, so a restart alone never picks up the fix. */
  it("tells the user to rebuild for NEXT_PUBLIC_* values but not for server secrets", () => {
    const publicError = findEnvProblems({
      ...VALID,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    }).errors[0];
    const secretError = findEnvProblems({ ...VALID, SUPABASE_SECRET_KEY: "" })
      .errors[0];

    expect(publicError).toContain("rebuild");
    expect(secretError).not.toContain("rebuild");
  });

  it("allows NEXT_PUBLIC_APP_URL to be unset or empty", () => {
    for (const value of [undefined, ""]) {
      expect(
        findEnvProblems({ ...VALID, NEXT_PUBLIC_APP_URL: value }).errors,
      ).toEqual([]);
    }
  });

  it("rejects a NEXT_PUBLIC_APP_URL without http:// or https://", () => {
    const { errors } = findEnvProblems({
      ...VALID,
      NEXT_PUBLIC_APP_URL: "proposals.example.com",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("only warns when UPWORK_REDIRECT_URI is unset", () => {
    const { errors, warnings } = findEnvProblems({
      ...VALID,
      UPWORK_REDIRECT_URI: "",
    });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("UPWORK_REDIRECT_URI");
  });

  it("reports every problem at once, not just the first", () => {
    const { errors } = findEnvProblems({
      ...VALID,
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SECRET_KEY: undefined,
    });
    expect(errors).toHaveLength(2);
  });
});

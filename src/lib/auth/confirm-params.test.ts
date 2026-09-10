import { describe, expect, it } from "vitest";
import { resolveConfirmParams } from "./confirm-params";

const params = (query: string) => new URLSearchParams(query);

describe("resolveConfirmParams", () => {
  it("reads the PKCE auth code Supabase appends to redirect_to", () => {
    expect(resolveConfirmParams(params("code=abc123"))).toEqual({
      kind: "code",
      code: "abc123",
      flowId: null,
    });
  });

  it("carries the flow id through so the right verifier slot is read", () => {
    expect(
      resolveConfirmParams(params("code=abc123&sb_flow_id=a1b2c3d4e5f6a7b8")),
    ).toEqual({
      kind: "code",
      code: "abc123",
      flowId: "a1b2c3d4e5f6a7b8",
    });
  });

  it("drops a malformed flow id rather than failing the exchange on it", () => {
    expect(resolveConfirmParams(params("code=abc123&sb_flow_id=%21%21"))).toEqual(
      { kind: "code", code: "abc123", flowId: null },
    );
  });

  it("recognises a link Supabase already rejected as expired", () => {
    expect(
      resolveConfirmParams(
        params(
          "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
        ),
      ),
    ).toEqual({
      kind: "provider_error",
      code: "otp_expired",
      description: "Email link is invalid or has expired",
    });
  });

  it("recognises a bare provider error with no code", () => {
    expect(resolveConfirmParams(params("error=access_denied"))).toEqual({
      kind: "provider_error",
      code: null,
      description: null,
    });
  });

  it("never exchanges a code that arrives alongside a provider error", () => {
    expect(
      resolveConfirmParams(params("error=access_denied&code=abc123")),
    ).toEqual({ kind: "provider_error", code: null, description: null });
  });

  it("reads a token hash link from a customised email template", () => {
    expect(
      resolveConfirmParams(params("token_hash=xyz789&type=signup")),
    ).toEqual({ kind: "token_hash", tokenHash: "xyz789", type: "signup" });
  });

  it("accepts type=email alongside type=signup", () => {
    expect(resolveConfirmParams(params("token_hash=xyz789&type=email"))).toEqual(
      { kind: "token_hash", tokenHash: "xyz789", type: "email" },
    );
  });

  it("rejects a token hash carrying an unsupported type", () => {
    expect(
      resolveConfirmParams(params("token_hash=xyz789&type=recovery")),
    ).toEqual({ kind: "unsupported_type" });
  });

  it("prefers the code when a link somehow carries both", () => {
    expect(
      resolveConfirmParams(params("code=abc123&token_hash=xyz789&type=signup")),
    ).toEqual({ kind: "code", code: "abc123", flowId: null });
  });

  it("reports a token hash with no type as incomplete", () => {
    expect(resolveConfirmParams(params("token_hash=xyz789"))).toEqual({
      kind: "missing",
    });
  });

  it("reports an empty query as incomplete", () => {
    expect(resolveConfirmParams(params(""))).toEqual({ kind: "missing" });
  });

  it("treats a blank code as incomplete rather than exchanging it", () => {
    expect(resolveConfirmParams(params("code="))).toEqual({ kind: "missing" });
  });
});

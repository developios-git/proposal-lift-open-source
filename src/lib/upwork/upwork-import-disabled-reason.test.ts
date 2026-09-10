import { describe, expect, it } from "vitest";
import {
  upworkImportDisabledReason,
  type UpworkConnectionState,
} from "./upwork-import-disabled-reason";

const base: UpworkConnectionState = {
  connected: false,
  oauthReady: false,
};

describe("upworkImportDisabledReason", () => {
  it("allows the action once the account is connected", () => {
    expect(
      upworkImportDisabledReason(
        { ...base, connected: true, oauthReady: true },
        "import personas",
      ),
    ).toBeNull();
  });

  it("allows it even before credentials are re-read as ready", () => {
    expect(
      upworkImportDisabledReason(
        { connected: true, oauthReady: false },
        "import personas",
      ),
    ).toBeNull();
  });

  it("reports a pending check while the request is in flight", () => {
    expect(
      upworkImportDisabledReason(
        { connected: null, oauthReady: false },
        "import personas",
      ),
    ).toBe("Checking your Upwork connection...");
  });

  it("sends a user with no credentials to Settings, not to a dead-end connect", () => {
    expect(
      upworkImportDisabledReason(
        { connected: false, oauthReady: false },
        "import personas",
      ),
    ).toBe("Add your Upwork API credentials in Settings to import personas.");
  });

  it("asks a user who has credentials to connect", () => {
    expect(
      upworkImportDisabledReason(
        { connected: false, oauthReady: true },
        "import personas",
      ),
    ).toBe("Connect your Upwork account to import personas.");
  });

  it("interpolates the caller's verb phrase", () => {
    expect(
      upworkImportDisabledReason(
        { connected: false, oauthReady: true },
        "add a filter",
      ),
    ).toBe("Connect your Upwork account to add a filter.");
  });
});

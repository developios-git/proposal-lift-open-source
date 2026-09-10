import { describe, expect, it } from "vitest";
import {
  isBlockedIpv4,
  isBlockedIpv6,
  isBlockedIpAddress,
} from "./safe-public-url-fetch";

describe("SSRF IP blocking", () => {
  it("blocks loopback and RFC1918 / metadata IPv4", () => {
    expect(isBlockedIpv4("127.0.0.1")).toBe(true);
    expect(isBlockedIpv4("10.0.0.1")).toBe(true);
    expect(isBlockedIpv4("172.16.0.1")).toBe(true);
    expect(isBlockedIpv4("192.168.1.1")).toBe(true);
    expect(isBlockedIpv4("169.254.169.254")).toBe(true);
    expect(isBlockedIpv4("100.64.0.1")).toBe(true);
  });

  it("allows common public IPv4", () => {
    expect(isBlockedIpv4("8.8.8.8")).toBe(false);
    expect(isBlockedIpv4("1.1.1.1")).toBe(false);
  });

  it("blocks IPv6 loopback and link-local / ULA", () => {
    expect(isBlockedIpv6("::1")).toBe(true);
    expect(isBlockedIpv6("fe80::1")).toBe(true);
    expect(isBlockedIpv6("feb0::1")).toBe(true);
    expect(isBlockedIpv6("fd00::1")).toBe(true);
    expect(isBlockedIpv6("ff02::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 loopback", () => {
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

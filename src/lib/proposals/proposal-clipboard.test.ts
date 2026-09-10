import { describe, expect, it } from "vitest";
import { proposalToHtml } from "./proposal-clipboard";

describe("proposalToHtml", () => {
  it("wraps blank-line-separated blocks in paragraphs", () => {
    expect(proposalToHtml("First para.\n\nSecond para.")).toBe(
      "<p>First para.</p><p>Second para.</p>",
    );
  });

  it("keeps single newlines as breaks so lists do not collapse", () => {
    expect(proposalToHtml("Plan:\n1. Audit\n2. Migrate")).toBe(
      "<p>Plan:<br>1. Audit<br>2. Migrate</p>",
    );
  });

  it("collapses runs of blank lines into one paragraph break", () => {
    expect(proposalToHtml("A\n\n\n\nB")).toBe("<p>A</p><p>B</p>");
  });

  it("escapes HTML so proposal text cannot inject markup", () => {
    expect(proposalToHtml("Rates < $50 & tags <b>bold</b>")).toBe(
      "<p>Rates &lt; $50 &amp; tags &lt;b&gt;bold&lt;/b&gt;</p>",
    );
  });

  it("normalises CRLF input", () => {
    expect(proposalToHtml("A\r\n\r\nB")).toBe("<p>A</p><p>B</p>");
  });

  it("returns an empty string for blank input", () => {
    expect(proposalToHtml("")).toBe("");
    expect(proposalToHtml("   \n\n  ")).toBe("");
  });
});

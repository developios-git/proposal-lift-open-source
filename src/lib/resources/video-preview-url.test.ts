import { describe, expect, it } from "vitest";
import { videoPreviewUrl } from "./video-preview-url";

const EMBED =
  "https://www.tella.tv/video/vid_abc/embed?b=1&title=1&a=1&loop=0&autoPlay=true&t=0&muted=1&wt=0&o=1";

const paramsOf = (url: string) => new URL(url).searchParams;

describe("videoPreviewUrl", () => {
  it("loops, since a thumbnail that stops after one play is a still frame", () => {
    // The configured embed carries loop=0 for the dialog.
    expect(paramsOf(EMBED).get("loop")).toBe("0");
    expect(paramsOf(videoPreviewUrl(EMBED)).get("loop")).toBe("1");
  });

  it("forces muted autoplay, which is the only kind browsers allow", () => {
    const p = paramsOf(videoPreviewUrl(EMBED));
    expect(p.get("muted")).toBe("1");
    expect(p.get("autoPlay")).toBe("true");
  });

  it("replaces existing flags rather than duplicating them", () => {
    const url = videoPreviewUrl(EMBED);
    expect(url.match(/[?&]loop=/g)).toHaveLength(1);
    expect(url.match(/[?&]muted=/g)).toHaveLength(1);
  });

  it("overrides flags even when the embed sets the opposite", () => {
    const loud = "https://host/embed?muted=0&loop=0&autoPlay=false";
    const p = paramsOf(videoPreviewUrl(loud));
    expect(p.get("muted")).toBe("1");
    expect(p.get("loop")).toBe("1");
    expect(p.get("autoPlay")).toBe("true");
  });

  it("keeps unrelated parameters untouched", () => {
    const p = paramsOf(videoPreviewUrl(EMBED));
    expect(p.get("b")).toBe("1");
    expect(p.get("title")).toBe("1");
    expect(p.get("o")).toBe("1");
  });

  it("adds the flags when the embed has no query string at all", () => {
    const p = paramsOf(videoPreviewUrl("https://host/embed"));
    expect(p.get("muted")).toBe("1");
    expect(p.get("loop")).toBe("1");
  });

  it("returns an unparseable value unchanged", () => {
    expect(videoPreviewUrl("not a url")).toBe("not a url");
  });
});

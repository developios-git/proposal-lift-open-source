/**
 * The embed URL a card uses for its silent background preview.
 *
 * The configured `embedUrl` is tuned for the dialog: it plays once and stops.
 * A thumbnail wants the opposite — loop forever, never make a sound — so the
 * playback flags are overridden rather than a second URL being kept in config,
 * which is what upstream did and what let the two drift apart.
 *
 * Overriding rather than appending matters: `embedUrl` already carries
 * `loop=0` and `muted=1`, and a duplicated key is resolved by the host, not by
 * us. Setting them through `URLSearchParams` replaces the existing values.
 */
export function videoPreviewUrl(embedUrl: string): string {
  let url: URL;
  try {
    url = new URL(embedUrl);
  } catch {
    // Not parseable, so there is nothing to override. Hand it back untouched
    // and let the iframe fail visibly rather than silently rewriting config.
    return embedUrl;
  }

  url.searchParams.set("autoPlay", "true");
  // Autoplay is only permitted while muted, so this is what makes the preview
  // start at all — not merely a courtesy.
  url.searchParams.set("muted", "1");
  url.searchParams.set("loop", "1");
  // No chrome on a thumbnail: the card is the control.
  url.searchParams.set("wt", "0");

  return url.toString();
}

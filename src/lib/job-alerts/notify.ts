/** Same-origin path only — blocks protocol-relative and absolute URLs. */
function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  try {
    const u = new URL(path, window.location.origin);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Use Next.js `router.push` (or equivalent) for SPA navigation without a full reload. */
export function showJobAlertDesktopNotification(
  count: number,
  sampleTitle: string | undefined,
  targetPath: string,
  tagKey: string,
  navigate: (path: string) => void,
): void {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!isSafeInternalPath(targetPath)) return;

  const body =
    count === 1
      ? sampleTitle?.trim() || "New job matching your filter"
      : `${count} new jobs matching your filter`;

  const tag = `job-alert:${tagKey}`;

  try {
    const n = new Notification("Job filter", {
      body,
      tag,
      renotify: true,
      data: { url: targetPath },
    } as NotificationOptions & { renotify?: boolean });
    n.onclick = (ev) => {
      ev.preventDefault();
      window.focus();
      navigate(targetPath);
      n.close();
    };
  } catch {
    /* ignore */
  }
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createJobAlertsTracker, type JobAlertRow } from "./tracker";
import { playJobAlertSound } from "./playAlertSound";
import { showJobAlertDesktopNotification } from "./notify";
import { readJobAlertsEnabled, writeJobAlertsEnabled } from "./storage";

type Params = {
  /** `new` for draft filter, otherwise saved filter id */
  filterStorageKey: string;
  /** Same-origin path to open when the user clicks the desktop notification. */
  notificationTargetPath: string;
  /** When true, force alerts off and disable UI (e.g. Upwork not connected). */
  needsUpworkConnection: boolean;
};

export function useJobAlerts({
  filterStorageKey,
  notificationTargetPath,
  needsUpworkConnection,
}: Params) {
  const router = useRouter();
  const [jobAlertsEnabled, setJobAlertsEnabled] = useState(false);
  const trackerRef = useRef(createJobAlertsTracker());
  const jobAlertsEnabledRef = useRef(false);

  const navigateToNotificationTarget = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  useEffect(() => {
    jobAlertsEnabledRef.current = jobAlertsEnabled;
  }, [jobAlertsEnabled]);

  useEffect(() => {
    trackerRef.current.reset();
  }, [filterStorageKey]);

  /**
   * Re-read the persisted toggle when the filter changes, and force it off when
   * Upwork is not connected.
   *
   * Both are pure derivations of a prop, done during render rather than in an
   * effect: a synchronous setState inside an effect is the cascading render
   * `react-hooks/set-state-in-effect` flags, and doing it here also removes the
   * frame where the previous filter's toggle state was still on screen.
   */
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncedKey !== filterStorageKey) {
    setSyncedKey(filterStorageKey);
    setJobAlertsEnabled(readJobAlertsEnabled(filterStorageKey));
  }

  if (needsUpworkConnection && jobAlertsEnabled) {
    // Persist the forced-off state too, so a reconnect does not silently
    // resurrect alerts the user never re-enabled.
    writeJobAlertsEnabled(filterStorageKey, false);
    setJobAlertsEnabled(false);
  }

  const handleJobAlertsChange = useCallback(
    async (next: boolean) => {
      if (needsUpworkConnection) return;

      if (!next) {
        setJobAlertsEnabled(false);
        writeJobAlertsEnabled(filterStorageKey, false);
        return;
      }

      if (
        typeof window === "undefined" ||
        typeof Notification === "undefined"
      ) {
        toast.error("Notifications are not supported in this browser.");
        return;
      }

      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }

      if (perm === "denied") {
        toast.warning(
          "Notifications are blocked. Enable them in your browser settings for desktop alerts. Sound will still play for new jobs.",
        );
        setJobAlertsEnabled(true);
        writeJobAlertsEnabled(filterStorageKey, true);
        try {
          await playJobAlertSound();
        } catch {
          toast.message("Tap the page once if you don’t hear a test sound.");
        }
        return;
      }

      setJobAlertsEnabled(true);
      writeJobAlertsEnabled(filterStorageKey, true);
      try {
        await playJobAlertSound();
      } catch {
        /* optional test beep */
      }
    },
    [needsUpworkConnection, filterStorageKey],
  );

  /**
   * Diff a fetch result against the seen-set and return what is new.
   *
   * The tracker runs unconditionally: its result also drives the feed's
   * new-job row highlight, which is not gated on the alerts switch. Only the
   * sound, desktop notification, and toast are.
   */
  const processNewJobsAfterFetch = useCallback(
    (jobs: { id: string; title: string }[]): JobAlertRow[] => {
      const { newJobs } = trackerRef.current.ingest(
        jobs.map((j) => ({ id: j.id, title: j.title })),
      );
      if (newJobs.length === 0) return newJobs;
      if (!jobAlertsEnabledRef.current) return newJobs;

      const count = newJobs.length;
      const sampleTitle = newJobs[0]?.title;

      void playJobAlertSound().catch(() => {
        toast.message(
          "New jobs found — interact with the page if you didn’t hear the alert sound.",
        );
      });

      const hidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";

      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        hidden
      ) {
        showJobAlertDesktopNotification(
          count,
          sampleTitle,
          notificationTargetPath,
          filterStorageKey,
          navigateToNotificationTarget,
        );
      } else {
        toast.success(
          count === 1
            ? `New job: ${sampleTitle ?? "matching your filter"}`
            : `${count} new jobs matching your filter`,
        );
      }

      return newJobs;
    },
    [notificationTargetPath, filterStorageKey, navigateToNotificationTarget],
  );

  /**
   * Record jobs as seen without treating them as arrivals. "Load more" appends
   * older results, whose ids are unseen but are not new jobs.
   */
  const markJobsSeen = useCallback((jobs: { id: string; title: string }[]) => {
    trackerRef.current.markSeen(jobs.map((j) => ({ id: j.id, title: j.title })));
  }, []);

  /**
   * Re-baseline after the query changes. A different result set is not a set of
   * arrivals, and without this the whole list would light up.
   */
  const resetJobTracker = useCallback(() => {
    trackerRef.current.reset();
  }, []);

  return {
    jobAlertsEnabled,
    jobAlertsEnabledRef,
    handleJobAlertsChange,
    processNewJobsAfterFetch,
    markJobsSeen,
    resetJobTracker,
  };
}

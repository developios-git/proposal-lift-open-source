/**
 * Onboarding flow ids and versions.
 * Bump a flow version when its behavior changes to re-run it for existing users.
 */
export const FLOW_IDS = {
  firstRunGettingStarted: "first_run_getting_started",
  upworkConnectVideo: "upwork_connect_video",
} as const;

export type OnboardingFlowId = (typeof FLOW_IDS)[keyof typeof FLOW_IDS];

/** One-time post-signup redirect to `/getting-started`. */
export const FIRST_RUN_GETTING_STARTED_FLOW_VERSION = 1;

/** One-time 5s auto-open of the "How to Connect Upwork API Key" video on Settings. */
export const UPWORK_CONNECT_VIDEO_FLOW_VERSION = 1;

export const CURRENT_FLOW_VERSION: Record<OnboardingFlowId, number> = {
  [FLOW_IDS.firstRunGettingStarted]: FIRST_RUN_GETTING_STARTED_FLOW_VERSION,
  [FLOW_IDS.upworkConnectVideo]: UPWORK_CONNECT_VIDEO_FLOW_VERSION,
};

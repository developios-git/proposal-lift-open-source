/** Shared limits for AI Job Qualify. Server is authoritative; the UI mirrors these. */

/** Max length of the user-authored qualify criteria, enforced on PATCH and in the textarea. */
export const QUALIFY_CRITERIA_MAX_LENGTH = 2000;

/**
 * Ceiling the enhance prompt is told to stay under. Deliberately below
 * QUALIFY_CRITERIA_MAX_LENGTH so an enhanced result always fits the column
 * the user then saves it to.
 */
export const QUALIFY_CRITERIA_ENHANCE_MAX_LENGTH = 1800;

/** Job descriptions are truncated to this before being sent to the model, to bound token spend. */
export const QUALIFY_JOB_DESCRIPTION_MAX_LENGTH = 6000;

/** Max length of the model's one-line justification shown in the badge popover. */
export const QUALIFY_REASON_MAX_LENGTH = 200;

/**
 * Bump whenever the qualify prompt changes.
 *
 * Folded into the sessionStorage cache key so verdicts produced by an older
 * prompt are discarded instead of lingering on screen — otherwise a prompt fix
 * leaves the exact wrong verdicts it was meant to correct still displayed.
 *
 * Bumped to 3 on the port. The prompt itself is unchanged, but a browser that
 * used the commercial build on the same origin could still be holding verdicts
 * keyed on version 2, and this build resolves the model and API key
 * differently. Discarding them costs one re-qualify; keeping them risks showing
 * verdicts this instance never produced.
 */
export const QUALIFY_PROMPT_VERSION = 3;

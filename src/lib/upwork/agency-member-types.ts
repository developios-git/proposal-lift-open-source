/**
 * Normalized shapes for the Upwork agency member import.
 *
 * These sit between the raw GraphQL responses (src/lib/upwork/client.ts) and the
 * pure persona mapper (src/lib/personas/map-upwork-member-to-persona.ts) so the
 * mapper can be unit-tested without touching the network layer.
 */

/** One row from `organization.staffs`, flattened from Upwork's `Staff` + `StaffUser`. */
export type UpworkAgencyStaffMember = {
  /** `Staff.user.id`, which is the same identifier as `TalentProfile.personId`. */
  personId: string;
  /**
   * Always null in practice: `StaffUser.firstName` / `.lastName` / `.email` are
   * scope-blocked, so the roster query does not request them. Kept in the type
   * because the mapper's fallback chain reads them and a future scope grant
   * would populate them without a signature change.
   */
  firstName: string | null;
  lastName: string | null;
  /** Upwork's abbreviated display name, e.g. "Alex R." May contain doubled spaces. */
  name: string | null;
  photoUrl: string | null;
  publicUrl: string | null;
  email: string | null;
  /** Upwork `Staff.activationStatus`: 1 active, 2 inactive. */
  activationStatus: number | null;
};

/** Subset of Upwork `TalentProfile` used to enrich one member. */
export type UpworkTalentProfile = {
  personId: string;
  /**
   * `firstName` is a real given name, but `lastName` is an INITIAL, e.g.
   * "Alex" + "R.". Upwork abbreviates it, so a full surname is not available
   * from this API at all. Do not expect enrichment to improve on
   * `StaffUser.name`; its value is title, bio, and skills.
   */
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  description: string | null;
  portraitUrl: string | null;
  profileUrl: string | null;
  country: string | null;
  city: string | null;
  /**
   * Opaque DISPLAY string, not IANA, despite what the schema doc claims.
   * Observed: "UTC+05:00 Islamabad, Karachi", "UTC-08:00 Pacific Time (US &
   * Canada); Tijuana". Also unreliable, it can disagree with `country`. Never
   * feed this to a date library.
   */
  timezone: string | null;
  skills: string[];
  specializations: string[];
  /** `employmentRecords[].startDateTime`, date-only strings like "2021-08-01". */
  employmentStartDates: string[];
};

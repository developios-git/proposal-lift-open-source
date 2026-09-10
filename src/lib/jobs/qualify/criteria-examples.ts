/**
 * Starting points offered by the Examples dialog in the Qualify sidebar.
 *
 * These are static strings — picking one costs nothing and calls no model. They
 * are written in the same QUALIFY IF / DISQUALIFY IF shape that
 * ENHANCE_CRITERIA_SYSTEM_PROMPT produces, so an example also demonstrates the
 * format the qualifier reads most reliably.
 *
 * Deliberately concrete rather than templated ("Next.js and React" over
 * "[your stack]"): a placeholder that survives to save time reaches the
 * qualifier literally and produces meaningless verdicts, whereas a concrete
 * example that survives at least produces coherent ones. The opening line names
 * a specific niche precisely so it reads as someone else's and invites a rewrite.
 */
export interface QualifyCriteriaExample {
  id: string;
  /** Shown as the card heading. */
  title: string;
  /** One line under the heading — what this example does and does not judge. */
  description: string;
  text: string;
}

const COMPREHENSIVE = `I build Next.js, React, and TypeScript web apps for B2B SaaS companies.

QUALIFY IF:
- The job asks for React, Next.js, TypeScript, or a modern JavaScript front end
- The work is web app, dashboard, or SaaS product development
- Fixed budget is $1,500 or more, or the hourly rate is $40 or more
- The client has payment verified
- The client has spent at least $2,000, or is new with a clearly written brief

DISQUALIFY IF:
- The main platform is WordPress, Wix, Squarespace, or Shopify
- The job is data entry, virtual assistance, or content writing
- The description asks for unpaid test work or a free sample
- The description is a few vague lines with no detail on the actual work`;

const SKILLS_AND_RELEVANCE = `I build Next.js, React, and TypeScript web apps.

QUALIFY IF:
- The job names React, Next.js, TypeScript, or Tailwind CSS
- The work is building or improving a web app, dashboard, or internal tool
- Front-end work paired with an API or database is fine

DISQUALIFY IF:
- The core platform is WordPress, Wix, Squarespace, or Shopify
- The role is mainly mobile (iOS, Android, React Native, Flutter)
- The job is design-only with no development work
- The job is data entry, admin, or content writing

Judge relevance to my skills only — ignore budget and client history.`;

const BUDGET_AND_CLIENT = `Judge these jobs on pay and client quality only. Ignore the type of work.

QUALIFY IF:
- Fixed budget is $1,000 or more, or the hourly rate is $35 or more
- The client has payment verified
- The client has spent at least $1,000 in total
- The client is rated 4.5 or higher, or is new with no reviews yet

DISQUALIFY IF:
- The client is rated below 4.0 across 5 or more reviews
- Payment is not verified and total spend is under $500
- The budget is under $250 fixed, or under $20 per hour
- The description pushes for the lowest possible price`;

export const QUALIFY_CRITERIA_EXAMPLES: readonly QualifyCriteriaExample[] = [
  {
    id: "comprehensive",
    title: "Comprehensive filter",
    description: "Skills, budget, and client quality in one rubric",
    text: COMPREHENSIVE,
  },
  {
    id: "skills",
    title: "Skills & relevance",
    description: "Judges the work only — ignores budget and client history",
    text: SKILLS_AND_RELEVANCE,
  },
  {
    id: "budget",
    title: "Budget & client quality",
    description: "Pay and client history only — ignores the type of work",
    text: BUDGET_AND_CLIENT,
  },
];

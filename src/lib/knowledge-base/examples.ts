/**
 * Starting points offered by the Examples dialog on the Knowledge Base tab.
 *
 * These are static strings, so picking one costs nothing and calls no model.
 *
 * Deliberately concrete rather than templated ("Next.js and React" over
 * "[your stack]"): a placeholder that survives to save time reaches the model
 * literally and produces meaningless proposals, whereas a concrete example that
 * survives at least produces coherent ones. Every company name is plainly
 * fictional, which is the strongest "this is not me" signal in a document
 * written in the first person, and invites a rewrite.
 *
 * All six share one section skeleton so a user learns the shape the AI reads
 * most reliably. Solo examples say "I" and team examples say "we": roughly half
 * of tenants are solo, and a solo user who only ever sees an eight person agency
 * concludes the feature is not for them.
 */
export interface KnowledgeBaseExample {
  id: string;
  /** Shown as the card heading. */
  title: string;
  /** One line under the heading: whose business this is. */
  description: string;
  text: string;
}

const DEV_AGENCY = `## Who we are
Northgate Studio is a five person web development team. We have worked together since 2019 and delivered 140 projects on Upwork with a 98% Job Success Score. We work mostly with B2B SaaS companies and internal tools teams in the US and UK.

## What we do best
- Next.js and React front ends, TypeScript everywhere
- Node.js and PostgreSQL back ends on Vercel and AWS
- Rescuing stalled builds, taking over an unfinished codebase and shipping it
- Stripe billing, subscriptions, usage metering, customer portals
- Design systems in Tailwind CSS, built from Figma files

## Results
- Rebuilt a logistics dashboard for a 40 person freight company. Page load went from 4.8s to 1.1s and support tickets about slowness stopped.
- Took over an abandoned Next.js marketplace at 60% complete and shipped it in 9 weeks. The client raised a seed round two months later.
- Built Stripe usage based billing for an API startup. It meters 2.1 million events a month with no manual invoicing.
- Migrated a PHP intranet to Next.js for a healthcare provider. Hosting cost dropped 42%.

## How we work
We start with a paid one week discovery: we read the existing code, write a build plan, and give a fixed quote. After that we ship every Friday to a staging URL the client can click. Every pull request is reviewed by a second developer and covered by end to end tests. We work 9am to 6pm UK time and overlap with US Eastern until 1pm ET.

## Proof
"They found three bugs in our old code before writing a line of their own." Verified Upwork review, 5.0, March 2025.
Two of us are AWS Certified Solutions Architects. We have never missed a contracted delivery date on Upwork.`;

const SOLO_FREELANCER = `## Who I am
I am a solo WordPress and Shopify developer based in Porto. I have freelanced full time since 2018 and finished 96 contracts on Upwork with a 100% Job Success Score. Most of my clients are small retail brands and agencies who need a reliable pair of hands rather than a whole team.

## What I do best
- Shopify theme development and Liquid customisation
- WordPress with WooCommerce, ACF, and custom Gutenberg blocks
- Speed work: Core Web Vitals, image pipelines, caching, script cleanup
- Migrations from Wix, Squarespace, and legacy WordPress installs
- Maintenance retainers with monthly uptime and update reports

## Results
- Cut a Shopify store's Largest Contentful Paint from 5.2s to 1.6s. Mobile conversion rate rose from 0.9% to 1.4% over the following quarter.
- Migrated a 1,200 product WooCommerce catalogue to Shopify with no loss of search rankings and no downtime on launch day.
- Rebuilt a furniture brand's product pages with a custom configurator. Average order value went up 18%.
- Maintain nine sites on monthly retainers, with no security incident in four years.

## How I work
I quote fixed price for defined scope, and hourly only for open ended maintenance. You get a staging link within the first three days so you can see progress early. I send a short written update every Monday and I do not disappear mid project. I work European hours and answer messages within one business day.

## Proof
"Third developer we hired for this site and the first who actually finished." Verified Upwork review, 5.0, January 2025.
Shopify Partner since 2020. I have never had a contract end in a dispute.`;

const DESIGN_STUDIO = `## Who we are
Fold and Grain is a three person design studio working in brand identity and product design. We started in 2020 and have delivered 70 projects on Upwork. We work with early stage startups and independent food and drink brands.

## What we do best
- Brand identity: logo systems, type and colour, usage guidelines
- Packaging design for food, drink, and personal care
- Product and marketing site design in Figma, built to hand off cleanly
- Webflow build from our own designs, so nothing is lost in translation
- Design systems with reusable components and documented tokens

## Results
- Rebranded a specialty coffee roaster including packaging for eleven products. They landed their first national retail listing four months later.
- Designed and built a Webflow site for a Series A fintech. Demo requests went up 34% in the first two months.
- Created a 60 component design system for a scheduling app. Their in house team now ships new screens without design support.
- Redesigned checkout for a supplement brand. Cart abandonment fell from 71% to 58%.

## How we work
Every project opens with a paid discovery call and a written creative brief you approve before we design anything. You get two concept directions, then two rounds of refinement on the one you pick. Files are handed over in Figma with layers named and components documented, plus exported assets in every format you will need. We do not use stock logos or AI generated marks.

## Proof
"The brand guidelines alone were worth the fee. Our printer had zero questions." Verified Upwork review, 5.0, February 2025.
Our packaging work for a client won a Dieline award in 2024.`;

const MARKETING_AGENCY = `## Who we are
Bellrock Growth is a four person marketing team focused on SEO and paid acquisition for B2B software companies. We have worked on Upwork since 2021 across 55 contracts, and we manage about $180,000 a month in ad spend.

## What we do best
- Technical and content SEO for software sites
- Google Ads and LinkedIn Ads, from account build to ongoing optimisation
- Lifecycle email in HubSpot, Customer.io, and Klaviyo
- Attribution and reporting that ties spend to pipeline, not just clicks
- Landing page testing and conversion rate optimisation

## Results
- Grew a payroll software company from 3,400 to 21,000 organic sessions a month over 11 months, with 40% of new trials coming from organic.
- Cut cost per qualified lead for a cybersecurity client from $410 to $187 in one quarter by restructuring their Google Ads account.
- Rebuilt a HubSpot onboarding sequence for a project management tool. Trial to paid conversion moved from 8% to 13%.
- Took a devtools client from no attribution to a working model, and found that 60% of their spend went to a channel with zero pipeline.

## How we work
Month one is audit and setup, and we will say plainly if we think paid is wrong for you. After that you get a live dashboard, a written monthly review, and a call every two weeks. We do not lock clients into long contracts, and we do not report on impressions or reach unless you ask for them. Everything is measured against pipeline.

## Proof
"They talked us out of a channel we were about to double down on. Saved us a quarter." Verified Upwork review, 5.0, April 2025.
Google Ads and HubSpot certified. We hold a 4.9 average across 55 Upwork contracts.`;

const CONTENT_WRITER = `## Who I am
I am a freelance B2B writer specialising in software and fintech. I have written full time since 2017 and completed 130 Upwork contracts with a 99% Job Success Score. I write for companies whose product is genuinely technical and who are tired of surface level content.

## What I do best
- Long form blog posts and pillar pages, 1,500 to 4,000 words
- Case studies built from customer interviews I run myself
- Product documentation and developer facing guides
- Email sequences for onboarding, activation, and win back
- Editing and rewriting existing content that is not ranking

## Results
- Wrote a 14 article cluster on payments compliance for a fintech. Eight pieces reached page one and the cluster drives about 9,000 sessions a month.
- Produced 20 customer case studies for a data platform. Their sales team now closes with them and reports a shorter sales cycle.
- Rewrote onboarding emails for an analytics tool. Open rates went from 22% to 41% and activation improved by a third.
- My documentation rewrite for an API company cut their support ticket volume on setup questions by half.

## How I work
I ask for a call before the first draft so I understand the product rather than paraphrasing your competitors. Every piece comes with an outline you approve first, which is where most revisions get resolved cheaply. I include two rounds of revision, cite every claim, and never use AI to generate drafts. I file on the agreed date.

## Proof
"First writer we have used who understood our product without hand holding." Verified Upwork review, 5.0, March 2025.
I worked as a support engineer before writing full time, which is why the technical detail holds up.`;

const VIDEO_EDITOR = `## Who I am
I am a video editor working in short form and YouTube content. I have edited full time since 2019 and delivered on 210 Upwork contracts with a 99% Job Success Score. Most of my work is for creators and B2B brands who publish weekly and need someone who can keep pace.

## What I do best
- YouTube long form editing, 8 to 25 minutes, cut with retention in mind
- Short form for TikTok, Reels, and Shorts, either cut down or shot native
- Motion graphics and lower thirds in After Effects
- Colour grading and audio cleanup, including noise removal and levelling
- Podcast video editing with multicam switching

## Results
- Took a founder's channel from 40% to 62% average view duration over three months by restructuring the first 30 seconds of every video.
- Edited a 12 part course for a design school, delivered on schedule across six weeks with no revision rounds needed on the last eight.
- Cut a client's weekly long form into short form clips. One clip reached 2.4 million views and added about 18,000 subscribers.
- Handle a standing four videos a week for one client and have not missed a delivery in two years.

## How I work
I edit in Premiere Pro and After Effects, and can work in DaVinci Resolve if your team already does. Standard turnaround is 48 hours for short form and four days for long form, faster when scheduled ahead. Two revision rounds are included, and I keep project files organised so another editor could pick them up. I need raw footage plus any brand assets, and I send a rough cut before polishing.

## Proof
"Reliable in a way that is genuinely rare in this niche." Verified Upwork review, 5.0, February 2025.
Adobe Certified Professional in Premiere Pro.`;

export const KNOWLEDGE_BASE_EXAMPLES: readonly KnowledgeBaseExample[] = [
  {
    id: "dev-agency",
    title: "Web development agency",
    description: "A small team writing as we, with delivery metrics",
    text: DEV_AGENCY,
  },
  {
    id: "solo-freelancer",
    title: "Solo freelancer",
    description: "One person writing as I, smaller numbers, no team",
    text: SOLO_FREELANCER,
  },
  {
    id: "design-studio",
    title: "Design and branding studio",
    description: "Creative work with no code, judged on craft and process",
    text: DESIGN_STUDIO,
  },
  {
    id: "marketing-agency",
    title: "Marketing and SEO agency",
    description: "Results in pipeline and cost per lead, not page speed",
    text: MARKETING_AGENCY,
  },
  {
    id: "content-writer",
    title: "Writing and content",
    description: "A solo writer, with published results and a clear process",
    text: CONTENT_WRITER,
  },
  {
    id: "video-editor",
    title: "Video and motion",
    description: "A solo editor, with turnaround times and retention numbers",
    text: VIDEO_EDITOR,
  },
];

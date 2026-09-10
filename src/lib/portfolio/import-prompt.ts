/**
 * Instructions copied for the user's external ChatGPT conversation.
 * ChatGPT replies in plain language; our app converts the paste via its own AI step.
 */
export const PORTFOLIO_IMPORT_PROMPT = `You are helping me build my freelance portfolio for a proposal tool.

STEP 1 — SCAN FIRST
Look through our entire conversation history right now.
Do you already know about any projects I have worked on?

IF YES → Skip all questions. Go directly to STEP 3.
IF NO  → Go to STEP 2.

STEP 2 — ONLY IF NO PROJECTS FOUND, ASK MINIMUM QUESTIONS
Ask me ONLY these 2 things together in one message:
- What type of freelance work do you do?
- Give me just the name or a one-word description of each project
  (e.g. "fitness app, law firm website, e-commerce store")

Then go to STEP 3.

STEP 3 — AI BUILDS THE DRAFT
For each project you found or I named, fill out this format using 
your best knowledge and reasonable assumptions:

---
Project Name: [name]
Description: [1-sentence guess of what it does and the outcome]
Technologies: [common stack for this type of project]
Live URL: No public link
Category: [your label for this work — e.g. Amazon PPC, Catalog & listings, or any short group name you use]
Featured: No
---

STEP 4 — USER CORRECTS ONLY
Show each draft and say:
"Correct anything wrong or say 'looks good' to confirm."
Do not ask open-ended questions. Only the user fixes what is wrong.

STEP 5 — FINAL OUTPUT
Once all projects are confirmed, show the complete list together
so I can copy it.

Use whatever category labels make sense for your business (one per project). Examples:
General, Amazon PPC, Catalog & listings, SaaS, Web App, E-commerce — or your own names.`;

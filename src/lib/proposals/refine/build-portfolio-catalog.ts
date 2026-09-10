/**
 * Formats portfolio projects into the compact block the refine prompt carries.
 *
 * Detail scales with list length rather than the list being truncated. The
 * description is what makes an entry expensive; the model mostly needs the
 * name, category, and technologies to pick one. Dropping descriptions past the
 * full-detail tier buys roughly three times the entries for the same budget,
 * which matters because a large portfolio is exactly the case where the right
 * project is most likely to be far down the list.
 */

import { MAX_PORTFOLIO_CHARS } from "./build-refine-prompt";

/** Above this many candidates, descriptions are dropped to fit more projects. */
export const FULL_DETAIL_MAX_PROJECTS = 40;
/** Hard ceiling on entries, matching the route's query limit. */
export const COMPACT_MAX_PROJECTS = 120;
/** Per-project description budget in the full-detail tier. */
export const MAX_PROJECT_DESCRIPTION_CHARS = 160;

export type PortfolioCatalogProject = {
  name: string;
  category: string | null;
  url: string | null;
  description: string | null;
  technologies: string[] | null;
};

/** Collapses newlines too, so an entry can never span more lines than intended. */
function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProject(
  project: PortfolioCatalogProject,
  withDescription: boolean,
): string {
  const name = clean(project.name);
  if (!name) return "";

  // Pipes rather than dashes: the prompt already uses "=== SECTION ===" and
  // leading dashes for list items, and a dash separator reads ambiguously
  // against both.
  const fields = [name];

  const category = clean(project.category);
  if (category) fields.push(category);

  const technologies = (project.technologies ?? [])
    .map(clean)
    .filter(Boolean)
    .join(", ");
  if (technologies) fields.push(technologies);

  const url = clean(project.url);
  if (url) fields.push(url);

  let entry = `- ${fields.join(" | ")}`;

  if (withDescription) {
    const description = clean(project.description);
    if (description) {
      entry += `\n  ${description.slice(0, MAX_PROJECT_DESCRIPTION_CHARS)}`;
    }
  }

  return entry;
}

export function buildPortfolioCatalog(
  projects: PortfolioCatalogProject[],
): string {
  // Defensive: the route already limits the query, but the function must be
  // correct in isolation so its tests do not depend on the caller.
  const rows = projects.slice(0, COMPACT_MAX_PROJECTS);
  if (rows.length === 0) return "";

  const withDescription = rows.length <= FULL_DETAIL_MAX_PROJECTS;

  const entries: string[] = [];
  let used = 0;

  for (const project of rows) {
    const entry = formatProject(project, withDescription);
    if (!entry) continue;

    // +1 for the newline that will join this entry to the previous one.
    const cost = entry.length + (entries.length > 0 ? 1 : 0);
    if (used + cost > MAX_PORTFOLIO_CHARS) break;

    entries.push(entry);
    used += cost;
  }

  return entries.join("\n");
}

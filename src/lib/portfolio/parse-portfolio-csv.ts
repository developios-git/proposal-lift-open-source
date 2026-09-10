/**
 * Parses portfolio CSV (UTF-8) into objects compatible with importProjectRowSchema.
 * Expected header: name, url, description, technologies, category (category = any label you use; duplicates share one group after slugifying).
 * Optional columns: image, image_url, featured (booleans: true/false or yes/no).
 * Technologies: pipe or semicolon separated. Empty url is stored as no link.
 */

const EXPECTED_HEADERS = new Set([
  "name",
  "url",
  "description",
  "technologies",
  "category",
  "image",
  "image_url",
  "featured",
]);

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function rowHasContent(cells: string[]): boolean {
  return cells.some((c) => c.trim().length > 0);
}

/** Minimal RFC 4180-style CSV field parser (quoted fields, escaped quotes). */
export function parseCsvToRows(text: string): string[][] {
  const s = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;

  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitTechnologies(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseFeaturedCell(
  raw: string,
): { ok: true; value: boolean } | { ok: false; message: string } {
  const v = raw.trim().toLowerCase();
  if (v === "") return { ok: true, value: false };
  if (["true", "1", "yes", "y"].includes(v)) return { ok: true, value: true };
  if (["false", "0", "no", "n"].includes(v)) return { ok: true, value: false };
  return { ok: false, message: `Invalid featured value "${raw.trim()}"` };
}

export function parsePortfolioCsv(text: string):
  | { ok: true; projects: unknown[] }
  | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "CSV is empty" };
  }

  const rows = parseCsvToRows(trimmed);
  let start = 0;
  while (start < rows.length && !rowHasContent(rows[start])) {
    start += 1;
  }
  if (start >= rows.length) {
    return { ok: false, error: "CSV has no header row" };
  }

  const headerCells = rows[start].map(normalizeHeader);
  if (!headerCells.includes("name")) {
    return {
      ok: false,
      error:
        'CSV must include a "name" column in the header row (check spelling).',
    };
  }

  const unknown = headerCells.filter(
    (h) => h !== "" && !EXPECTED_HEADERS.has(h),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown column(s): ${unknown.join(", ")}. Allowed: name, url, description, technologies, category, and optionally image, image_url, featured.`,
    };
  }

  const colIndex: Record<string, number> = {};
  headerCells.forEach((h, idx) => {
    if (h && !colIndex[h]) colIndex[h] = idx;
  });

  const projects: unknown[] = [];
  let dataRowNumber = 0; // 1-based for messages (first data row after header)

  for (let r = start + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!rowHasContent(cells)) continue;

    dataRowNumber += 1;
    const get = (key: string): string => {
      const idx = colIndex[key];
      if (idx === undefined) return "";
      return (cells[idx] ?? "").trim();
    };

    const name = get("name");
    const urlRaw = get("url");
    const description = get("description");
    const technologiesRaw = get("technologies");
    const category = get("category");
    const image = get("image") || get("image_url");

    const featuredRaw = get("featured");

    if (!name) {
      return {
        ok: false,
        error: `Import row ${dataRowNumber}: name is required`,
      };
    }

    let featured: boolean | undefined;
    if (featuredRaw.trim() !== "") {
      const fp = parseFeaturedCell(featuredRaw);
      if (!fp.ok) {
        return {
          ok: false,
          error: `Import row ${dataRowNumber}: ${fp.message}`,
        };
      }
      featured = fp.value;
    }

    const obj: Record<string, unknown> = { name };
    if (urlRaw) obj.url = urlRaw;
    if (description) obj.description = description;
    const techs = splitTechnologies(technologiesRaw);
    if (techs.length > 0) obj.technologies = techs;
    if (category) obj.category = category;
    if (image) obj.image = image;
    if (featured !== undefined) obj.featured = featured;

    projects.push(obj);
  }

  if (projects.length === 0) {
    return { ok: false, error: "No data rows found under the header" };
  }

  return { ok: true, projects };
}

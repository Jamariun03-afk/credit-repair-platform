/**
 * Renders {{token}} variables in a letter template body.
 *
 * Deliberately strict: a missing variable throws rather than rendering
 * blank or a placeholder like "[MISSING]" into a legal document. Spec
 * requirement: "Never insert unverified facts" — an empty/undefined
 * value silently rendered as blank text is exactly the kind of
 * unverified gap this is meant to prevent.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  const tokens = [...template.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]);
  const missing = tokens.filter((t) => variables[t] === undefined || variables[t] === null || variables[t] === "");

  if (missing.length > 0) {
    throw new Error(`Cannot generate letter — missing required data: ${[...new Set(missing)].join(", ")}`);
  }

  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => variables[key]);
}

export const STANDARD_TOKENS = [
  "client_name",
  "client_address",
  "date",
  "bureau_name",
  "bureau_address",
  "account_name",
  "account_number",
  "dispute_reason",
  "supporting_facts",
  "requested_action",
] as const;

export const BUREAU_ADDRESSES: Record<string, { name: string; address: string }> = {
  EXPERIAN: { name: "Experian", address: "P.O. Box 4500, Allen, TX 75013" },
  EQUIFAX: { name: "Equifax Information Services LLC", address: "P.O. Box 740256, Atlanta, GA 30374" },
  TRANSUNION: { name: "TransUnion Consumer Solutions", address: "P.O. Box 2000, Chester, PA 19016" },
};

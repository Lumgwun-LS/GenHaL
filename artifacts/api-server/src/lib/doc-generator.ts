/**
 * AI-powered documentation generator.
 * Takes a raw OpenAPI YAML/JSON string, parses it, and calls Awajimaa AI
 * (OpenAI-compatible) to produce a structured DocPortal object that the
 * frontend renders as a developer documentation page.
 */
import { openai } from "@workspace/integrations-openai-ai-server";
import * as yaml from "js-yaml";

export interface DocEndpoint {
  method: string;      // GET | POST | PUT | PATCH | DELETE
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  requestBody?: string;   // markdown description
  responseExample?: string;
  codeExample?: string;   // curl or JS snippet
}

export interface DocSection {
  title: string;
  content: string;  // markdown
}

export interface DocPortal {
  title: string;
  version: string;
  overview: string;          // markdown intro
  authGuide: string;         // markdown auth section
  baseUrl?: string;
  endpoints: DocEndpoint[];
  sections: DocSection[];    // additional guides
  generatedAt: string;       // ISO timestamp
}

/**
 * Fetch a spec from a URL and return the raw text.
 */
export async function fetchSpecFromUrl(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { Accept: "application/json, text/yaml, text/plain, */*" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Failed to fetch spec from ${url}: HTTP ${resp.status}`);
  return resp.text();
}

/**
 * Fetch a spec file from GitHub or GitLab using a stored OAuth token.
 */
export async function fetchSpecFromGit(opts: {
  provider: "github" | "gitlab";
  repo: string;         // owner/repo
  branch: string;
  path: string;
  token: string;
}): Promise<string> {
  const { provider, repo, branch, path, token } = opts;

  if (provider === "github") {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) throw new Error(`GitHub fetch failed: HTTP ${resp.status}`);
    return resp.text();
  }

  // GitLab
  const encodedPath = encodeURIComponent(path);
  const encodedRepo = encodeURIComponent(repo);
  const url = `https://gitlab.com/api/v4/projects/${encodedRepo}/repository/files/${encodedPath}/raw?ref=${branch}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`GitLab fetch failed: HTTP ${resp.status}`);
  return resp.text();
}

/**
 * Parse a raw YAML or JSON string into a plain object.
 */
function parseSpec(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return yaml.load(raw) as Record<string, unknown>;
  }
}

/**
 * Extract a lightweight summary of the spec to keep the AI prompt manageable.
 */
function summariseSpec(spec: Record<string, unknown>): string {
  const info = (spec.info as Record<string, unknown>) ?? {};
  const paths = (spec.paths as Record<string, unknown>) ?? {};
  const components = (spec.components as Record<string, unknown>) ?? {};
  const securitySchemes = (components.securitySchemes as Record<string, unknown>) ?? {};

  const endpointLines: string[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    const methods = ["get", "post", "put", "patch", "delete"] as const;
    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
      if (!op) continue;
      const summary = (op.summary as string) ?? "";
      const tags = ((op.tags as string[]) ?? []).join(", ");
      endpointLines.push(`${method.toUpperCase()} ${path} — ${summary}${tags ? ` [${tags}]` : ""}`);
    }
  }

  return [
    `Title: ${info.title ?? "Unknown"}`,
    `Version: ${info.version ?? "1.0.0"}`,
    `Description: ${info.description ?? ""}`,
    `Base URL: ${(spec.servers as Array<{ url: string }>)?.[0]?.url ?? ""}`,
    `Security schemes: ${Object.keys(securitySchemes).join(", ") || "none"}`,
    "",
    "Endpoints:",
    ...endpointLines.slice(0, 60),
  ].join("\n");
}

/**
 * Generate a diff changelog between two spec texts.
 * Returns a short AI-written Markdown summary of what changed.
 */
export async function generateChangelog(
  previousSpec: string,
  newSpec: string,
  platformName: string
): Promise<string> {
  let prevSpec: Record<string, unknown>;
  let nextSpec: Record<string, unknown>;
  try {
    prevSpec = parseSpec(previousSpec);
    nextSpec = parseSpec(newSpec);
  } catch {
    return "_Spec parse error — changelog unavailable._";
  }

  const prevSummary = summariseSpec(prevSpec);
  const nextSummary = summariseSpec(nextSpec);

  const prompt = `You are a technical writer. Compare these two API spec summaries for ${platformName} and write a concise Markdown changelog (3–8 bullet points) describing what changed: new endpoints, removed endpoints, changed auth, version bump, etc.

## Previous spec
${prevSummary}

## New spec
${nextSummary}

Write only the changelog bullets, no intro text.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 400,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "_No changes detected._";
}

/**
 * Core function: given a raw OpenAPI spec string, return a structured DocPortal.
 */
export async function generateDocPortal(
  rawSpec: string,
  platformName: string,
  overrideBaseUrl?: string
): Promise<DocPortal> {
  let spec: Record<string, unknown>;
  try {
    spec = parseSpec(rawSpec);
  } catch (err) {
    throw new Error(`Could not parse OpenAPI spec: ${(err as Error).message}`);
  }

  const summary = summariseSpec(spec);
  const info = (spec.info as Record<string, unknown>) ?? {};
  const specBaseUrl = (spec.servers as Array<{ url: string }>)?.[0]?.url ?? "";

  const systemPrompt = `You are an expert technical writer who creates beautiful, developer-friendly API documentation. 
Given an OpenAPI spec summary, produce a JSON object matching the DocPortal schema.
Be concise but complete. Use Markdown for prose fields. Include realistic code examples in curl.`;

  const userPrompt = `Create a DocPortal JSON for the following API spec:

${summary}

Return a JSON object with exactly these keys:
- title: string (API name)
- version: string
- overview: string (Markdown, 2–3 paragraphs explaining what this API does and who it's for)
- authGuide: string (Markdown, how to authenticate with this API)
- baseUrl: string (the API base URL)
- endpoints: array of objects, each with:
    method, path, summary, description (optional), tags (string[]), codeExample (a curl snippet)
- sections: array of {title, content} for additional guides like "Rate Limiting", "Error Codes", "Getting Started"
- generatedAt: "${new Date().toISOString()}"

Return valid JSON only, no markdown fences.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let portal: DocPortal;
  try {
    portal = JSON.parse(raw) as DocPortal;
  } catch {
    throw new Error("AI returned invalid JSON for doc portal");
  }

  // Ensure required fields
  portal.title = portal.title || platformName;
  portal.version = portal.version || String(info.version ?? "1.0.0");
  portal.generatedAt = new Date().toISOString();
  portal.baseUrl = overrideBaseUrl || portal.baseUrl || specBaseUrl;
  portal.endpoints = portal.endpoints ?? [];
  portal.sections = portal.sections ?? [];

  return portal;
}

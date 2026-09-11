/**
 * Plan file parsing and I/O
 *
 * Plans are markdown files with YAML frontmatter:
 * ---
 * name: plan-name
 * description: What this plan covers
 * status: planned
 * tags: [optional, tags]
 * ---
 * # Body content here
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { PlanFrontmatter, PlanFile, PlanStatus } from './types.js';
import { VALID_STATUSES } from './types.js';
import { normalizePlanId, resolvePlanPath, assertNotSymlink } from './plan-path.js';

/**
 * Parse frontmatter and body from raw plan content.
 * Expects content starting with `---` delimiter.
 */
export function parseFrontmatter(raw: string): { frontmatter: PlanFrontmatter; body: string } {
  const trimmed = raw.trim();

  if (!trimmed.startsWith('---')) {
    throw new Error('Plan file must start with --- frontmatter delimiter');
  }

  // Find the closing --- delimiter
  const secondDelimiter = trimmed.indexOf('---', 3);
  if (secondDelimiter === -1) {
    throw new Error('Plan file missing closing --- frontmatter delimiter');
  }

  const yamlContent = trimmed.substring(3, secondDelimiter).trim();
  const body = trimmed.substring(secondDelimiter + 3).replace(/^\n/, '');

  const parsed = yamlParse(yamlContent);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid frontmatter YAML');
  }

  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('Frontmatter missing required field: name');
  }

  if (!parsed.description || typeof parsed.description !== 'string') {
    throw new Error('Frontmatter missing required field: description');
  }

  if (!parsed.status || typeof parsed.status !== 'string') {
    throw new Error('Frontmatter missing required field: status');
  }

  if (!VALID_STATUSES.includes(parsed.status as PlanStatus)) {
    throw new Error(
      `Invalid status "${parsed.status}". Must be one of: ${VALID_STATUSES.join(', ')}`
    );
  }

  const frontmatter: PlanFrontmatter = {
    name: parsed.name,
    description: parsed.description,
    status: parsed.status as PlanStatus,
  };

  if (parsed.tags && Array.isArray(parsed.tags)) {
    frontmatter.tags = parsed.tags;
  }

  return { frontmatter, body };
}

/**
 * Serialize a plan to its string representation (frontmatter + body)
 */
export function serializePlan(frontmatter: PlanFrontmatter, body: string): string {
  const yamlStr = yamlStringify(frontmatter);
  return `---\n${yamlStr}---\n${body}`;
}

/**
 * Read and parse a single plan file by name (without .md extension)
 */
export function readPlan(plansDir: string, name: string): PlanFile {
  const { id, filename, filePath } = resolvePlanPath(plansDir, name);

  if (!existsSync(filePath)) {
    throw new Error(`Plan not found: ${name} (looked for ${filePath})`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const plan = { id, frontmatter, body, filename };
  validatePlanIdentities([plan]);
  return plan;
}

/**
 * Write plan content to a file in the plans directory
 */
export function writePlan(plansDir: string, name: string, content: string): void {
  const { id, filename, filePath } = resolvePlanPath(plansDir, name);
  const parsed = parseFrontmatter(content);
  // Validate the prospective collection before mutation; allow repairing this file.
  const others = discoverPlans(plansDir).filter(plan => plan.filename !== filename);
  validatePlanIdentities([...others, { id, filename, ...parsed }]);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * List and parse all plan files in the plans directory
 */
export function listPlans(plansDir: string): PlanFile[] {
  const plans = discoverPlans(plansDir);
  validatePlanIdentities(plans);
  return plans;
}

function discoverPlans(plansDir: string): PlanFile[] {
  assertNotSymlink(plansDir);
  if (!existsSync(plansDir)) {
    return [];
  }

  const files: string[] = [];
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Never follow symlinked files or directories (including cycles).
      const filename = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), filename + '/');
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(filename);
    }
  }
  walk(plansDir, '');
  files.sort((a, b) => {
    const left = a.replace(/\\/g, '/');
    const right = b.replace(/\\/g, '/');
    return left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });
  const plans: PlanFile[] = [];

  for (const file of files) {
    const filePath = path.join(plansDir, file);
    // I/O errors are actionable; only unrelated malformed Markdown is skipped.
    const raw = readFileSync(filePath, 'utf-8');
    let parsed: ReturnType<typeof parseFrontmatter>;
    try {
      parsed = parseFrontmatter(raw);
    } catch {
      // Preserve existing behavior for Markdown without valid plan frontmatter.
      continue;
    }
    const id = normalizePlanId(file.slice(0, -3));
    plans.push({ id, ...parsed, filename: file });
  }

  return plans;
}

/** Check all identities together so diagnostics include both sides of conflicts. */
export function validatePlanIdentities(plans: PlanFile[]): void {
  const errors: string[] = [];
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  const cases = new Map<string, { spelling: string; file: string }>();
  const nameCases = new Map<string, { spelling: string; file: string }>();
  for (const plan of plans) {
    const { id, filename, frontmatter } = plan;
    for (const [map, value, label] of [[ids, id, 'ID'], [names, frontmatter.name, 'frontmatter name']] as const) {
      const previous = map.get(value);
      if (previous !== undefined) errors.push(`Duplicate ${label} "${value}" in "${previous}" and "${filename}".`);
      else map.set(value, filename);
    }
    const checkCase = (map: Map<string, { spelling: string; file: string }>, spelling: string) => {
      const key = spelling.toLowerCase();
      const previous = map.get(key);
      if (previous && previous.spelling !== spelling) {
        errors.push(`Case collision: "${previous.spelling}" in "${previous.file}" and "${spelling}" in "${filename}". Use one consistent spelling.`);
      } else map.set(key, { spelling, file: filename });
    };
    // Check directories too: Auth/a and auth/b cannot be portable siblings.
    const parts = (id + '.md').split('/');
    for (let i = 1; i <= parts.length; i++) checkCase(cases, parts.slice(0, i).join('/'));
    checkCase(nameCases, frontmatter.name);
    if (frontmatter.name !== id) {
      errors.push(`Frontmatter name "${frontmatter.name}" in "${filename}" must match canonical ID "${id}". Set name to "${id}" or move the file and update its links.`);
    }
    if (filename !== id + '.md') {
      errors.push(`Non-canonical filename "${filename}": use "${id}.md" with real folders and forward-slash IDs.`);
    }
  }
  if (errors.length) throw new Error('Plan identity errors:\n' + errors.join('\n'));
}

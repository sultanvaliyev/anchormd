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
  const filePath = path.join(plansDir, name + '.md');

  if (!existsSync(filePath)) {
    throw new Error(`Plan not found: ${name} (looked for ${filePath})`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  return {
    frontmatter,
    body,
    filename: name + '.md',
  };
}

/**
 * Write plan content to a file in the plans directory
 */
export function writePlan(plansDir: string, name: string, content: string): void {
  mkdirSync(plansDir, { recursive: true });
  const filePath = path.join(plansDir, name + '.md');
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * List and parse all plan files in the plans directory
 */
export function listPlans(plansDir: string): PlanFile[] {
  if (!existsSync(plansDir)) {
    return [];
  }

  const files = readdirSync(plansDir).filter(f => f.endsWith('.md')).sort();
  const plans: PlanFile[] = [];

  for (const file of files) {
    const filePath = path.join(plansDir, file);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);
      plans.push({
        frontmatter,
        body,
        filename: file,
      });
    } catch {
      // Skip files that fail to parse (e.g., malformed frontmatter)
      continue;
    }
  }

  return plans;
}

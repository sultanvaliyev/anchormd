/**
 * Output formatting with ANSI colors
 *
 * Respects NO_COLOR environment variable (https://no-color.org/)
 */

import type { PlanFile, PlanStatus, SearchResult } from './types.js';

const noColor = 'NO_COLOR' in process.env;

function wrap(code: string, s: string): string {
  return noColor ? s : `\x1b[${code}m${s}\x1b[0m`;
}

/** ANSI color helpers */
export const color = {
  bold: (s: string) => wrap('1', s),
  dim: (s: string) => wrap('2', s),
  green: (s: string) => wrap('32', s),
  yellow: (s: string) => wrap('33', s),
  cyan: (s: string) => wrap('36', s),
  red: (s: string) => wrap('31', s),
  blue: (s: string) => wrap('34', s),
};

/** Color a status string based on its value */
function colorStatus(status: PlanStatus): string {
  switch (status) {
    case 'built':
      return color.green(status);
    case 'in-progress':
      return color.yellow(status);
    case 'planned':
      return color.cyan(status);
    case 'deprecated':
      return color.red(status);
    default:
      return status;
  }
}

/** Strip ANSI codes for length calculation */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Format a single plan as a table row
 */
export function formatPlanRow(plan: PlanFile): string {
  const status = colorStatus(plan.frontmatter.status);
  return `  ${color.bold(plan.frontmatter.name)}  ${status}  ${color.dim(plan.frontmatter.description)}`;
}

/**
 * Format a list of plans as a columnar table
 */
export function formatPlanTable(plans: PlanFile[]): string {
  if (plans.length === 0) {
    return color.dim('  No plans found.');
  }

  // Calculate column widths
  const nameWidth = Math.max(...plans.map(p => p.frontmatter.name.length), 4);
  const statusWidth = Math.max(...plans.map(p => p.frontmatter.status.length), 6);

  const lines: string[] = [];

  // Header
  const header = `  ${'NAME'.padEnd(nameWidth)}  ${'STATUS'.padEnd(statusWidth)}  DESCRIPTION`;
  lines.push(color.dim(header));
  lines.push(color.dim('  ' + '-'.repeat(nameWidth + statusWidth + 20)));

  // Rows
  for (const plan of plans) {
    const name = color.bold(plan.frontmatter.name.padEnd(nameWidth));
    const status = colorStatus(plan.frontmatter.status);
    // Pad status accounting for ANSI codes
    const statusPad = ' '.repeat(Math.max(0, statusWidth - plan.frontmatter.status.length));
    const desc = color.dim(plan.frontmatter.description);
    lines.push(`  ${name}  ${status}${statusPad}  ${desc}`);
  }

  return lines.join('\n');
}

/**
 * Format search results as a numbered list
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return color.dim('  No results found.');
  }

  const lines: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const num = color.dim(`${i + 1}.`);
    const score = color.yellow(`[${r.score.toFixed(3)}]`);
    const path = color.bold(r.path);
    lines.push(`  ${num} ${score} ${path}`);

    if (r.content) {
      // Show a truncated preview of the content
      const preview = r.content.substring(0, 120).replace(/\n/g, ' ').trim();
      lines.push(`     ${color.dim(preview)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format project status information
 */
export function formatStatus(stats: {
  planCount: number;
  linkCount: number;
  weakEdgeCount: number;
  qmdEnabled: boolean;
}): string {
  const lines = [
    color.bold('AnchorMD Status'),
    '',
    `  Plans:       ${color.cyan(String(stats.planCount))}`,
    `  Links:       ${color.cyan(String(stats.linkCount))}`,
    `  Weak edges:  ${color.cyan(String(stats.weakEdgeCount))}`,
    `  QMD search:  ${stats.qmdEnabled ? color.green('enabled') : color.yellow('disabled')}`,
    '',
  ];

  return lines.join('\n');
}

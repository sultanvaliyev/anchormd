/**
 * AnchorMD CLI
 *
 * Persistent project context for AI coding agents using linked markdown plans
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { ensureProjectInitialized, getAnchorDir, getPlansDir } from './config.js';
import { readPlan, writePlan, listPlans, parseFrontmatter, serializePlan } from './plan.js';
import { rebuildAndWriteIndex, readIndex } from './index-graph.js';
import { getQmdStore, reindexQmd, searchQmd } from './qmd.js';
import { scaffold } from './scaffold.js';
import { color, formatPlanTable, formatSearchResults, formatStatus } from './format.js';
import type { PlanStatus } from './types.js';
import { VALID_STATUSES } from './types.js';

const VERSION = '0.1.2';

const program = new Command();

program
  .name('anchormd')
  .description('Persistent project context for AI coding agents using linked markdown plans')
  .version(VERSION);

// ─── init ────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize AnchorMD in the current project')
  .option('--no-qmd', 'Disable QMD search integration')
  .action(async (options) => {
    const anchorDir = path.join(process.cwd(), '.anchor');

    if (existsSync(anchorDir)) {
      console.error(color.red('Error: .anchor/ directory already exists. Project already initialized.'));
      process.exit(1);
    }

    await scaffold(process.cwd(), { qmd: options.qmd });
  });

// ─── context ─────────────────────────────────────────────────────────────────

program
  .command('context')
  .description('Print project overview and plan summary')
  .action(() => {
    const { projectRoot } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    // Print anchor.md content
    const anchorPath = path.join(plansDir, 'anchor.md');
    if (existsSync(anchorPath)) {
      const content = readFileSync(anchorPath, 'utf-8');
      console.log(content);
    }

    // Print plan summary table
    const plans = listPlans(plansDir);
    console.log(color.bold('Plans:'));
    console.log(formatPlanTable(plans));
    console.log('');
  });

// ─── write ───────────────────────────────────────────────────────────────────

program
  .command('write <name>')
  .description('Write or update a plan')
  .option('--from <file>', 'Read plan content from a file')
  .action(async (name: string, options) => {
    const { projectRoot, config } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);
    const anchorDir = getAnchorDir(projectRoot);

    let content: string;

    if (options.from) {
      // Read from specified file
      const fromPath = path.resolve(options.from);
      if (!existsSync(fromPath)) {
        console.error(color.red(`Error: File not found: ${fromPath}`));
        process.exit(1);
      }
      content = readFileSync(fromPath, 'utf-8');
    } else if (!process.stdin.isTTY) {
      // Read from piped stdin
      content = readFileSync(0, 'utf-8');
    } else {
      // Spawn editor
      const editor = process.env.EDITOR || 'vi';
      const tmpFile = path.join(tmpdir(), `anchormd-${name}-${Date.now()}.md`);

      // Provide a template
      const template = serializePlan(
        { name, description: 'Description of this plan', status: 'planned' },
        `# ${name}\n\nDescribe the plan here.\n`
      );
      writeFileSync(tmpFile, template, 'utf-8');

      try {
        execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
        content = readFileSync(tmpFile, 'utf-8');
      } catch {
        console.error(color.red('Error: Editor exited with an error'));
        process.exit(1);
      }
    }

    // Validate or wrap content with frontmatter
    try {
      parseFrontmatter(content);
    } catch {
      // Content doesn't have valid frontmatter, wrap it
      content = serializePlan(
        { name, description: `Plan: ${name}`, status: 'planned' },
        content
      );
    }

    // Write the plan
    writePlan(plansDir, name, content);
    console.log(color.green(`Plan "${name}" written.`));

    // Rebuild index
    const graph = rebuildAndWriteIndex(projectRoot);
    const nodeCount = Object.keys(graph.nodes).length;
    console.log(color.dim(`Index rebuilt (${nodeCount} plans).`));

    // Reindex QMD if enabled
    if (config.qmd) {
      const store = await getQmdStore(anchorDir, config);
      await reindexQmd(store);
    }
  });

// ─── ls ──────────────────────────────────────────────────────────────────────

program
  .command('ls')
  .description('List all plans')
  .option('--status <status>', 'Filter by status (planned, in-progress, built, deprecated)')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const { projectRoot } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    let plans = listPlans(plansDir);

    // Filter by status
    if (options.status) {
      const status = options.status as PlanStatus;
      if (!VALID_STATUSES.includes(status)) {
        console.error(color.red(`Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`));
        process.exit(1);
      }
      plans = plans.filter(p => p.frontmatter.status === status);
    }

    if (options.json) {
      console.log(JSON.stringify(plans, null, 2));
    } else {
      console.log(formatPlanTable(plans));
    }
  });

// ─── read ────────────────────────────────────────────────────────────────────

program
  .command('read <name>')
  .description('Read a plan (supports name#section deep links)')
  .action((nameArg: string) => {
    const { projectRoot } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    // Parse name#section
    const hashIndex = nameArg.indexOf('#');
    let planName: string;
    let section: string | null = null;

    if (hashIndex !== -1) {
      planName = nameArg.substring(0, hashIndex);
      section = nameArg.substring(hashIndex + 1);
    } else {
      planName = nameArg;
    }

    const plan = readPlan(plansDir, planName);

    if (section) {
      // Extract the specified section
      const sectionContent = extractSection(plan.body, section);
      if (sectionContent === null) {
        console.error(color.red(`Section "${section}" not found in plan "${planName}"`));
        process.exit(1);
      }
      console.log(sectionContent);
    } else {
      // Print full plan content
      const fullContent = serializePlan(plan.frontmatter, plan.body);
      console.log(fullContent);
    }
  });

// ─── find ────────────────────────────────────────────────────────────────────

program
  .command('find <query>')
  .description('Search plans using QMD')
  .option('--semantic', 'Use semantic (vector) search')
  .option('--hybrid', 'Use hybrid search (lexical + semantic)')
  .option('--limit <n>', 'Maximum number of results', '10')
  .option('--json', 'Output as JSON')
  .action(async (query: string, options) => {
    const { projectRoot, config } = ensureProjectInitialized();
    const anchorDir = getAnchorDir(projectRoot);

    let mode: 'lexical' | 'semantic' | 'hybrid' = 'lexical';
    if (options.semantic) mode = 'semantic';
    if (options.hybrid) mode = 'hybrid';

    const limit = parseInt(options.limit, 10) || 10;

    const store = await getQmdStore(anchorDir, config);

    try {
      const results = await searchQmd(store, query, { mode, limit });

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatSearchResults(results));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(color.red(message));
      process.exit(1);
    }
  });

// ─── reindex ─────────────────────────────────────────────────────────────────

program
  .command('reindex')
  .description('Rebuild the index graph and QMD search database')
  .action(async () => {
    const { projectRoot, config } = ensureProjectInitialized();
    const anchorDir = getAnchorDir(projectRoot);

    // Rebuild index graph
    const graph = rebuildAndWriteIndex(projectRoot);
    const nodeCount = Object.keys(graph.nodes).length;
    const linkCount = Object.values(graph.nodes).reduce((sum, n) => sum + n.links.length, 0);
    const weakEdgeCount = Object.values(graph.nodes).reduce((sum, n) => sum + n.weakEdges.length, 0);

    console.log(color.green('Index rebuilt.'));
    console.log(`  Plans: ${color.cyan(String(nodeCount))}`);
    console.log(`  Links: ${color.cyan(String(linkCount))}`);
    console.log(`  Weak edges: ${color.cyan(String(weakEdgeCount))}`);

    // Reindex QMD if enabled
    if (config.qmd) {
      const store = await getQmdStore(anchorDir, config);
      await reindexQmd(store);
      console.log(color.green('QMD search index updated.'));
    } else {
      console.log(color.dim('QMD search: disabled'));
    }
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show project status and statistics')
  .action(() => {
    const { projectRoot, config } = ensureProjectInitialized();
    const anchorDir = getAnchorDir(projectRoot);

    const graph = readIndex(anchorDir);

    let planCount = 0;
    let linkCount = 0;
    let weakEdgeCount = 0;

    if (graph) {
      const nodes = Object.values(graph.nodes);
      planCount = nodes.length;
      linkCount = nodes.reduce((sum, n) => sum + n.links.length, 0);
      weakEdgeCount = nodes.reduce((sum, n) => sum + n.weakEdges.length, 0);
    }

    console.log(formatStatus({
      planCount,
      linkCount,
      weakEdgeCount,
      qmdEnabled: config.qmd,
    }));
  });

// ─── Section extraction helper ───────────────────────────────────────────────

/**
 * Extract a section from markdown content by heading slug.
 * Matches heading text case-insensitively, slugified (spaces -> hyphens, lowercase).
 * Returns content from the matched heading to the next same-level or higher heading.
 */
function extractSection(body: string, sectionSlug: string): string | null {
  const lines = body.split('\n');
  const targetSlug = sectionSlug.toLowerCase();

  let capturing = false;
  let captureLevel = 0;
  const captured: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (capturing) {
        // Stop if we hit a same-level or higher-level heading
        if (level <= captureLevel) {
          break;
        }
      }

      if (slug === targetSlug) {
        capturing = true;
        captureLevel = level;
      }
    }

    if (capturing) {
      captured.push(line);
    }
  }

  if (captured.length === 0) {
    return null;
  }

  return captured.join('\n').trimEnd();
}

// ─── Parse and run ───────────────────────────────────────────────────────────

program.parse(process.argv);

/**
 * Project initialization scaffold
 *
 * Creates the .anchor/ directory structure and template files
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { saveConfig, getAnchorDir, getPlansDir } from './config.js';
import { writeIndex } from './index-graph.js';
import { getQmdStore, reindexQmd } from './qmd.js';
import { color } from './format.js';
import type { IndexGraph } from './types.js';

const TEMPLATE_ANCHOR_PLAN = `---
name: anchor
description: Project overview and architecture
status: planned
---
# Project Overview

Describe your project here.

## Architecture

## Key Decisions
`;

/**
 * Initialize AnchorMD in a project directory.
 *
 * Creates:
 * - .anchor/ directory
 * - .anchor/plans/ directory with template anchor.md
 * - .anchor/config.json
 * - .anchor/index.json (empty graph)
 * - Appends to .gitignore
 */
export async function scaffold(
  projectRoot: string,
  options: { qmd: boolean }
): Promise<void> {
  const anchorDir = getAnchorDir(projectRoot);
  const plansDir = getPlansDir(projectRoot);

  // Create directories
  mkdirSync(plansDir, { recursive: true });

  // Write config
  saveConfig(projectRoot, { qmd: options.qmd });

  // Write template plan
  const templatePath = path.join(plansDir, 'anchor.md');
  if (!existsSync(templatePath)) {
    writeFileSync(templatePath, TEMPLATE_ANCHOR_PLAN, 'utf-8');
  }

  // Write empty index
  const emptyGraph: IndexGraph = {
    nodes: {},
    lastBuilt: new Date().toISOString(),
  };
  writeIndex(anchorDir, emptyGraph);

  // Append to .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const gitignoreEntry = '.anchor/search.sqlite';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(gitignoreEntry)) {
      appendFileSync(gitignorePath, `\n${gitignoreEntry}\n`, 'utf-8');
    }
  } else {
    writeFileSync(gitignorePath, `${gitignoreEntry}\n`, 'utf-8');
  }

  // Initialize QMD if enabled
  if (options.qmd) {
    const store = await getQmdStore(anchorDir, { qmd: true });
    await reindexQmd(store);
  }

  // Print success message
  console.log(color.green('AnchorMD initialized successfully!'));
  console.log('');
  console.log('  Created:');
  console.log(`    ${color.dim('.anchor/config.json')}`);
  console.log(`    ${color.dim('.anchor/plans/anchor.md')}`);
  console.log(`    ${color.dim('.anchor/index.json')}`);
  console.log('');
  console.log('  Next steps:');
  console.log(`    1. Edit ${color.bold('.anchor/plans/anchor.md')} with your project overview`);
  console.log(`    2. Run ${color.bold('anchormd write <plan-name>')} to create more plans`);
  console.log(`    3. Run ${color.bold('anchormd context')} to see your project context`);
  console.log('');
}

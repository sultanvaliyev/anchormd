/**
 * Project initialization scaffold
 *
 * Creates the .anchor/ directory structure and template files
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { saveConfig, getAnchorDir, getPlansDir } from './config.js';
import { writeIndex } from './index-graph.js';
import { getQmdStore, deriveCollectionName, ensureCollection, reindexQmd } from './qmd.js';
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
 * - Registers collection in central QMD database (if QMD enabled)
 */
export async function scaffold(
  projectRoot: string,
  options: { qmd: boolean }
): Promise<void> {
  const anchorDir = getAnchorDir(projectRoot);
  const plansDir = getPlansDir(projectRoot);

  // Create directories
  mkdirSync(plansDir, { recursive: true });

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

  // Initialize QMD if enabled — derive collection name, register, reindex
  let collectionName: string | undefined;

  if (options.qmd) {
    const store = await getQmdStore({ qmd: true });
    if (store) {
      collectionName = await deriveCollectionName(store, projectRoot);
      await ensureCollection(store, collectionName, plansDir);
      await reindexQmd(store, collectionName);
    }
  }

  // Write config (includes collectionName if QMD was set up)
  saveConfig(projectRoot, { qmd: options.qmd, collectionName });

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

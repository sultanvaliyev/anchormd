/**
 * Project configuration and root detection
 *
 * Manages .anchor/config.json and project root discovery
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AnchorConfig } from './types.js';

const DEFAULT_CONFIG: AnchorConfig = { qmd: false };

/**
 * Walk up the directory tree looking for .anchor/ directory.
 * Returns the directory containing .anchor/, or null if not found.
 */
export function findProjectRoot(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();

  while (true) {
    const anchorPath = path.join(dir, '.anchor');
    if (existsSync(anchorPath)) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      // Hit filesystem root
      return null;
    }
    dir = parent;
  }
}

/**
 * Get the .anchor directory path for a project root
 */
export function getAnchorDir(projectRoot: string): string {
  return path.join(projectRoot, '.anchor');
}

/**
 * Get the plans directory path for a project root
 */
export function getPlansDir(projectRoot: string): string {
  return path.join(projectRoot, '.anchor', 'plans');
}

/**
 * Load configuration from .anchor/config.json.
 * Returns defaults if file is missing or malformed.
 */
export function loadConfig(projectRoot: string): AnchorConfig {
  const configPath = path.join(getAnchorDir(projectRoot), 'config.json');

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      qmd: typeof parsed.qmd === 'boolean' ? parsed.qmd : DEFAULT_CONFIG.qmd,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to .anchor/config.json
 */
export function saveConfig(projectRoot: string, config: AnchorConfig): void {
  const anchorDir = getAnchorDir(projectRoot);
  mkdirSync(anchorDir, { recursive: true });
  const configPath = path.join(anchorDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Ensure the project has been initialized with anchormd.
 * Throws with a user-friendly message if .anchor/ is not found.
 */
export function ensureProjectInitialized(): { projectRoot: string; config: AnchorConfig } {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw new Error(
      'No AnchorMD project found. Run `anchormd init` to initialize one.'
    );
  }

  const config = loadConfig(projectRoot);
  return { projectRoot, config };
}

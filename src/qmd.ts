/**
 * QMD integration layer
 *
 * Integrates @tobilu/qmd for hybrid search over plan files.
 * Uses a single central database at ~/.anchormd/anchormd.sqlite with
 * per-project collections for cross-project awareness.
 *
 * Dynamic import so the CLI doesn't crash if sqlite-vec is unavailable.
 */

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { color } from './format.js';
import type { AnchorConfig, SearchResult } from './types.js';

// We can't use the actual QMDStore type at the top level since the import
// itself may fail (sqlite-vec). Use an opaque wrapper instead.
export type QmdStore = {
  update(options?: { collections?: string[] }): Promise<{ collections: number; indexed: number; updated: number; unchanged: number; removed: number; needsEmbedding: number }>;
  embed(): Promise<{ docsProcessed: number; chunksEmbedded: number; errors: number; durationMs: number }>;
  searchLex(query: string, opts: { limit: number; collection?: string }): Promise<Array<{ displayPath: string; score: number; body: string }>>;
  searchVector(query: string, opts: { limit: number; collection?: string }): Promise<Array<{ displayPath: string; score: number; body: string }>>;
  search(opts: { query: string; limit: number; collection?: string }): Promise<Array<{ displayPath: string; score: number; bestChunk: string }>>;
  addCollection(name: string, opts: { path: string; pattern?: string }): Promise<void>;
  removeCollection(name: string): Promise<boolean>;
  listCollections(): Promise<Array<{ name: string; pwd: string; glob_pattern: string; doc_count: number; active_count: number; last_modified: string | null; includeByDefault: boolean }>>;
  close(): Promise<void>;
};

// Single global cached store (one central DB for all projects)
let cachedStore: QmdStore | null = null;
let qmdUnavailable = false;
let customSqliteConfigured = false;

/**
 * On macOS, Bun ships with Apple's SQLite which has extension loading disabled.
 * We must call Database.setCustomSQLite() with a Homebrew-installed vanilla
 * SQLite BEFORE any Database instances are created.
 */
async function ensureCustomSQLite(): Promise<void> {
  if (customSqliteConfigured) return;
  customSqliteConfigured = true;

  // Only needed on macOS
  if (process.platform !== 'darwin') return;

  // Only needed in Bun
  if (typeof globalThis.Bun === 'undefined') return;

  // Find Homebrew sqlite dylib
  const dylibPath = findHomebrewSqliteDylib();
  if (!dylibPath) return;

  try {
    const { Database } = await import('bun:sqlite' as string);
    Database.setCustomSQLite(dylibPath);
  } catch {
    // If setCustomSQLite isn't available or fails, proceed without it
  }
}

/**
 * Locate the Homebrew-installed libsqlite3.dylib.
 * Checks the symlinked path first, then falls back to scanning the Cellar.
 */
function findHomebrewSqliteDylib(): string | null {
  // Try the Homebrew opt symlink first (most reliable)
  const optPath = '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib';
  if (existsSync(optPath)) return optPath;

  // Intel Mac Homebrew location
  const intelOptPath = '/usr/local/opt/sqlite/lib/libsqlite3.dylib';
  if (existsSync(intelOptPath)) return intelOptPath;

  // Try brew --prefix as last resort
  try {
    const prefix = execSync('brew --prefix sqlite 2>/dev/null', { encoding: 'utf-8' }).trim();
    const brewPath = path.join(prefix, 'lib', 'libsqlite3.dylib');
    if (existsSync(brewPath)) return brewPath;
  } catch {
    // brew not installed or sqlite not installed via brew
  }

  return null;
}

/**
 * Get the path to the central QMD database.
 */
export function getCentralDbPath(): string {
  return path.join(os.homedir(), '.anchormd', 'anchormd.sqlite');
}

/**
 * Ensure the central ~/.anchormd/ directory exists.
 */
export function ensureCentralDir(): void {
  const dir = path.join(os.homedir(), '.anchormd');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get a QMD store instance backed by the central database.
 *
 * Dynamically imports @tobilu/qmd so the CLI works even when sqlite-vec
 * is missing. Returns null when QMD is disabled or unavailable.
 */
export async function getQmdStore(config: AnchorConfig): Promise<QmdStore | null> {
  if (config.qmd === false) {
    return null;
  }

  // If we already know QMD can't load, don't retry
  if (qmdUnavailable) {
    return null;
  }

  // Return cached store if available
  if (cachedStore) {
    return cachedStore;
  }

  try {
    ensureCentralDir();
    const dbPath = getCentralDbPath();

    // On macOS, swap in Homebrew SQLite before any Database is created
    await ensureCustomSQLite();

    const { createStore } = await import('@tobilu/qmd');

    const store = await createStore({
      dbPath,
    }) as unknown as QmdStore;

    cachedStore = store;
    return store;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('sqlite-vec') || msg.includes('extension') || msg.includes('loadExtension') || msg.includes('dynamic extension loading')) {
      console.error(color.yellow('Warning: QMD unavailable — sqlite-vec extension could not load.'));
      if (process.platform === 'darwin') {
        console.error(color.dim('  macOS requires Homebrew SQLite: brew install sqlite'));
      }
      console.error(color.dim('  Run `anchormd init --no-qmd` to disable QMD, or fix your SQLite installation.'));
      qmdUnavailable = true;
      return null;
    }
    throw err;
  }
}

/**
 * Derive a collection name from a project root directory.
 *
 * Slugifies the directory basename. If a collision is detected with a
 * different path, appends a numeric suffix.
 */
export async function deriveCollectionName(store: QmdStore, projectRoot: string): Promise<string> {
  const basename = path.basename(projectRoot);
  const slug = basename
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'project';

  const collections = await store.listCollections();

  // Check if this slug is already used
  const existing = collections.find(c => c.name === slug);
  if (!existing) {
    return slug;
  }

  // If the existing collection points to the same project's plans dir, reuse it
  const plansPath = path.join(projectRoot, '.anchor', 'plans');
  if (existing.pwd === plansPath) {
    return slug;
  }

  // Collision with a different project — find next available suffix
  let suffix = 2;
  while (true) {
    const candidate = `${slug}-${suffix}`;
    const match = collections.find(c => c.name === candidate);
    if (!match) {
      return candidate;
    }
    // Reuse if it points to our plans dir
    if (match.pwd === plansPath) {
      return candidate;
    }
    suffix++;
  }
}

/**
 * Register or update a collection in the central QMD store.
 *
 * Uses addCollection which is an upsert — safe to call on every run.
 * Also handles project moves by updating the path if it changed.
 */
export async function ensureCollection(store: QmdStore, collectionName: string, plansPath: string): Promise<void> {
  await store.addCollection(collectionName, {
    path: plansPath,
    pattern: '**/*.md',
  });
}

// Track whether sqlite-vec is available for vector operations
let sqliteVecAvailable = true;

/**
 * Reindex the QMD search database, optionally scoped to a collection.
 * No-op when QMD is disabled or unavailable.
 *
 * BM25 (update) always runs. Vector embeddings (embed) are attempted but
 * failures due to missing sqlite-vec are non-fatal — lexical search still works.
 */
export async function reindexQmd(store: QmdStore | null, collectionName?: string): Promise<void> {
  if (store === null) {
    return;
  }

  const updateOpts = collectionName ? { collections: [collectionName] } : undefined;
  await store.update(updateOpts);

  // embed() requires sqlite-vec — skip if we already know it's unavailable
  if (!sqliteVecAvailable) {
    return;
  }

  try {
    await store.embed();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('sqlite-vec') || msg.includes('extension') || msg.includes('Vector operations')) {
      sqliteVecAvailable = false;
      console.error(color.yellow('Warning: Vector embeddings unavailable — sqlite-vec extension not loaded.'));
      console.error(color.dim('  Lexical search (BM25) still works. Semantic/hybrid search requires sqlite-vec.'));
      return;
    }
    throw err;
  }
}

/**
 * Slugify a heading text to a URL-friendly fragment.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse all headings from markdown content into sections with their line ranges.
 */
function parseHeadings(content: string): Array<{ slug: string; start: number; level: number }> {
  const lines = content.split('\n');
  const headings: Array<{ slug: string; start: number; level: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ slug: slugify(match[2]), start: i, level: match[1].length });
    }
  }

  return headings;
}

/**
 * Find the best matching section for a query within content.
 * Returns the section slug and line range if a strong match is found.
 */
function findBestSection(content: string, query: string): { slug: string; startLine: number; endLine: number } | undefined {
  const headings = parseHeadings(content);
  if (headings.length <= 1) return undefined; // No sub-sections to link to

  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (queryTerms.length === 0) return undefined;

  const lines = content.split('\n');

  let bestSlug: string | undefined;
  let bestStart = 0;
  let bestEnd = 0;
  let bestScore = 0;

  for (let h = 0; h < headings.length; h++) {
    const heading = headings[h];
    // Skip the top-level heading (# Title) — that's the whole plan
    if (heading.level === 1) continue;

    const sectionEnd = h + 1 < headings.length ? headings[h + 1].start : lines.length;
    const sectionText = lines.slice(heading.start, sectionEnd).join(' ').toLowerCase();

    // Score: count how many query terms appear in this section
    let score = 0;
    for (const term of queryTerms) {
      if (sectionText.includes(term)) score++;
    }

    // Bonus for heading itself containing query terms
    const headingText = heading.slug;
    for (const term of queryTerms) {
      if (headingText.includes(term)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlug = heading.slug;
      bestStart = heading.start;
      bestEnd = sectionEnd;
    }
  }

  // Only return if at least half the query terms matched
  if (bestScore >= queryTerms.length && bestSlug) {
    // Convert to 1-indexed lines
    return { slug: bestSlug, startLine: bestStart + 1, endLine: bestEnd };
  }

  return undefined;
}

/**
 * Enrich search results with deep links to the best matching section.
 */
function enrichWithDeepLinks(results: SearchResult[], query: string): SearchResult[] {
  for (const result of results) {
    if (!result.content) continue;

    const match = findBestSection(result.content, query);
    if (match) {
      const planName = result.path.replace(/\.md$/, '').replace(/^[^/]+\//, '');
      result.deepLink = `${planName}#${match.slug}`;
      result.lines = { start: match.startLine, end: match.endLine };
    }
  }
  return results;
}

/**
 * Search using QMD, scoped to a specific collection.
 *
 * Supports three modes:
 * - lexical: BM25 full-text search
 * - semantic: vector similarity search
 * - hybrid: multi-signal retrieval with LLM reranking
 *
 * Throws a helpful error when QMD is not available.
 */
export async function searchQmd(
  store: QmdStore | null,
  query: string,
  options: { mode: 'lexical' | 'semantic' | 'hybrid'; limit: number; collection?: string }
): Promise<SearchResult[]> {
  if (store === null) {
    throw new Error(
      'QMD search is not available. Ensure QMD is enabled in your project config.\n' +
      'Run `anchormd init` (without --no-qmd) to enable QMD search.\n' +
      'Use `anchormd read <plan>` or `anchormd ls` to find plans manually.'
    );
  }

  // Fall back to lexical if semantic/hybrid requested but sqlite-vec is unavailable
  let effectiveMode = options.mode;
  if (!sqliteVecAvailable && (options.mode === 'semantic' || options.mode === 'hybrid')) {
    console.error(color.yellow(`Warning: ${options.mode} search requires sqlite-vec. Falling back to lexical search.`));
    effectiveMode = 'lexical';
  }

  let mapped: SearchResult[];

  switch (effectiveMode) {
    case 'lexical': {
      const results = await store.searchLex(query, { limit: options.limit, collection: options.collection });
      mapped = results.map(r => ({
        path: r.displayPath,
        score: r.score,
        content: r.body,
      }));
      break;
    }

    case 'semantic': {
      const results = await store.searchVector(query, { limit: options.limit, collection: options.collection });
      mapped = results.map(r => ({
        path: r.displayPath,
        score: r.score,
        content: r.body,
      }));
      break;
    }

    case 'hybrid': {
      const results = await store.search({
        query,
        limit: options.limit,
        collection: options.collection,
      });
      mapped = results.map(r => ({
        path: r.displayPath,
        score: r.score,
        content: r.bestChunk,
      }));
      break;
    }
  }

  return enrichWithDeepLinks(mapped, query);
}

/**
 * QMD integration layer
 *
 * Integrates @tobilu/qmd for hybrid search over plan files.
 * Uses dynamic import so the CLI doesn't crash if sqlite-vec is unavailable.
 */

import path from 'node:path';
import { color } from './format.js';
import type { AnchorConfig, SearchResult } from './types.js';

// We can't use the actual QMDStore type at the top level since the import
// itself may fail (sqlite-vec). Use an opaque wrapper instead.
export type QmdStore = {
  update(): Promise<void>;
  embed(): Promise<void>;
  searchLex(query: string, opts: { limit: number }): Promise<Array<{ displayPath: string; score: number; body: string }>>;
  searchVector(query: string, opts: { limit: number }): Promise<Array<{ displayPath: string; score: number; body: string }>>;
  search(opts: { query: string; limit: number }): Promise<Array<{ displayPath: string; score: number; bestChunk: string }>>;
  close(): Promise<void>;
};

// Cache the store instance
let cachedStore: QmdStore | null = null;
let cachedStoreKey: string | null = null;
let qmdUnavailable = false;

/**
 * Get a QMD store instance.
 *
 * Dynamically imports @tobilu/qmd so the CLI works even when sqlite-vec
 * is missing. Returns null when QMD is disabled or unavailable.
 */
export async function getQmdStore(anchorDir: string, config: AnchorConfig): Promise<QmdStore | null> {
  if (config.qmd === false) {
    return null;
  }

  // If we already know QMD can't load, don't retry
  if (qmdUnavailable) {
    return null;
  }

  const dbPath = path.join(anchorDir, 'search.sqlite');
  const plansPath = path.join(anchorDir, 'plans');

  // Return cached store if it matches
  if (cachedStore && cachedStoreKey === anchorDir) {
    return cachedStore;
  }

  // Close previous store if switching directories
  if (cachedStore) {
    await cachedStore.close();
    cachedStore = null;
    cachedStoreKey = null;
  }

  try {
    const { createStore } = await import('@tobilu/qmd');

    const store = await createStore({
      dbPath,
      config: {
        collections: {
          plans: {
            path: plansPath,
            pattern: '**/*.md',
          },
        },
      },
    }) as unknown as QmdStore;

    cachedStore = store;
    cachedStoreKey = anchorDir;

    return store;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('sqlite-vec') || msg.includes('extension') || msg.includes('loadExtension')) {
      console.error(color.yellow('Warning: QMD unavailable — sqlite-vec extension not found.'));
      console.error(color.dim('  Run `anchormd init --no-qmd` or install sqlite-vec for your platform.'));
      qmdUnavailable = true;
      return null;
    }
    throw err;
  }
}

/**
 * Reindex the QMD search database.
 * No-op when QMD is disabled or unavailable.
 */
export async function reindexQmd(store: QmdStore | null): Promise<void> {
  if (store === null) {
    return;
  }

  await store.update();
  await store.embed();
}

/**
 * Search using QMD.
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
  options: { mode: 'lexical' | 'semantic' | 'hybrid'; limit: number }
): Promise<SearchResult[]> {
  if (store === null) {
    throw new Error(
      'QMD search is not available (sqlite-vec extension missing).\n' +
      'Run `anchormd init --no-qmd` to disable QMD, or install sqlite-vec for your platform.\n' +
      'Use `anchormd read <plan>` or `anchormd ls` to browse plans without search.'
    );
  }

  switch (options.mode) {
    case 'lexical': {
      const results = await store.searchLex(query, { limit: options.limit });
      return results.map(r => ({
        path: r.displayPath,
        score: r.score,
        content: r.body,
      }));
    }

    case 'semantic': {
      const results = await store.searchVector(query, { limit: options.limit });
      return results.map(r => ({
        path: r.displayPath,
        score: r.score,
        content: r.body,
      }));
    }

    case 'hybrid': {
      const results = await store.search({
        query,
        limit: options.limit,
      });
      return results.map(r => ({
        path: r.displayPath,
        score: r.score,
        content: r.bestChunk,
      }));
    }
  }
}

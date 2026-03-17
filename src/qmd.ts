/**
 * QMD integration layer
 *
 * Integrates @tobilu/qmd for hybrid search over plan files.
 * Requires Bun runtime (QMD uses better-sqlite3 and sqlite-vec).
 */

import path from 'node:path';
import { createStore, type QMDStore } from '@tobilu/qmd';
import type { AnchorConfig, SearchResult } from './types.js';

export type QmdStore = QMDStore;

// Cache the store instance to avoid recreating it on every call
let cachedStore: QMDStore | null = null;
let cachedStoreKey: string | null = null;

/**
 * Get a QMD store instance.
 *
 * Creates a QMD store backed by `.anchor/search.sqlite` with a single
 * collection pointing at `.anchor/plans/`. The store is cached so
 * subsequent calls with the same anchorDir reuse the same instance.
 *
 * Returns null when QMD is disabled in config.
 */
export async function getQmdStore(anchorDir: string, config: AnchorConfig): Promise<QMDStore | null> {
  if (config.qmd === false) {
    return null;
  }

  const dbPath = path.join(anchorDir, 'search.sqlite');
  const plansPath = path.join(anchorDir, 'plans');

  // Return cached store if it matches the same anchor directory
  if (cachedStore && cachedStoreKey === anchorDir) {
    return cachedStore;
  }

  // Close previous store if switching directories
  if (cachedStore) {
    await cachedStore.close();
    cachedStore = null;
    cachedStoreKey = null;
  }

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
  });

  cachedStore = store;
  cachedStoreKey = anchorDir;

  return store;
}

/**
 * Reindex the QMD search database.
 *
 * Scans the plans directory for new/changed/removed files and updates
 * the FTS and vector indexes.
 *
 * No-op when QMD is disabled or unavailable.
 */
export async function reindexQmd(store: QMDStore | null): Promise<void> {
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
 * - lexical: BM25 full-text search (fast, no LLM)
 * - semantic: vector similarity search (uses embedding model)
 * - hybrid: full pipeline with query expansion, multi-signal retrieval, and LLM reranking
 *
 * Throws a helpful error when QMD is not available.
 */
export async function searchQmd(
  store: QMDStore | null,
  query: string,
  options: { mode: 'lexical' | 'semantic' | 'hybrid'; limit: number }
): Promise<SearchResult[]> {
  if (store === null) {
    throw new Error(
      'QMD search is not available. Ensure QMD is enabled in your project config.\n' +
      'Run `anchormd init` (without --no-qmd) to enable QMD search.\n' +
      'Use `anchormd read <plan>` or `anchormd ls` to find plans manually.'
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

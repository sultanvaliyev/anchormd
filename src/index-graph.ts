/**
 * Index graph builder and I/O
 *
 * Builds a graph of plan relationships from:
 * - Strong links: explicit [[plan]] references
 * - Weak edges: shared entities between plans (same file, model, route, or script)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { listPlans } from './plan.js';
import { parseLinks, getStrongLinks } from './links.js';
import { extractEntities } from './entities.js';
import { getPlansDir, getAnchorDir } from './config.js';
import type { IndexGraph, IndexGraphNode, Entity } from './types.js';

/**
 * Build the index graph from all plans in the plans directory.
 *
 * For each plan:
 * 1. Extract strong links (explicit [[references]])
 * 2. Extract entities (file paths, models, routes, scripts)
 * 3. Compute weak edges (plans sharing the same entity)
 */
export function buildIndex(plansDir: string): IndexGraph {
  const plans = listPlans(plansDir);

  // Map of entityKey -> list of plan names that reference it
  const entityToPlanMap = new Map<string, string[]>();

  // Build initial nodes and populate the entity map
  const nodes: Record<string, IndexGraphNode> = {};

  for (const plan of plans) {
    const name = plan.frontmatter.name;
    const fullContent = plan.body;

    // Extract strong links (target names)
    const links = parseLinks(fullContent);
    const strongLinks = getStrongLinks(links).map(l => l.target);

    // Extract entities
    const entities = extractEntities(fullContent);

    // Register entities in the map
    for (const entity of entities) {
      const key = `${entity.type}:${entity.value}`;
      const existing = entityToPlanMap.get(key) || [];
      if (!existing.includes(name)) {
        existing.push(name);
        entityToPlanMap.set(key, existing);
      }
    }

    nodes[name] = {
      name,
      links: strongLinks,
      entities,
      weakEdges: [], // Filled in below
    };
  }

  // Compute weak edges from shared entities
  for (const planNames of entityToPlanMap.values()) {
    if (planNames.length < 2) continue;

    // All plans sharing this entity get weak edges to each other
    for (const planA of planNames) {
      for (const planB of planNames) {
        if (planA === planB) continue;
        const node = nodes[planA];
        if (node && !node.weakEdges.includes(planB)) {
          node.weakEdges.push(planB);
        }
      }
    }
  }

  return {
    nodes,
    lastBuilt: new Date().toISOString(),
  };
}

/**
 * Write the index graph to .anchor/index.json
 */
export function writeIndex(anchorDir: string, graph: IndexGraph): void {
  mkdirSync(anchorDir, { recursive: true });
  const indexPath = path.join(anchorDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify(graph, null, 2) + '\n', 'utf-8');
}

/**
 * Read the index graph from .anchor/index.json
 * Returns null if the file doesn't exist.
 */
export function readIndex(anchorDir: string): IndexGraph | null {
  const indexPath = path.join(anchorDir, 'index.json');

  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const raw = readFileSync(indexPath, 'utf-8');
    return JSON.parse(raw) as IndexGraph;
  } catch {
    return null;
  }
}

/**
 * Rebuild the index and write it to disk.
 * Returns the built graph.
 */
export function rebuildAndWriteIndex(projectRoot: string): IndexGraph {
  const plansDir = getPlansDir(projectRoot);
  const anchorDir = getAnchorDir(projectRoot);
  const graph = buildIndex(plansDir);
  writeIndex(anchorDir, graph);
  return graph;
}

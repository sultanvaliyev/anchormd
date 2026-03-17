/**
 * Entity extraction from plan content
 *
 * Extracts references to:
 * - File paths (strings with / and common extensions)
 * - Models (PascalCase words near model/schema/table/entity keywords)
 * - Routes (HTTP method + path patterns)
 * - Scripts (shell script filenames and npm run commands)
 */

import type { Entity } from './types.js';

/**
 * Extract file path references from content.
 * Matches paths containing `/` with common source file extensions.
 */
function extractFilePaths(content: string): Entity[] {
  const regex = /(?:^|\s|['"`(])([a-zA-Z0-9._\-/]+\.(?:ts|js|tsx|jsx|py|go|rs|sql|json|yaml|yml|md|css|html|sh|toml|env))\b/gm;
  const entities: Entity[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const value = match[1];
    // Only include paths that contain a slash (to avoid bare filenames matching too broadly)
    // Exception: script files like deploy.sh are handled by extractScripts
    if (value.includes('/')) {
      entities.push({ type: 'file', value });
    }
  }

  return entities;
}

/**
 * Extract model/schema references from content.
 * Matches PascalCase words near model/schema/table/entity keywords.
 */
function extractModels(content: string): Entity[] {
  const entities: Entity[] = [];

  // Pattern: keyword followed by PascalCase name
  const forwardRegex = /(?:model|schema|table|entity|Model|Schema)\s+([A-Z][a-zA-Z0-9]+)/g;
  let match: RegExpExecArray | null;

  while ((match = forwardRegex.exec(content)) !== null) {
    entities.push({ type: 'model', value: match[1] });
  }

  // Pattern: PascalCase name followed by keyword
  const reverseRegex = /([A-Z][a-zA-Z0-9]+)\s+(?:model|schema|table|entity)/g;

  while ((match = reverseRegex.exec(content)) !== null) {
    entities.push({ type: 'model', value: match[1] });
  }

  return entities;
}

/**
 * Extract HTTP route references from content.
 * Matches HTTP methods followed by URL paths.
 */
function extractRoutes(content: string): Entity[] {
  const regex = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9/:._\-{}*]+)/g;
  const entities: Entity[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    entities.push({ type: 'route', value: `${match[1]} ${match[2]}` });
  }

  return entities;
}

/**
 * Extract script references from content.
 * Matches shell script filenames and npm run commands.
 */
function extractScripts(content: string): Entity[] {
  const entities: Entity[] = [];

  // Shell script filenames
  const scriptRegex = /(?:^|\s|['"`(])([a-zA-Z0-9_\-]+\.(?:sh|bash|zsh))\b/gm;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(content)) !== null) {
    entities.push({ type: 'script', value: match[1] });
  }

  // npm run commands
  const npmRegex = /npm\s+run\s+([a-zA-Z0-9_\-:]+)/g;

  while ((match = npmRegex.exec(content)) !== null) {
    entities.push({ type: 'script', value: `npm run ${match[1]}` });
  }

  return entities;
}

/**
 * Extract all entities from plan content.
 * Combines results from all extractors and deduplicates by type+value.
 */
export function extractEntities(content: string): Entity[] {
  const all = [
    ...extractFilePaths(content),
    ...extractModels(content),
    ...extractRoutes(content),
    ...extractScripts(content),
  ];

  // Deduplicate by type+value
  const seen = new Set<string>();
  const unique: Entity[] = [];

  for (const entity of all) {
    const key = `${entity.type}:${entity.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entity);
    }
  }

  return unique;
}

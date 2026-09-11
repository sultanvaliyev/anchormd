/** Portable plan IDs and filesystem boundaries, shared by storage, links and search. */
import path from 'node:path';
import { lstatSync, readdirSync } from 'node:fs';

export function normalizePlanId(input: string): string {
  const id = input.replace(/\\/g, '/');
  if (!id || path.posix.isAbsolute(id) || /^[a-z]:/i.test(id) ||
      /[\x00-\x1f#]/.test(id) || id.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid plan ID "${input}": use a relative path without .md, absolute paths, dot segments, or #sections.`);
  }
  return id;
}

/** Reject symlinks, including dangling ones, rather than following aliases. */
export function assertNotSymlink(filePath: string): void {
  const stat = lstatSync(filePath, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    throw new Error(`Unsafe plan path "${filePath}": symbolic links are not supported. Use a regular file inside the plans directory.`);
  }
}

export function resolvePlanPath(plansDir: string, input: string): { id: string; filename: string; filePath: string } {
  const id = normalizePlanId(input);
  const filename = id + '.md';
  const root = path.resolve(plansDir);
  const filePath = path.resolve(root, ...filename.split('/'));
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Plan path "${input}" escapes plans directory "${root}".`);
  }
  assertNotSymlink(root);
  let current = root;
  for (const part of filename.split('/')) {
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      const collision = readdirSync(current).find(entry => entry !== part && entry.toLowerCase() === part.toLowerCase());
      if (collision) {
        throw new Error(`Case collision: "${path.join(current, collision)}" conflicts with "${filePath}". Use the existing spelling or rename the plan.`);
      }
    }
    current = path.join(current, part);
    assertNotSymlink(current);
  }
  return { id, filename, filePath };
}

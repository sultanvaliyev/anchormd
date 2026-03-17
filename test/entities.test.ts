import { describe, it, expect } from 'bun:test';
import { extractEntities } from '../src/entities.js';

describe('extractEntities', () => {
  it('returns empty array for empty string', () => {
    expect(extractEntities('')).toEqual([]);
  });

  describe('file paths', () => {
    it('finds file paths with slashes and extensions', () => {
      const entities = extractEntities('The main file is src/index.ts and also lib/utils/helper.js');
      const files = entities.filter(e => e.type === 'file');
      expect(files).toContainEqual({ type: 'file', value: 'src/index.ts' });
      expect(files).toContainEqual({ type: 'file', value: 'lib/utils/helper.js' });
    });

    it('does not match plain words without slash and extension', () => {
      const entities = extractEntities('The word hello is not a file path');
      const files = entities.filter(e => e.type === 'file');
      expect(files).toHaveLength(0);
    });

    it('finds paths in quotes', () => {
      const entities = extractEntities('Import from "src/utils.ts"');
      const files = entities.filter(e => e.type === 'file');
      expect(files).toContainEqual({ type: 'file', value: 'src/utils.ts' });
    });
  });

  describe('models', () => {
    it('finds models after keywords', () => {
      const entities = extractEntities('The model User defines the schema');
      const models = entities.filter(e => e.type === 'model');
      expect(models).toContainEqual({ type: 'model', value: 'User' });
    });

    it('finds models before keywords', () => {
      const entities = extractEntities('The User model defines the schema');
      const models = entities.filter(e => e.type === 'model');
      expect(models).toContainEqual({ type: 'model', value: 'User' });
    });

    it('finds Schema keyword patterns', () => {
      const entities = extractEntities('Define Schema UserProfile here');
      const models = entities.filter(e => e.type === 'model');
      expect(models).toContainEqual({ type: 'model', value: 'UserProfile' });
    });
  });

  describe('routes', () => {
    it('finds HTTP routes', () => {
      const entities = extractEntities('Use GET /api/users to list and POST /api/users/:id to create');
      const routes = entities.filter(e => e.type === 'route');
      expect(routes).toContainEqual({ type: 'route', value: 'GET /api/users' });
      expect(routes).toContainEqual({ type: 'route', value: 'POST /api/users/:id' });
    });

    it('finds routes with path parameters', () => {
      const entities = extractEntities('DELETE /api/items/{id}');
      const routes = entities.filter(e => e.type === 'route');
      expect(routes).toContainEqual({ type: 'route', value: 'DELETE /api/items/{id}' });
    });
  });

  describe('scripts', () => {
    it('finds shell scripts', () => {
      const entities = extractEntities('Run deploy.sh to deploy');
      const scripts = entities.filter(e => e.type === 'script');
      expect(scripts).toContainEqual({ type: 'script', value: 'deploy.sh' });
    });

    it('finds npm run commands', () => {
      const entities = extractEntities('Execute npm run build and npm run test');
      const scripts = entities.filter(e => e.type === 'script');
      expect(scripts).toContainEqual({ type: 'script', value: 'npm run build' });
      expect(scripts).toContainEqual({ type: 'script', value: 'npm run test' });
    });
  });

  describe('deduplication', () => {
    it('deduplicates entities with same type and value', () => {
      const entities = extractEntities('Use src/index.ts and then src/index.ts again');
      const files = entities.filter(e => e.type === 'file');
      expect(files).toHaveLength(1);
    });

    it('combines all entity types', () => {
      const content = `
        File: src/index.ts
        model User
        GET /api/users
        Run deploy.sh
      `;
      const entities = extractEntities(content);
      const types = new Set(entities.map(e => e.type));
      expect(types.has('file')).toBe(true);
      expect(types.has('model')).toBe(true);
      expect(types.has('route')).toBe(true);
      expect(types.has('script')).toBe(true);
    });
  });
});

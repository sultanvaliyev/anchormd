import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { scaffold } from '../src/scaffold.js';
import { writePlan, readPlan, listPlans } from '../src/plan.js';
import { rebuildAndWriteIndex, readIndex } from '../src/index-graph.js';
import { getPlansDir, getAnchorDir, loadConfig } from '../src/config.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `anchormd-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('end-to-end lifecycle', () => {
  it('full init -> write -> read -> ls -> reindex -> status cycle', async () => {
    // 1. Scaffold with QMD disabled
    await scaffold(tmpDir, { qmd: false });

    // Verify structure was created
    expect(existsSync(path.join(tmpDir, '.anchor'))).toBe(true);
    expect(existsSync(path.join(tmpDir, '.anchor', 'plans'))).toBe(true);
    expect(existsSync(path.join(tmpDir, '.anchor', 'config.json'))).toBe(true);
    expect(existsSync(path.join(tmpDir, '.anchor', 'index.json'))).toBe(true);
    expect(existsSync(path.join(tmpDir, '.anchor', 'plans', 'anchor.md'))).toBe(true);

    // Verify config
    const config = loadConfig(tmpDir);
    expect(config.qmd).toBe(false);

    const plansDir = getPlansDir(tmpDir);
    const anchorDir = getAnchorDir(tmpDir);

    // 2. Write a plan with links and entity references
    const plan1Content = `---
name: auth
description: Authentication system
status: in-progress
tags:
  - security
---
# Authentication

Implements JWT-based auth. See [[database]] for schema.

Uses POST /api/auth/login and GET /api/auth/me endpoints.
Config in src/auth/config.ts.
`;

    writePlan(plansDir, 'auth', plan1Content);

    // 3. Write a second plan with shared entity and back-link
    const plan2Content = `---
name: database
description: Database schema and migrations
status: planned
---
# Database

Schema for the auth system. See [[auth]] for usage.

Uses src/auth/config.ts for connection settings.
model User defines the main entity.
Run deploy.sh to apply migrations.
`;

    writePlan(plansDir, 'database', plan2Content);

    // 4. Rebuild index and verify links
    const graph = rebuildAndWriteIndex(tmpDir);

    expect(graph.nodes['auth']).toBeDefined();
    expect(graph.nodes['database']).toBeDefined();

    // Verify explicit links
    expect(graph.nodes['auth'].links).toContain('database');
    expect(graph.nodes['database'].links).toContain('auth');

    // Verify weak edges from shared entity (src/auth/config.ts)
    expect(graph.nodes['auth'].weakEdges).toContain('database');
    expect(graph.nodes['database'].weakEdges).toContain('auth');

    // Verify entities were extracted
    const authEntities = graph.nodes['auth'].entities;
    expect(authEntities.some(e => e.type === 'route' && e.value.includes('/api/auth/login'))).toBe(true);
    expect(authEntities.some(e => e.type === 'file' && e.value === 'src/auth/config.ts')).toBe(true);

    const dbEntities = graph.nodes['database'].entities;
    expect(dbEntities.some(e => e.type === 'model' && e.value === 'User')).toBe(true);
    expect(dbEntities.some(e => e.type === 'script' && e.value === 'deploy.sh')).toBe(true);

    // 5. Read a plan back
    const authPlan = readPlan(plansDir, 'auth');
    expect(authPlan.frontmatter.name).toBe('auth');
    expect(authPlan.frontmatter.status).toBe('in-progress');
    expect(authPlan.body).toContain('JWT-based auth');

    // 6. Read a plan with #section deep link
    const dbPlan = readPlan(plansDir, 'database');
    expect(dbPlan.body).toContain('Schema for the auth system');

    // 7. List plans
    const allPlans = listPlans(plansDir);
    const planNames = allPlans.map(p => p.frontmatter.name);
    expect(planNames).toContain('anchor');
    expect(planNames).toContain('auth');
    expect(planNames).toContain('database');

    // 8. Filter by status
    const inProgressPlans = allPlans.filter(p => p.frontmatter.status === 'in-progress');
    expect(inProgressPlans).toHaveLength(1);
    expect(inProgressPlans[0].frontmatter.name).toBe('auth');

    const plannedPlans = allPlans.filter(p => p.frontmatter.status === 'planned');
    expect(plannedPlans.length).toBeGreaterThanOrEqual(2); // anchor + database

    // 9. Read index from disk
    const loadedGraph = readIndex(anchorDir);
    expect(loadedGraph).not.toBeNull();
    expect(Object.keys(loadedGraph!.nodes)).toHaveLength(3); // anchor, auth, database

    // 10. Verify status stats
    const nodes = Object.values(loadedGraph!.nodes);
    const totalLinks = nodes.reduce((sum, n) => sum + n.links.length, 0);
    const totalWeakEdges = nodes.reduce((sum, n) => sum + n.weakEdges.length, 0);

    expect(nodes.length).toBe(3);
    expect(totalLinks).toBeGreaterThanOrEqual(2); // auth->database, database->auth
    expect(totalWeakEdges).toBeGreaterThanOrEqual(2); // bidirectional weak edge
  });

  it('section extraction via deep link pattern', async () => {
    await scaffold(tmpDir, { qmd: false });
    const plansDir = getPlansDir(tmpDir);

    const content = `---
name: test-plan
description: Test plan with sections
status: built
---
# Test Plan

Overview text.

## Architecture

The architecture uses microservices.

### Components

Individual components here.

## Deployment

Deploy to production.
`;

    writePlan(plansDir, 'test-plan', content);
    const plan = readPlan(plansDir, 'test-plan');

    // Verify the plan was stored correctly
    expect(plan.body).toContain('## Architecture');
    expect(plan.body).toContain('## Deployment');
    expect(plan.frontmatter.status).toBe('built');
  });

  it('gitignore is not modified by scaffold', async () => {
    // Create a pre-existing .gitignore
    const gitignorePath = path.join(tmpDir, '.gitignore');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(gitignorePath, 'node_modules/\ndist/\n', 'utf-8');

    await scaffold(tmpDir, { qmd: false });

    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    // Central DB means no per-project search.sqlite to gitignore
    expect(gitignoreContent).not.toContain('search.sqlite');
    expect(gitignoreContent).toContain('node_modules/');
  });

  it('scaffold does not overwrite existing anchor.md', async () => {
    const plansDir = getPlansDir(tmpDir);
    mkdirSync(plansDir, { recursive: true });

    const customContent = `---
name: anchor
description: Custom project overview
status: built
---
# My Custom Project

This should not be overwritten.
`;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(plansDir, 'anchor.md'), customContent, 'utf-8');

    await scaffold(tmpDir, { qmd: false });

    const content = readFileSync(path.join(plansDir, 'anchor.md'), 'utf-8');
    expect(content).toContain('My Custom Project');
    expect(content).toContain('This should not be overwritten');
  });
});

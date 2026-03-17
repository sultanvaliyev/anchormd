import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildIndex, writeIndex, readIndex } from '../src/index-graph.js';

let tmpDir: string;
let plansDir: string;

function writePlanFile(name: string, content: string) {
  writeFileSync(path.join(plansDir, `${name}.md`), content, 'utf-8');
}

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `anchormd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  plansDir = path.join(tmpDir, '.anchor', 'plans');
  mkdirSync(plansDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildIndex', () => {
  it('builds correct links from [[references]]', () => {
    writePlanFile('plan-a', `---
name: plan-a
description: Plan A
status: planned
---
# Plan A

See [[plan-b]] for details.`);

    writePlanFile('plan-b', `---
name: plan-b
description: Plan B
status: planned
---
# Plan B

See [[plan-a]] for more context.`);

    const graph = buildIndex(plansDir);

    expect(graph.nodes['plan-a'].links).toContain('plan-b');
    expect(graph.nodes['plan-b'].links).toContain('plan-a');
  });

  it('computes weak edges from shared entities', () => {
    writePlanFile('api', `---
name: api
description: API plan
status: planned
---
# API

Uses src/index.ts as the entry point.`);

    writePlanFile('frontend', `---
name: frontend
description: Frontend plan
status: planned
---
# Frontend

Also references src/index.ts for types.`);

    const graph = buildIndex(plansDir);

    expect(graph.nodes['api'].weakEdges).toContain('frontend');
    expect(graph.nodes['frontend'].weakEdges).toContain('api');
  });

  it('produces empty arrays for plans with no links or entities', () => {
    writePlanFile('empty', `---
name: empty
description: Empty plan
status: planned
---
# Empty

Nothing much here.`);

    const graph = buildIndex(plansDir);

    expect(graph.nodes['empty'].links).toEqual([]);
    expect(graph.nodes['empty'].entities).toEqual([]);
    expect(graph.nodes['empty'].weakEdges).toEqual([]);
  });

  it('deduplicates weak edges', () => {
    // Two plans sharing multiple entities should only have one weak edge each
    writePlanFile('plan-x', `---
name: plan-x
description: Plan X
status: planned
---
# Plan X

Uses src/index.ts and src/utils.ts`);

    writePlanFile('plan-y', `---
name: plan-y
description: Plan Y
status: planned
---
# Plan Y

Also uses src/index.ts and src/utils.ts`);

    const graph = buildIndex(plansDir);

    // Should only appear once in weak edges
    const xWeakEdges = graph.nodes['plan-x'].weakEdges.filter(e => e === 'plan-y');
    expect(xWeakEdges).toHaveLength(1);

    const yWeakEdges = graph.nodes['plan-y'].weakEdges.filter(e => e === 'plan-x');
    expect(yWeakEdges).toHaveLength(1);
  });

  it('weak edges are bidirectional', () => {
    writePlanFile('alpha', `---
name: alpha
description: Alpha
status: planned
---
Uses GET /api/users endpoint.`);

    writePlanFile('beta', `---
name: beta
description: Beta
status: planned
---
Also uses GET /api/users endpoint.`);

    const graph = buildIndex(plansDir);

    expect(graph.nodes['alpha'].weakEdges).toContain('beta');
    expect(graph.nodes['beta'].weakEdges).toContain('alpha');
  });
});

describe('writeIndex / readIndex roundtrip', () => {
  it('produces identical graph after write then read', () => {
    writePlanFile('test', `---
name: test
description: Test
status: built
---
# Test

See [[other]]. Uses src/main.ts.`);

    const graph = buildIndex(plansDir);
    const anchorDir = path.join(tmpDir, '.anchor');

    writeIndex(anchorDir, graph);
    const loaded = readIndex(anchorDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.nodes).toEqual(graph.nodes);
    expect(loaded!.lastBuilt).toBe(graph.lastBuilt);
  });

  it('returns null when index.json does not exist', () => {
    const anchorDir = path.join(tmpDir, '.anchor-nonexistent');
    mkdirSync(anchorDir, { recursive: true });
    expect(readIndex(anchorDir)).toBeNull();
  });
});

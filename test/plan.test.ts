import { describe, it, expect } from 'bun:test';
import { parseFrontmatter, serializePlan } from '../src/plan.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with all required fields', () => {
    const raw = `---
name: auth
description: Authentication system design
status: planned
---
# Auth Plan

Details here.`;

    const result = parseFrontmatter(raw);
    expect(result.frontmatter.name).toBe('auth');
    expect(result.frontmatter.description).toBe('Authentication system design');
    expect(result.frontmatter.status).toBe('planned');
  });

  it('preserves body content exactly', () => {
    const body = `# Auth Plan

Details here.

## Section Two

More details.`;

    const raw = `---
name: auth
description: Auth design
status: built
---
${body}`;

    const result = parseFrontmatter(raw);
    expect(result.body).toBe(body);
  });

  it('throws on missing name field', () => {
    const raw = `---
description: Something
status: planned
---
Body`;

    expect(() => parseFrontmatter(raw)).toThrow('name');
  });

  it('throws on invalid status value', () => {
    const raw = `---
name: test
description: Test
status: invalid-status
---
Body`;

    expect(() => parseFrontmatter(raw)).toThrow('Invalid status');
  });

  it('handles optional tags field', () => {
    const raw = `---
name: auth
description: Auth design
status: planned
tags:
  - security
  - backend
---
Body`;

    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual(['security', 'backend']);
  });

  it('throws when missing opening delimiter', () => {
    const raw = `name: auth
description: Auth
status: planned
---
Body`;

    expect(() => parseFrontmatter(raw)).toThrow('must start with ---');
  });

  it('throws when missing closing delimiter', () => {
    const raw = `---
name: auth
description: Auth
status: planned
Body`;

    expect(() => parseFrontmatter(raw)).toThrow('missing closing ---');
  });

  it('throws on missing description field', () => {
    const raw = `---
name: test
status: planned
---
Body`;

    expect(() => parseFrontmatter(raw)).toThrow('description');
  });
});

describe('serializePlan', () => {
  it('roundtrips through parse and serialize', () => {
    const original = `---
name: auth
description: Authentication system
status: built
---
# Auth Plan

Details here.`;

    const { frontmatter, body } = parseFrontmatter(original);
    const serialized = serializePlan(frontmatter, body);
    const reparsed = parseFrontmatter(serialized);

    expect(reparsed.frontmatter.name).toBe('auth');
    expect(reparsed.frontmatter.description).toBe('Authentication system');
    expect(reparsed.frontmatter.status).toBe('built');
    expect(reparsed.body).toContain('# Auth Plan');
    expect(reparsed.body).toContain('Details here.');
  });

  it('preserves markdown headings and code blocks in body', () => {
    const frontmatter = {
      name: 'test',
      description: 'Test plan',
      status: 'planned' as const,
    };

    const body = `# Heading

\`\`\`typescript
const x = 1;
\`\`\`

## Sub heading

- List item`;

    const serialized = serializePlan(frontmatter, body);
    const reparsed = parseFrontmatter(serialized);

    expect(reparsed.body).toContain('# Heading');
    expect(reparsed.body).toContain('```typescript');
    expect(reparsed.body).toContain('const x = 1;');
    expect(reparsed.body).toContain('## Sub heading');
    expect(reparsed.body).toContain('- List item');
  });
});

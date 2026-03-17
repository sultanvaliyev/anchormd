import { describe, it, expect } from 'bun:test';
import { parseLinks, getStrongLinks, getDeepLinks, isDeepLink } from '../src/links.js';

describe('parseLinks', () => {
  it('returns empty array for empty string', () => {
    expect(parseLinks('')).toEqual([]);
  });

  it('parses a single strong link', () => {
    const links = parseLinks('See [[auth]] for details');
    expect(links).toEqual([{ target: 'auth' }]);
  });

  it('parses a single deep link', () => {
    const links = parseLinks('See [[auth#login-flow]] for details');
    expect(links).toEqual([{ target: 'auth', section: 'login-flow' }]);
  });

  it('parses multiple links in the same string', () => {
    const links = parseLinks('See [[auth]] and [[database]] and [[auth#login-flow]]');
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({ target: 'auth' });
    expect(links[1]).toEqual({ target: 'database' });
    expect(links[2]).toEqual({ target: 'auth', section: 'login-flow' });
  });

  it('deduplicates identical links', () => {
    const links = parseLinks('See [[auth]] and then [[auth]] again');
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ target: 'auth' });
  });

  it('handles multi-hash deep links', () => {
    const links = parseLinks('See [[plan#section#subsection]]');
    expect(links).toEqual([{ target: 'plan', section: 'section#subsection' }]);
  });

  it('returns empty array for text with no brackets', () => {
    const links = parseLinks('This is plain text without any links');
    expect(links).toEqual([]);
  });

  it('returns empty array for malformed [[ without closing ]]', () => {
    const links = parseLinks('This has [[unclosed bracket');
    expect(links).toEqual([]);
  });

  it('does not deduplicate a strong link and deep link to the same target', () => {
    const links = parseLinks('See [[auth]] and [[auth#login]]');
    expect(links).toHaveLength(2);
  });
});

describe('getStrongLinks', () => {
  it('filters to only strong links', () => {
    const links = parseLinks('See [[auth]] and [[db#schema]]');
    const strong = getStrongLinks(links);
    expect(strong).toHaveLength(1);
    expect(strong[0]).toEqual({ target: 'auth' });
  });
});

describe('getDeepLinks', () => {
  it('filters to only deep links', () => {
    const links = parseLinks('See [[auth]] and [[db#schema]]');
    const deep = getDeepLinks(links);
    expect(deep).toHaveLength(1);
    expect(deep[0]).toEqual({ target: 'db', section: 'schema' });
  });
});

describe('isDeepLink', () => {
  it('returns true for deep links', () => {
    const links = parseLinks('[[a#b]]');
    expect(isDeepLink(links[0])).toBe(true);
  });

  it('returns false for strong links', () => {
    const links = parseLinks('[[a]]');
    expect(isDeepLink(links[0])).toBe(false);
  });
});

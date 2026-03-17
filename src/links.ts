/**
 * Link parser for [[wiki-style]] links in plan content
 *
 * Supports:
 * - Strong links: [[target]]
 * - Deep links: [[target#section]]
 * - Multi-hash deep links: [[target#section#subsection]]
 */

import type { Link, StrongLink, DeepLink } from './types.js';

const LINK_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Type guard: returns true if the link has a section (is a DeepLink)
 */
export function isDeepLink(link: Link): link is DeepLink {
  return 'section' in link;
}

/**
 * Parse all [[wiki-style]] links from content.
 * Returns deduplicated array of StrongLink and DeepLink objects.
 */
export function parseLinks(content: string): Link[] {
  const seen = new Set<string>();
  const links: Link[] = [];

  let match: RegExpExecArray | null;
  // Reset regex state
  LINK_REGEX.lastIndex = 0;

  while ((match = LINK_REGEX.exec(content)) !== null) {
    const raw = match[1];
    const hashIndex = raw.indexOf('#');

    let link: Link;
    let key: string;

    if (hashIndex !== -1) {
      const target = raw.substring(0, hashIndex);
      const section = raw.substring(hashIndex + 1);
      link = { target, section };
      key = `${target}#${section}`;
    } else {
      link = { target: raw };
      key = raw;
    }

    if (!seen.has(key)) {
      seen.add(key);
      links.push(link);
    }
  }

  return links;
}

/**
 * Filter links to only strong links (no section)
 */
export function getStrongLinks(links: Link[]): StrongLink[] {
  return links.filter((link): link is StrongLink => !isDeepLink(link));
}

/**
 * Filter links to only deep links (with section)
 */
export function getDeepLinks(links: Link[]): DeepLink[] {
  return links.filter(isDeepLink);
}

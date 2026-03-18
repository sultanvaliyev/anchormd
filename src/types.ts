/**
 * Shared types for AnchorMD
 */

/** Valid plan status values */
export type PlanStatus = 'planned' | 'in-progress' | 'built' | 'deprecated';

/** All valid status values for runtime validation */
export const VALID_STATUSES: PlanStatus[] = ['planned', 'in-progress', 'built', 'deprecated'];

/** Frontmatter metadata for a plan file */
export interface PlanFrontmatter {
  name: string;
  description: string;
  status: PlanStatus;
  tags?: string[];
}

/** A parsed plan file */
export interface PlanFile {
  frontmatter: PlanFrontmatter;
  body: string;
  filename: string;
}

/** A strong link: [[target]] */
export interface StrongLink {
  target: string;
}

/** A deep link: [[target#section]] */
export interface DeepLink {
  target: string;
  section: string;
}

/** A link is either a strong link or a deep link */
export type Link = StrongLink | DeepLink;

/** Entity types extractable from plan content */
export type EntityType = 'file' | 'model' | 'route' | 'script';

/** An extracted entity reference */
export interface Entity {
  type: EntityType;
  value: string;
}

/** A node in the index graph */
export interface IndexGraphNode {
  name: string;
  links: string[];
  entities: Entity[];
  weakEdges: string[];
}

/** The full index graph */
export interface IndexGraph {
  nodes: Record<string, IndexGraphNode>;
  lastBuilt: string;
}

/** Project configuration stored in .anchor/config.json */
export interface AnchorConfig {
  qmd: boolean;
  collectionName?: string;
}

/** Search result from QMD or fallback */
export interface SearchResult {
  path: string;
  score: number;
  content?: string;
}

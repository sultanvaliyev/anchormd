---
name: architecture/plans-and-graph
description: Plan storage, canonical identity, relationships, and graph views
status: built
---
# Plans and relationship graph

## Identity and storage

`src/plan-path.ts` normalizes input separators to `/`. The canonical ID is a path relative to `.anchor/plans/` without its final `.md`: `auth/user-management.md` has ID `auth/user-management`. Frontmatter `name` must exactly equal that ID. Paths and links are rooted at the plans directory; links are never relative to their containing plan.

`src/plan.ts` parses required `name`, `description`, and `status` fields and optional tags. Status values are `planned`, `in-progress`, `built`, and `deprecated`. `PlanFile.id` carries identity and `filename` carries the relative Markdown filename. Discovery recursively visits regular `.md` files, sorts relative paths, and skips symlinks and Markdown that does not parse as a plan.

Identity validation reports duplicate IDs, duplicate metadata names, case collisions (including folder spelling), and path/name mismatches with affected files. Writes validate the prospective collection before creating parent folders or saving content. A corrected write can repair the target file's metadata. Read/write paths reject absolute paths, dot segments, section fragments as filenames, and symbolic links.

## Relationships

`src/links.ts` parses wiki links and preserves section fragments. `src/index-graph.ts` records each distinct explicit target as an edge, including targets of section links. Missing target IDs remain recorded references, but visual graph edges only connect existing nodes.

`src/entities.ts` extracts file paths, keyword-associated models, HTTP routes, and scripts with regular expressions. Plans mentioning the same entity share bidirectional weak edges. A weak edge is counted on each participating node; status reports this directed total.

Graph nodes are keyed by canonical ID in a dictionary without an object prototype. Same basenames in different folders remain distinct. `.anchor/index.json` is generated: CLI `write`, `reindex`, `status`, and `graph` refresh it from all plans. Direct Markdown edits require `reindex` to refresh QMD too.

## Views

`src/format.ts` renders canonical IDs in context and list tables. `src/graph.ts` renders terminal, Mermaid, DOT, and interactive HTML views. Mermaid uses generated identifiers with canonical paths as labels. The interactive D3 graph uses canonical string IDs and reads nested metadata for descriptions/status. The CLI owns browser launch; the HTML loads D3 from its existing CDN URL.

## Verification

The original suite covers parsing and the flat plan lifecycle. The feature-specific test additions were removed at the user's request; do not add test files unless explicitly requested. Use the existing suite and isolated manual checks for further verification. See [[development/nested-plans]] for the feature contract and [[architecture/search]] for deep links returned by search.

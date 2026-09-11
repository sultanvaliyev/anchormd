---
name: anchor
description: AnchorMD package overview and map of its own project context
status: built
---
# AnchorMD

AnchorMD is a Bun and TypeScript CLI for persistent project context in linked Markdown plans. YAML frontmatter supplies summaries and status; explicit wiki links and shared code references form a relationship graph. Optional QMD search adds lexical, semantic, and hybrid retrieval.

## Context map

- [[architecture/plans-and-graph]] covers plan identity, storage, links, entities, and graph rendering.
- [[architecture/search]] covers the central QMD database, collections, and deep-link mapping.
- [[development/workflow]] covers source commands, tests, documentation upkeep, and release boundaries.
- [[development/nested-plans]] records the nested-folder feature and its validation.
- [[development/roadmap]] separates completed work from future candidates.

## Source map

`bin/anchormd` launches `src/cli.ts` through Bun. Commander wires commands; `src/config.ts` discovers the project root and loads config; `src/scaffold.ts` initializes projects. `src/plan.ts` owns plan I/O and `src/plan-path.ts` owns path rules. `src/links.ts` and `src/entities.ts` feed `src/index-graph.ts`; `src/graph.ts` renders relationships. `src/qmd.ts` owns optional search, and `src/format.ts` formats terminal output.

## Using AnchorMD on itself

Run `bun run src/cli.ts context` from the repo root. This calls the checkout under development. The reusable `skill/SKILL.md` stays generic; `AGENTS.md` supplies repository-specific commands and constraints. This is an ordinary AnchorMD project with tracked plans and config, plus an ignored generated index.

QMD is disabled in this repository's checked-in config, so context, reads, listing, and relationships work without touching the user's central database. Use `rg` and linked plans when search is unavailable. Keep project context in this Git-tracked plan tree and remove superseded planning documents.

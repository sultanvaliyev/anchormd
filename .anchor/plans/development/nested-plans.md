---
name: development/nested-plans
description: Canonical nested plan IDs across storage, CLI, relationships, and search
status: built
---
# Nested Plans Implementation Plan

## Goal

Support folders beneath `.anchor/plans/` consistently, while preserving matching flat plans without migration. This repository will exercise the feature with its own context documents. See [[anchor]] and [[architecture/plans-and-graph]].

## Contract

The canonical ID is the slash-normalized relative filename without `.md`. Frontmatter `name` must equal it. Wiki targets are rooted at the plans directory, including section links. Reject absolute paths, traversal, and symlink access; recursively discover regular Markdown files in sorted relative-path order. Report duplicate IDs, duplicate names, case collisions, and mismatches with affected filenames before building a graph or writing conflicting content.

## Implementation

- [x] Add `src/plan-path.ts` for portable ID normalization and contained path resolution. Extend `PlanFile` with `id` and retain relative `filename`. Implement discovery and identity validation in `src/plan.ts`.
- [x] Verify flat and nested discovery/read/write, ordering, identity conflicts, and path/symlink rejection during implementation. Remove the feature-specific test files afterward, as requested by the user.
- [x] Key `src/index-graph.ts` by canonical IDs, including section-link targets and shared entities. Keep graph storage safe for object-property names.
- [x] Update `src/cli.ts` to normalize writes before editor/file input, use isolated editor temporary directories, and rebuild current graph data for status and graph commands. Extract graph rendering into `src/graph.ts` for direct verification and use generated Mermaid identifiers.
- [x] Normalize QMD collection-prefixed display paths in `src/qmd.ts` without removing nested folders. Test lexical, semantic, and hybrid results with a fake store; pass deep links to the real CLI reader.
- [x] Exercise actual CLI subprocesses for context, list/JSON/filter, reads/sections, writes/stdin/file, status, reindex, and graph outputs with QMD disabled.
- [x] Update README and distributed `skill/SKILL.md`; add Git-tracked self-context and agent entry instructions, remove superseded planning documents, and ignore the generated relationship index.
- [x] Run `bun test`, `bun run typecheck`, and `bun run build`. Reindex and read this repository's own plans through the source CLI. Release preparation follows [[development/workflow#releases]] after explicit authorization.

## Validation boundaries

Implementation checks used temporary projects with QMD disabled and fake search stores. The added test files and additions to the original link tests have since been removed at the user's request; retain the original suite and do not add new test files unless explicitly requested. This repository's context config also disables QMD. Existing flat plans whose names match their filenames need no migration; previously inconsistent names require correction and manually edited plans require reindexing.


## Completed behavior

All plan-facing commands share canonical nested IDs. Read/write helpers enforce boundaries and metadata agreement, discovery preserves normalized relative filenames, and section links contribute graph edges. Status and graph commands rebuild the local relationship index so an older index cannot hide nested plans. Mermaid uses generated identifiers; the interactive viewer keeps canonical IDs as labels and node data.

QMD retains its recursive collection pattern. Search strips the configured collection prefix, normalizes separators, and uses valid document frontmatter to recover canonical spelling that QMD may lowercase or slugify. Hybrid search retains its chunk preview while using the full document for identity and section matching. A legacy config without a collection name receives an actionable reindex message before a store is opened.

## Validation results

Validated on macOS with Bun 1.3.10 on 2026-09-11:

- `bun test`: 47 passing tests across the original 5 files, 0 failures. No feature-specific test files are retained.
- `bun run typecheck`: passed using the existing lockfile's TypeScript 5.9.3, now an explicit development dependency.
- `bun run build`: passed; bundled CLI help also ran successfully.
- `git diff --check`: passed.
- Source CLI context, listing/JSON, nested section read, reindex, and Mermaid output succeeded against this repository's six real context plans.
- Read-only subagent reviews identified and verified fixes for file-versus-folder case checks, ignored scratch Markdown, QMD filename normalization, and legacy search scope.

The removed implementation tests used fake QMD stores; no live central-database or embedding run was performed. Those checks covered interactive HTML data, Mermaid declarations/endpoints, Windows-style separators, and case collisions on macOS. This feature-specific coverage is no longer part of the retained suite. Native Windows/Linux execution was not performed during implementation. Release procedure: [[development/workflow#releases]].

## Changed files

- Storage and identity: `src/plan-path.ts`, `src/plan.ts`, `src/types.ts`.
- Links and views: `src/links.ts`, `src/index-graph.ts`, `src/graph.ts`, `src/format.ts`, `src/cli.ts`.
- Search: `src/qmd.ts`.
- Verification tooling: `package.json`, `bun.lock`. No test-file changes remain; the four added test files were deleted and `test/links.test.ts` was restored to its original content.
- Product docs: `README.md`, `skill/SKILL.md`.
- Repository context: `AGENTS.md`, `.gitignore`, `.anchor/config.json`, and the six linked plans under `.anchor/plans/`.

## Migration impact

Matching flat filenames, names, and links continue working without migration. Nested plans require the full relative path in frontmatter and wiki links. Previously mismatched or case-conflicting identities must be corrected. Section references now contribute to relationship counts, and status/graph refresh generated index data. Direct Markdown edits still require reindexing to refresh QMD. The repository's personal installed skill and central QMD configuration were not changed.

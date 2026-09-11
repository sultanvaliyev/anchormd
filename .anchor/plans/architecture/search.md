---
name: architecture/search
description: Current central QMD storage, collection scope, and canonical search deep links
status: built
---
# QMD search

## Storage and collections

`src/qmd.ts` dynamically loads `@tobilu/qmd`. Search uses one database at `~/.anchormd/anchormd.sqlite`. Each project registers `.anchor/plans/` as a collection using `**/*.md`. A slug of the project directory supplies the collection name; numeric suffixes resolve conflicts. Config stores the collection name, and registration updates its path if the project moves.

The central database migration is implemented. `reindex` derives and saves a missing collection name for legacy projects that previously used per-project `.anchor/search.sqlite` storage.

## Search and deep links

Lexical search calls `searchLex`, semantic search calls `searchVector`, and hybrid search calls `search`. The CLI passes the configured collection and result limit. QMD display paths contain a collection prefix; mapping removes that known prefix, normalizes separators, and preserves the complete nested plan path. Explicit `qmd://collection/path.md` results are also supported.

Every result gets a canonical plan deep link. A matching subsection adds its slug, such as `auth/user-management#roles`; otherwise the link targets the whole plan. QMD normalizes indexed filenames, so valid frontmatter supplies the original canonical spelling, including case and underscores. The CLI reader accepts that link directly. Section matching uses full document bodies when available, including hybrid results; the hybrid preview still shows the best chunk. Reported line ranges refer to the content supplied by QMD.

## Configuration and limits

`init` enables QMD unless `--no-qmd` is supplied. Missing or malformed project config defaults to disabled. With QMD disabled, storage and graph commands remain available and `find` reports that search is unavailable. With QMD enabled but no collection name, `find` requests `reindex` before opening a store, preventing unscoped legacy searches.

On macOS, the wrapper attempts to select Homebrew SQLite before loading QMD, allowing sqlite-vec extension loading. QMD loading failures can disable search; unavailable vector operations during indexing fall back to lexical support. Updates are collection scoped when a name is supplied; the current `embed()` call has no collection argument and is global.

## Development isolation

This repository keeps QMD disabled in `.anchor/config.json`. The feature-specific QMD tests were removed at the user's request. For manual search checks, supply fake stores rather than initializing the central database; use `--no-qmd` for temporary CLI projects. See [[development/workflow]] and [[architecture/plans-and-graph]].

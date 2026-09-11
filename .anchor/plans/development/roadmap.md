---
name: development/roadmap
description: Completed capabilities and future candidates for the AnchorMD package
status: planned
---
# Roadmap

## Completed foundations

The Bun CLI, YAML plans, context/read/write/list commands, explicit relationships, entity-derived weak edges, and graph viewers exist. Central QMD database registration and collection-scoped search are implemented. See [[architecture/plans-and-graph]] and [[architecture/search]] for current behavior.

Nested plan folders are tracked in [[development/nested-plans]]. That plan owns the implementation checklist and validation rather than duplicating tasks here.

## Future candidates

These are considerations, not approved implementation work:

- Cross-project search with an explicit scope and unambiguous project-aware result links.
- Collection-scoped embeddings if supported by the QMD integration.

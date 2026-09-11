---
name: development/workflow
description: Working on the package through its source CLI and isolated tests
status: built
---
# Development workflow

## Commands

Run from the repository root:

```sh
bun install --frozen-lockfile
bun run src/cli.ts context
bun run src/cli.ts read architecture/plans-and-graph
bun run src/cli.ts ls --status in-progress
bun test
bun run typecheck
bun run build
```

The runtime is Bun. `bin/anchormd` imports `src/cli.ts`, and the package ships `src/`, `bin/`, and `skill/`. `bun run build` bundles the CLI into `dist/` and externalizes QMD; `typecheck` runs TypeScript without emitting files. The tests use `bun:test`; the old Vitest config is not the active test runner.

## Context upkeep

Read [[anchor]] and the relevant architecture plan before changing behavior. Keep one authoritative current plan per topic; link to other plans rather than copying their contracts. Use [[development/roadmap]] for prospective work and focused feature plans such as [[development/nested-plans]] for implementation progress.

Update the affected Markdown after implementation, then run `bun run src/cli.ts reindex`. The source CLI also supports `write <id> --from <file>`. Track `.anchor/plans/`, `.anchor/config.json`, and `AGENTS.md`; leave the generated index ignored. Repository config disables QMD, so use `rg` over plans when looking for a topic.

## Validation and releases

Do not add or modify test files unless the user explicitly requests it. Run the existing suite as needed. Use temporary directories with QMD disabled for manual filesystem and CLI checks, and fake QMD stores for manual search checks. Never use personal projects, user configuration, or the central database as fixtures.

Run the full suite, type checking, and build before reporting completion. Build success does not publish anything. A package publish, release, tag, or release workflow requires an explicit request.

## Releases

The npm release workflow is `.github/workflows/publish.yml`. Pushing a `v*` tag runs the existing test suite, then publishes with provenance using the repository's `NPM_TOKEN` secret. Pushing a branch or changing the package version alone does not publish.

For an authorized release, update both `package.json` and the `VERSION` constant in `src/cli.ts` to the same unused version. Run the existing suite, type checking, build, and `npm pack --dry-run --json --ignore-scripts`. Commit the intended implementation files and version changes, push the commit, then push the matching tag. Check the workflow result and verify the registry version and `latest` tag afterward.

Nested plan support is the feature for version `0.5.0`, using Git tag `v0.5.0`. The package includes `src/`, `bin/`, and `skill/`; repository context remains in Git and is excluded from the npm package.

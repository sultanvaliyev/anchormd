# Working on AnchorMD

This is the AnchorMD package itself. Its reusable agent skill is `skill/SKILL.md`; its own project context is in `.anchor/plans/`.

Start from the repository root:

```sh
bun run src/cli.ts context
bun run src/cli.ts read development/workflow
bun run src/cli.ts ls --status in-progress
```

Use the source CLI here so work exercises this checkout instead of an installed release. The repo's QMD setting is disabled. Use `ls`, `read <id>#<section>`, and `rg` over `.anchor/plans/` to locate context; do not enable QMD just to follow a generic skill workflow.

Read the relevant linked architecture plan before changing code. Update the focused plan after changes, then run `bun run src/cli.ts reindex`. Keep project context in `.anchor/plans/` and the roadmap in `.anchor/plans/development/roadmap.md`. Track `.anchor/` in Git except for its generated index. Remove superseded planning documents instead of keeping archives or redirect files.

Do not add or modify test files unless the user explicitly requests it. Validate with the existing `bun test` suite, `bun run typecheck`, and `bun run build`. Any additional manual checks should use temporary projects with QMD disabled. Do not modify real user configuration or the central QMD database during testing. Do not publish a package or create a release unless explicitly requested.

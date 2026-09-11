---
name: anchormd
description: Persistent project context for AI coding agents using linked markdown plans
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# AnchorMD Skill

You have access to AnchorMD, a project context system that gives you persistent, queryable knowledge about the project you are working on. Use it to understand the project, find relevant plans, and update context as you work.

## Workflow

1. **At session start**: Run `anchormd context` to load the project overview and see all plans.
2. **Before starting a task**: Run `anchormd find "<topic>"` to find relevant plans. Results include deep links (e.g. `auth/user-management#roles`) — use them directly with `anchormd read`. When QMD is disabled, use `anchormd ls` and search the Markdown files instead.
3. **Read details**: Use `anchormd read <plan>` for full content, or `anchormd read <plan>#<section>` to jump to a specific section.
4. **After implementing**: Update plans with `anchormd write <plan-name>` to reflect what was built.
5. **Track progress**: Use `anchormd ls --status in-progress` to see active work items.

## Command Reference

| Command | Description |
|---------|-------------|
| `anchormd init` | Initialize AnchorMD in current project. Use `--no-qmd` to disable search. |
| `anchormd context` | Print project overview (anchor.md) and plan summary table. |
| `anchormd write <name>` | Write a plan. Reads from `--from <file>`, piped stdin, or opens `$EDITOR`. |
| `anchormd ls` | List all plans. Filter with `--status <status>`. Use `--json` for structured output. |
| `anchormd read <name>` | Read a plan. Supports `name#section` deep links. |
| `anchormd find <query>` | Search plans. Use `--semantic`, `--hybrid`, `--limit <n>`, `--json`. |
| `anchormd reindex` | Rebuild the index graph and search database. |
| `anchormd status` | Show plan count, link count, weak edges, and QMD status. |
| `anchormd graph` | Open the interactive graph. Use `--text`, `--mermaid`, or `--dot` for text output. |

## Nested Plans and Identity

Use folders to group related plans:

```text
.anchor/plans/
  anchor.md
  auth/
    user-management.md
    web-onboarding.md
    mobile-onboarding.md
  infrastructure/
    cloudflare.md
```

The canonical ID is the path relative to `.anchor/plans/` without `.md`. For `auth/user-management.md`, set frontmatter `name: auth/user-management`. Deeper folders work the same way. Always write IDs with `/` so plans are portable.

```sh
anchormd write auth/user-management
anchormd write auth/user-management --from plan.md
anchormd read auth/user-management
anchormd read 'auth/user-management#roles'
```

Writing creates missing parent directories. The file supplied to `--from` must have a matching frontmatter name. Wiki links such as `[[auth/user-management]]` and `[[auth/user-management#roles]]` are rooted at `.anchor/plans/`, even inside nested plans. Do not use `../` targets. Flat plans with matching names need no migration.

Absolute paths, traversal, and symlink reads/writes are rejected. Duplicate IDs or names, inconsistent casing, and path/name mismatches produce actionable errors; correct the affected files before rebuilding.

## Tips

- Use `--json` flag with `ls` and `find` for structured output you can parse programmatically.
- Plans link to each other with `[[plan-name]]` syntax. Use `[[plan#section]]` for deep links.
- The index graph tracks both explicit links and "weak edges" (plans that reference the same files, models, routes, or scripts).
- CLI writes rebuild the index. Status and graph commands also refresh relationships. After directly editing Markdown, run `anchormd reindex` to refresh relationships and search.
- Plan statuses: `planned`, `in-progress`, `built`, `deprecated`.

## Working on the AnchorMD Package

Follow the repository's `AGENTS.md`. In the AnchorMD source checkout, use `bun run src/cli.ts <command>` to exercise the code being developed. Keep its project-specific context in `.anchor/plans/`; this skill remains the reusable workflow for other projects. Do not enable QMD when repository instructions intentionally disable it.

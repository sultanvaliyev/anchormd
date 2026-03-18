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
2. **Before starting a task**: Run `anchormd find "<topic>"` to find relevant plans. Results include deep links (e.g. `plan#section`) — use them directly with `anchormd read`.
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

## Tips

- Use `--json` flag with `ls` and `find` for structured output you can parse programmatically.
- Plans link to each other with `[[plan-name]]` syntax. Use `[[plan#section]]` for deep links.
- The index graph tracks both explicit links and "weak edges" (plans that reference the same files, models, routes, or scripts).
- After writing or modifying plans, the index is automatically rebuilt. Run `anchormd reindex` manually if needed.
- Plan statuses: `planned`, `in-progress`, `built`, `deprecated`.

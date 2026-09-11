# AnchorMD

Persistent project context for AI coding agents using linked markdown plans with relationship tracking and hybrid search.

## Prerequisites

AnchorMD requires [Bun](https://bun.sh) runtime.

```bash
curl -fsSL https://bun.sh/install | bash
```

**macOS**: For full search support (semantic + hybrid), install Homebrew SQLite:

```bash
brew install sqlite
```

This is needed because macOS ships with Apple's SQLite which doesn't support extension loading. Lexical search (BM25) works without it.

## Install

```bash
bun add -g anchormd
```

## Quick Start

```bash
# Initialize in your project
anchormd init

# Edit the project overview
anchormd write anchor

# Create a plan
echo '---
name: auth
description: Authentication system
status: planned
---
# Authentication

JWT-based auth. See [[database]] for schema.
Uses POST /api/auth/login endpoint.
Config in src/auth/config.ts.
' | anchormd write auth

# View project context
anchormd context

# List all plans
anchormd ls

# Read a specific plan
anchormd read auth

# Read a specific section
anchormd read auth#authentication

# View project stats
anchormd status
```

## Commands

| Command | Description |
|---------|-------------|
| `anchormd init [--no-qmd]` | Initialize AnchorMD in the current project |
| `anchormd context` | Print project overview and plan summary table |
| `anchormd write <name> [--from <file>]` | Write or update a plan (reads from file, stdin, or editor) |
| `anchormd ls [--status <s>] [--json]` | List all plans, optionally filtered by status |
| `anchormd read <name[#section]>` | Read a plan or a specific section via deep link |
| `anchormd find <query> [--semantic] [--hybrid] [--limit <n>] [--json]` | Search plans with deep links to matching sections |
| `anchormd reindex` | Rebuild the index graph and search database |
| `anchormd status` | Show plan count, links, weak edges, and QMD status |
| `anchormd graph [--text\|--mermaid\|--dot]` | Open the interactive graph, or print a terminal, Mermaid, or DOT view |

## How It Works

### Plans

Plans are markdown files with YAML frontmatter stored in `.anchor/plans/`. Each plan has:

- **name**: must exactly match the canonical plan ID: its path relative to `.anchor/plans/`, without `.md`
- **description**: short summary
- **status**: one of `planned`, `in-progress`, `built`, `deprecated`
- **tags**: optional array of tags

Folders are supported at any depth. For example, `.anchor/plans/auth/user-management.md` has ID `auth/user-management`, and `.anchor/plans/auth/web/onboarding.md` has ID `auth/web/onboarding`. IDs use forward slashes on all platforms; command input also accepts Windows separators. Same basenames in different folders are distinct plans.

```bash
# Parent folders are created automatically
anchormd write auth/user-management
anchormd write auth/user-management --from user-management.md
anchormd read auth/user-management
anchormd read 'auth/user-management#roles'
anchormd ls --json
anchormd graph --mermaid
```

The source file for `--from` should contain matching metadata:

```markdown
---
name: auth/user-management
description: User accounts and role assignment
status: planned
---
# User management

## Roles

Administrators assign roles. See [[auth/web-onboarding]].
```

Discovery recursively lists regular `.md` files in deterministic relative-path order. JSON listing includes `id` and relative `filename` alongside the existing metadata and body. Symbolic links are skipped during discovery and rejected on direct reads/writes. Absolute paths, `..` traversal, dot segments, and fragments in write IDs are rejected.

Duplicate IDs, duplicate frontmatter names, case collisions, and name/path mismatches produce errors identifying the affected files. Use consistent folder and filename casing across platforms. Existing flat plans with matching names continue working without migration. For an inconsistent plan, correct its `name` or move the file and update its links, then run `anchormd reindex`.

### Links

Plans reference each other using wiki-style links:

- **Strong links**: `[[plan-name]]` creates an explicit edge in the graph
- **Deep links**: `[[plan-name#section]]` links to a specific section

All plan links are rooted at `.anchor/plans/`, including links written inside nested plans. Use `[[auth/user-management]]` or `[[auth/user-management#roles]]`; do not use relative targets such as `[[../user-management]]`. Section links also create a relationship to their target plan.

### Entities

AnchorMD extracts entity references from plan content:

- **File paths**: `src/auth/config.ts`, `lib/utils.js`
- **Models**: `model User`, `UserSchema`
- **Routes**: `GET /api/users`, `POST /api/auth/login`
- **Scripts**: `deploy.sh`, `npm run build`

### Weak Edges

When two plans reference the same entity (e.g., both mention `src/auth/config.ts`), AnchorMD creates a **weak edge** between them. This surfaces implicit relationships that weren't explicitly linked.

### Index Graph

The index graph (`.anchor/index.json`) tracks all flat and nested plans, their links, entities, and weak edges using canonical IDs. CLI writes rebuild it automatically. `status` and `graph` also refresh it, so older indexes do not hide nested plans. Run `anchormd reindex` after direct Markdown edits to refresh both relationships and QMD search. Mermaid output uses generated node identifiers and displays the canonical plan paths as labels.

## Search

AnchorMD uses [QMD](https://github.com/tobilu/qmd) for search. Three modes are available:

- **Lexical** (default): BM25 keyword search — fast, no dependencies beyond SQLite
- **Semantic**: Vector similarity search — requires sqlite-vec (`brew install sqlite` on macOS)
- **Hybrid**: Combined lexical + semantic with LLM reranking

Search results include **deep links** to the most relevant section:

```bash
$ anchormd find "sentiment analysis"
  1. [0.823] myproject/analytics/analytics-prd.md
     → analytics/analytics-prd#sentiment-tab
```

Use the deep link directly: `anchormd read 'analytics/analytics-prd#sentiment-tab'`. Results without a matching section link to the whole plan. Search preserves canonical plan spelling from frontmatter even when QMD normalizes its indexed filenames. Legacy QMD configurations without a collection name must run `anchormd reindex` before searching.

## Configuration

Configuration is stored in `.anchor/config.json`:

```json
{
  "qmd": true,
  "collectionName": "my-project"
}
```

- **qmd**: Enable/disable QMD search integration (enabled by default)
- **collectionName**: Project's collection name in the central search database (auto-derived from directory name)

## Central Search Database

AnchorMD stores all search data in a single central database at `~/.anchormd/anchormd.sqlite`. Each project is registered as a named collection, enabling:

- No per-project SQLite files to gitignore
- Collection-scoped search (each project only sees its own plans)
- Future cross-project search capabilities

### Upgrading from v0.1.x

If you used an earlier version with per-project `.anchor/search.sqlite`:

```bash
bun add -g anchormd@latest
anchormd reindex  # auto-migrates to central DB
```

The old `.anchor/search.sqlite` can be safely deleted.

## Claude Code Integration

AnchorMD ships with a skill file at `skill/SKILL.md` for integration with Claude Code. The skill teaches Claude to:

1. Run `anchormd context` at session start
2. Search for relevant plans before starting tasks
3. Read plan details as needed
4. Update plans after implementing changes

## Project Structure

```
.anchor/
  config.json       # Project configuration
  index.json        # Relationship graph
  plans/
    anchor.md       # Project overview (created on init)
    auth/
      user-management.md
      web-onboarding.md
      mobile-onboarding.md
    infrastructure/
      cloudflare.md

~/.anchormd/
  anchormd.sqlite   # Central search database (shared across all projects)
```

## Developing AnchorMD with AnchorMD

This repository uses its own `.anchor/plans/` for current context. Start with [AGENTS.md](AGENTS.md) and the [project overview](.anchor/plans/anchor.md). The reusable `skill/SKILL.md` describes the general workflow; repository instructions select the source CLI:

```bash
bun install --frozen-lockfile
bun run src/cli.ts context
bun run src/cli.ts read architecture/plans-and-graph
bun run src/cli.ts read development/nested-plans
bun test
bun run typecheck
bun run build
```

Plans and project config are tracked; the generated `.anchor/index.json` is ignored. This repo's config disables QMD, so development context works without accessing the central database. Use `ls`, `read`, and `rg` to locate plans. Update the relevant plan after changes, then run `bun run src/cli.ts reindex`.

Current architecture, workflow, and feature progress live in the Git-tracked `.anchor/plans/` context tree.

## License

MIT

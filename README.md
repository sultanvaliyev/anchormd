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

## How It Works

### Plans

Plans are markdown files with YAML frontmatter stored in `.anchor/plans/`. Each plan has:

- **name**: identifier used in links
- **description**: short summary
- **status**: one of `planned`, `in-progress`, `built`, `deprecated`
- **tags**: optional array of tags

### Links

Plans reference each other using wiki-style links:

- **Strong links**: `[[plan-name]]` creates an explicit edge in the graph
- **Deep links**: `[[plan-name#section]]` links to a specific section

### Entities

AnchorMD extracts entity references from plan content:

- **File paths**: `src/auth/config.ts`, `lib/utils.js`
- **Models**: `model User`, `UserSchema`
- **Routes**: `GET /api/users`, `POST /api/auth/login`
- **Scripts**: `deploy.sh`, `npm run build`

### Weak Edges

When two plans reference the same entity (e.g., both mention `src/auth/config.ts`), AnchorMD creates a **weak edge** between them. This surfaces implicit relationships that weren't explicitly linked.

### Index Graph

The index graph (`.anchor/index.json`) tracks all plans, their links, entities, and weak edges. It's rebuilt automatically when plans are written, or manually via `anchormd reindex`.

## Search

AnchorMD uses [QMD](https://github.com/tobilu/qmd) for search. Three modes are available:

- **Lexical** (default): BM25 keyword search — fast, no dependencies beyond SQLite
- **Semantic**: Vector similarity search — requires sqlite-vec (`brew install sqlite` on macOS)
- **Hybrid**: Combined lexical + semantic with LLM reranking

Search results include **deep links** to the most relevant section:

```bash
$ anchormd find "sentiment analysis"
  1. [0.823] myproject/analytics-prd.md
     → analytics-prd#sentiment-tab
```

Use the deep link directly: `anchormd read analytics-prd#sentiment-tab`

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
    *.md            # Your plan files

~/.anchormd/
  anchormd.sqlite   # Central search database (shared across all projects)
```

## License

MIT

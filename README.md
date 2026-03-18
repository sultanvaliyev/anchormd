# AnchorMD

Persistent project context for AI coding agents using linked markdown plans with relationship tracking and hybrid search.

## Prerequisites

AnchorMD requires [Bun](https://bun.sh) runtime.

```bash
curl -fsSL https://bun.sh/install | bash
```

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
| `anchormd find <query> [--semantic] [--hybrid] [--limit <n>] [--json]` | Search plans (requires QMD) |
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

## Configuration

Configuration is stored in `.anchor/config.json`:

```json
{
  "qmd": false
}
```

- **qmd**: Enable/disable QMD search integration (enabled by default).

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
  search.sqlite     # QMD search database (gitignored)
  plans/
    anchor.md       # Project overview (created on init)
    *.md            # Your plan files
```

## License

MIT

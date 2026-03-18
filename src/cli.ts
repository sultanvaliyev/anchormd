/**
 * AnchorMD CLI
 *
 * Persistent project context for AI coding agents using linked markdown plans
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { ensureProjectInitialized, getAnchorDir, getPlansDir, saveConfig } from './config.js';
import { readPlan, writePlan, listPlans, parseFrontmatter, serializePlan } from './plan.js';
import { rebuildAndWriteIndex, readIndex } from './index-graph.js';
import { getQmdStore, deriveCollectionName, ensureCollection, reindexQmd, searchQmd } from './qmd.js';
import { scaffold } from './scaffold.js';
import { color, formatPlanTable, formatSearchResults, formatStatus } from './format.js';
import type { PlanStatus, IndexGraph } from './types.js';
import { VALID_STATUSES } from './types.js';

const VERSION = '0.4.0';

const program = new Command();

program
  .name('anchormd')
  .description('Persistent project context for AI coding agents using linked markdown plans')
  .version(VERSION);

// ─── init ────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize AnchorMD in the current project')
  .option('--no-qmd', 'Disable QMD search integration')
  .action(async (options) => {
    const anchorDir = path.join(process.cwd(), '.anchor');

    if (existsSync(anchorDir)) {
      console.error(color.red('Error: .anchor/ directory already exists. Project already initialized.'));
      process.exit(1);
    }

    await scaffold(process.cwd(), { qmd: options.qmd });
  });

// ─── context ─────────────────────────────────────────────────────────────────

program
  .command('context')
  .description('Print project overview and plan summary')
  .action(() => {
    const { projectRoot } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    // Print anchor.md content
    const anchorPath = path.join(plansDir, 'anchor.md');
    if (existsSync(anchorPath)) {
      const content = readFileSync(anchorPath, 'utf-8');
      console.log(content);
    }

    // Print plan summary table
    const plans = listPlans(plansDir);
    console.log(color.bold('Plans:'));
    console.log(formatPlanTable(plans));
    console.log('');
  });

// ─── write ───────────────────────────────────────────────────────────────────

program
  .command('write <name>')
  .description('Write or update a plan')
  .option('--from <file>', 'Read plan content from a file')
  .action(async (name: string, options) => {
    const { projectRoot, config } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    let content: string;

    if (options.from) {
      // Read from specified file
      const fromPath = path.resolve(options.from);
      if (!existsSync(fromPath)) {
        console.error(color.red(`Error: File not found: ${fromPath}`));
        process.exit(1);
      }
      content = readFileSync(fromPath, 'utf-8');
    } else if (!process.stdin.isTTY) {
      // Read from piped stdin
      content = readFileSync(0, 'utf-8');
    } else {
      // Spawn editor
      const editor = process.env.EDITOR || 'vi';
      const tmpFile = path.join(tmpdir(), `anchormd-${name}-${Date.now()}.md`);

      // Provide a template
      const template = serializePlan(
        { name, description: 'Description of this plan', status: 'planned' },
        `# ${name}\n\nDescribe the plan here.\n`
      );
      writeFileSync(tmpFile, template, 'utf-8');

      try {
        execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
        content = readFileSync(tmpFile, 'utf-8');
      } catch {
        console.error(color.red('Error: Editor exited with an error'));
        process.exit(1);
      }
    }

    // Validate or wrap content with frontmatter
    try {
      parseFrontmatter(content);
    } catch {
      // Content doesn't have valid frontmatter, wrap it
      content = serializePlan(
        { name, description: `Plan: ${name}`, status: 'planned' },
        content
      );
    }

    // Write the plan
    writePlan(plansDir, name, content);
    console.log(color.green(`Plan "${name}" written.`));

    // Rebuild index
    const graph = rebuildAndWriteIndex(projectRoot);
    const nodeCount = Object.keys(graph.nodes).length;
    console.log(color.dim(`Index rebuilt (${nodeCount} plans).`));

    // Reindex QMD if enabled
    if (config.qmd) {
      const store = await getQmdStore(config);
      if (store && config.collectionName) {
        await ensureCollection(store, config.collectionName, plansDir);
        await reindexQmd(store, config.collectionName);
      }
    }
  });

// ─── ls ──────────────────────────────────────────────────────────────────────

program
  .command('ls')
  .description('List all plans')
  .option('--status <status>', 'Filter by status (planned, in-progress, built, deprecated)')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const { projectRoot } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    let plans = listPlans(plansDir);

    // Filter by status
    if (options.status) {
      const status = options.status as PlanStatus;
      if (!VALID_STATUSES.includes(status)) {
        console.error(color.red(`Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`));
        process.exit(1);
      }
      plans = plans.filter(p => p.frontmatter.status === status);
    }

    if (options.json) {
      console.log(JSON.stringify(plans, null, 2));
    } else {
      console.log(formatPlanTable(plans));
    }
  });

// ─── read ────────────────────────────────────────────────────────────────────

program
  .command('read <name>')
  .description('Read a plan (supports name#section deep links)')
  .action((nameArg: string) => {
    const { projectRoot } = ensureProjectInitialized();
    const plansDir = getPlansDir(projectRoot);

    // Parse name#section
    const hashIndex = nameArg.indexOf('#');
    let planName: string;
    let section: string | null = null;

    if (hashIndex !== -1) {
      planName = nameArg.substring(0, hashIndex);
      section = nameArg.substring(hashIndex + 1);
    } else {
      planName = nameArg;
    }

    const plan = readPlan(plansDir, planName);

    if (section) {
      // Extract the specified section
      const sectionContent = extractSection(plan.body, section);
      if (sectionContent === null) {
        console.error(color.red(`Section "${section}" not found in plan "${planName}"`));
        process.exit(1);
      }
      console.log(sectionContent);
    } else {
      // Print full plan content
      const fullContent = serializePlan(plan.frontmatter, plan.body);
      console.log(fullContent);
    }
  });

// ─── find ────────────────────────────────────────────────────────────────────

program
  .command('find <query>')
  .description('Search plans using QMD')
  .option('--semantic', 'Use semantic (vector) search')
  .option('--hybrid', 'Use hybrid search (lexical + semantic)')
  .option('--limit <n>', 'Maximum number of results', '10')
  .option('--json', 'Output as JSON')
  .action(async (query: string, options) => {
    const { config } = ensureProjectInitialized();

    let mode: 'lexical' | 'semantic' | 'hybrid' = 'lexical';
    if (options.semantic) mode = 'semantic';
    if (options.hybrid) mode = 'hybrid';

    const limit = parseInt(options.limit, 10) || 10;

    const store = await getQmdStore(config);

    try {
      const results = await searchQmd(store, query, { mode, limit, collection: config.collectionName });

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatSearchResults(results));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(color.red(message));
      process.exit(1);
    }
  });

// ─── reindex ─────────────────────────────────────────────────────────────────

program
  .command('reindex')
  .description('Rebuild the index graph and QMD search database')
  .action(async () => {
    const { projectRoot, config } = ensureProjectInitialized();
    const anchorDir = getAnchorDir(projectRoot);
    const plansDir = getPlansDir(projectRoot);

    // Rebuild index graph
    const graph = rebuildAndWriteIndex(projectRoot);
    const nodeCount = Object.keys(graph.nodes).length;
    const linkCount = Object.values(graph.nodes).reduce((sum, n) => sum + n.links.length, 0);
    const weakEdgeCount = Object.values(graph.nodes).reduce((sum, n) => sum + n.weakEdges.length, 0);

    console.log(color.green('Index rebuilt.'));
    console.log(`  Plans: ${color.cyan(String(nodeCount))}`);
    console.log(`  Links: ${color.cyan(String(linkCount))}`);
    console.log(`  Weak edges: ${color.cyan(String(weakEdgeCount))}`);

    // Reindex QMD if enabled
    if (config.qmd) {
      const store = await getQmdStore(config);
      if (store) {
        // Legacy migration: derive + save collectionName if missing
        let collectionName = config.collectionName;
        if (!collectionName) {
          collectionName = await deriveCollectionName(store, projectRoot);
          config.collectionName = collectionName;
          saveConfig(projectRoot, config);
        }

        await ensureCollection(store, collectionName, plansDir);
        await reindexQmd(store, collectionName);
        console.log(color.green('QMD search index updated.'));
      }
    } else {
      console.log(color.dim('QMD search: disabled'));
    }
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show project status and statistics')
  .action(() => {
    const { projectRoot, config } = ensureProjectInitialized();
    const anchorDir = getAnchorDir(projectRoot);

    const graph = readIndex(anchorDir);

    let planCount = 0;
    let linkCount = 0;
    let weakEdgeCount = 0;

    if (graph) {
      const nodes = Object.values(graph.nodes);
      planCount = nodes.length;
      linkCount = nodes.reduce((sum, n) => sum + n.links.length, 0);
      weakEdgeCount = nodes.reduce((sum, n) => sum + n.weakEdges.length, 0);
    }

    console.log(formatStatus({
      planCount,
      linkCount,
      weakEdgeCount,
      qmdEnabled: config.qmd,
    }));
  });

// ─── graph ───────────────────────────────────────────────────────────────────

program
  .command('graph')
  .description('Visualize the plan relationship graph')
  .option('--text', 'Print text graph to terminal')
  .option('--mermaid', 'Output in Mermaid format')
  .option('--dot', 'Output in Graphviz DOT format')
  .action((options) => {
    const { projectRoot } = ensureProjectInitialized();
    const anchorDir = getAnchorDir(projectRoot);
    const plansDir = getPlansDir(projectRoot);

    const graph = readIndex(anchorDir);
    if (!graph || Object.keys(graph.nodes).length === 0) {
      console.error(color.dim('No plans indexed. Run `anchormd reindex` first.'));
      process.exit(1);
    }

    if (options.text) {
      console.log(generateTerminalGraph(graph, plansDir));
    } else if (options.mermaid) {
      console.log(generateMermaid(graph));
    } else if (options.dot) {
      console.log(generateDot(graph));
    } else {
      openInteractiveGraph(graph, plansDir, projectRoot);
    }
  });

// ─── Section extraction helper ───────────────────────────────────────────────

/**
 * Extract a section from markdown content by heading slug.
 * Matches heading text case-insensitively, slugified (spaces -> hyphens, lowercase).
 * Returns content from the matched heading to the next same-level or higher heading.
 */
function extractSection(body: string, sectionSlug: string): string | null {
  const lines = body.split('\n');
  const targetSlug = sectionSlug.toLowerCase();

  let capturing = false;
  let captureLevel = 0;
  const captured: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (capturing) {
        // Stop if we hit a same-level or higher-level heading
        if (level <= captureLevel) {
          break;
        }
      }

      if (slug === targetSlug || slug.endsWith('-' + targetSlug)) {
        capturing = true;
        captureLevel = level;
      }
    }

    if (capturing) {
      captured.push(line);
    }
  }

  if (captured.length === 0) {
    return null;
  }

  return captured.join('\n').trimEnd();
}

// ─── Graph generators ─────────────────────────────────────────────────────────

function openInteractiveGraph(graph: IndexGraph, plansDir: string, projectRoot: string): void {
  const nodes: Array<{ id: string; status: string; description: string; links: number; weakEdges: number; entities: number }> = [];
  const links: Array<{ source: string; target: string; type: 'strong' | 'weak' }> = [];
  const seen = new Set<string>();

  for (const node of Object.values(graph.nodes)) {
    const plan = (() => {
      try { return readPlan(plansDir, node.name); } catch { return null; }
    })();
    nodes.push({
      id: node.name,
      status: plan?.frontmatter.status ?? 'planned',
      description: plan?.frontmatter.description ?? '',
      links: node.links.length,
      weakEdges: node.weakEdges.length,
      entities: node.entities.length,
    });

    for (const target of node.links) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('|s|');
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ source: node.name, target, type: 'strong' });
      }
    }

    for (const target of node.weakEdges) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('|w|');
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ source: node.name, target, type: 'weak' });
      }
    }
  }

  const projectName = path.basename(projectRoot);
  const data = JSON.stringify({ nodes, links });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${projectName} — AnchorMD Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  svg { display: block; }
  .link-strong { stroke: rgba(139, 92, 246, 0.5); stroke-width: 1.5; }
  .link-weak { stroke: rgba(100, 116, 139, 0.25); stroke-width: 1; stroke-dasharray: 4 3; }
  .node circle { cursor: grab; stroke-width: 2; }
  .node circle:hover { filter: brightness(1.3); }
  .node text { fill: #e2e8f0; font-size: 12px; pointer-events: none; text-anchor: middle; }
  .tooltip {
    position: fixed; background: #16213e; border: 1px solid #334155;
    border-radius: 8px; padding: 12px 16px; color: #e2e8f0; font-size: 13px;
    pointer-events: none; opacity: 0; transition: opacity 0.15s;
    max-width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .tooltip .name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
  .tooltip .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 6px; }
  .tooltip .desc { color: #94a3b8; font-size: 12px; margin-bottom: 8px; }
  .tooltip .stats { color: #64748b; font-size: 11px; }
  .status-planned { background: #0c4a6e; color: #7dd3fc; }
  .status-in-progress { background: #713f12; color: #fde047; }
  .status-built { background: #14532d; color: #86efac; }
  .status-deprecated { background: #7f1d1d; color: #fca5a5; }
  .legend {
    position: fixed; bottom: 20px; left: 20px; background: #16213e;
    border: 1px solid #334155; border-radius: 8px; padding: 12px 16px;
    color: #94a3b8; font-size: 12px;
  }
  .legend-item { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  .legend-line { width: 20px; height: 0; border-top: 2px solid; }
  .title {
    position: fixed; top: 16px; left: 20px; color: #64748b; font-size: 13px;
    font-weight: 500; letter-spacing: 0.5px;
  }
</style>
</head>
<body>
<div class="title">${projectName}</div>
<div class="tooltip" id="tooltip"></div>
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#38bdf8"></div> planned</div>
  <div class="legend-item"><div class="legend-dot" style="background:#facc15"></div> in-progress</div>
  <div class="legend-item"><div class="legend-dot" style="background:#4ade80"></div> built</div>
  <div class="legend-item"><div class="legend-dot" style="background:#f87171"></div> deprecated</div>
  <div style="margin-top:6px">
    <div class="legend-item"><div class="legend-line" style="border-color:rgba(139,92,246,0.7)"></div> link</div>
    <div class="legend-item"><div class="legend-line" style="border-color:rgba(100,116,139,0.5);border-style:dashed"></div> shared entity</div>
  </div>
</div>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<script>
const data = ${data};
const statusColor = {
  planned: '#38bdf8', 'in-progress': '#facc15', built: '#4ade80', deprecated: '#f87171'
};
const w = window.innerWidth, h = window.innerHeight;
const svg = d3.select('body').append('svg').attr('width', w).attr('height', h);
const g = svg.append('g');

// Zoom
svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', e => g.attr('transform', e.transform)));

const simulation = d3.forceSimulation(data.nodes)
  .force('link', d3.forceLink(data.links).id(d => d.id).distance(d => d.type === 'strong' ? 120 : 180))
  .force('charge', d3.forceManyBody().strength(-400))
  .force('center', d3.forceCenter(w / 2, h / 2))
  .force('collision', d3.forceCollide().radius(40));

const link = g.append('g').selectAll('line').data(data.links).join('line')
  .attr('class', d => d.type === 'strong' ? 'link-strong' : 'link-weak');

const node = g.append('g').selectAll('g').data(data.nodes).join('g').attr('class', 'node');

const radius = d => 8 + (d.links + d.weakEdges) * 2;

node.append('circle')
  .attr('r', radius)
  .attr('fill', d => statusColor[d.status] || '#94a3b8')
  .attr('stroke', d => d3.color(statusColor[d.status] || '#94a3b8').darker(0.5))
  .call(d3.drag()
    .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
  );

node.append('text').text(d => d.id).attr('dy', d => -(radius(d) + 6));

// Tooltip
const tooltip = document.getElementById('tooltip');
node.on('mouseover', (e, d) => {
  tooltip.innerHTML = \`
    <div class="name">\${d.id}</div>
    <div class="status status-\${d.status.replace(' ', '-')}">\${d.status}</div>
    <div class="desc">\${d.description}</div>
    <div class="stats">\${d.links} links · \${d.weakEdges} weak edges · \${d.entities} entities</div>\`;
  tooltip.style.opacity = 1;
}).on('mousemove', e => {
  tooltip.style.left = (e.clientX + 16) + 'px';
  tooltip.style.top = (e.clientY - 16) + 'px';
}).on('mouseout', () => { tooltip.style.opacity = 0; });

// Highlight connected on hover
node.on('mouseover.highlight', (e, d) => {
  const connected = new Set();
  data.links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (s === d.id) connected.add(t);
    if (t === d.id) connected.add(s);
  });
  connected.add(d.id);
  node.style('opacity', n => connected.has(n.id) ? 1 : 0.15);
  link.style('opacity', l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return (s === d.id || t === d.id) ? 1 : 0.05;
  });
}).on('mouseout.highlight', () => {
  node.style('opacity', 1);
  link.style('opacity', 1);
});

simulation.on('tick', () => {
  link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
});
<\/script>
</body>
</html>`;

  const htmlPath = path.join(tmpdir(), `anchormd-graph-${Date.now()}.html`);
  writeFileSync(htmlPath, html, 'utf-8');

  // Open in default browser
  const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    execSync(`${openCmd} "${htmlPath}"`, { stdio: 'ignore' });
    console.log(color.green('Graph opened in browser.'));
    console.log(color.dim(`  ${htmlPath}`));
  } catch {
    console.log(`Graph saved to: ${htmlPath}`);
    console.log(color.dim('Open this file in a browser to view the interactive graph.'));
  }
}

function colorStatus(status: string): string {
  switch (status) {
    case 'built': return color.green(status);
    case 'in-progress': return color.yellow(status);
    case 'planned': return color.cyan(status);
    case 'deprecated': return color.red(status);
    default: return status;
  }
}

function generateTerminalGraph(graph: IndexGraph, plansDir: string): string {
  const lines: string[] = [];
  const nodes = Object.values(graph.nodes);

  for (const node of nodes) {
    const plan = (() => {
      try { return readPlan(plansDir, node.name); } catch { return null; }
    })();
    const status = plan?.frontmatter.status ?? 'planned';
    const desc = plan?.frontmatter.description ?? '';

    // Node header
    lines.push(`  ${color.bold(node.name)}  ${colorStatus(status)}  ${color.dim(desc)}`);

    // Strong links
    for (const target of node.links) {
      lines.push(`    ${color.cyan('-->')} ${target}`);
    }

    // Weak edges
    for (const target of node.weakEdges) {
      // Find shared entities
      const targetNode = graph.nodes[target];
      const shared: string[] = [];
      if (targetNode) {
        for (const e of node.entities) {
          if (targetNode.entities.some(te => te.type === e.type && te.value === e.value)) {
            shared.push(e.value);
          }
        }
      }
      const via = shared.length > 0 ? color.dim(` (${shared.slice(0, 2).join(', ')})`) : '';
      lines.push(`    ${color.dim('···')} ${color.dim(target)}${via}`);
    }

    if (node.links.length === 0 && node.weakEdges.length === 0) {
      lines.push(`    ${color.dim('(no connections)')}`);
    }

    lines.push('');
  }

  // Summary
  const linkCount = nodes.reduce((s, n) => s + n.links.length, 0);
  const weakCount = nodes.reduce((s, n) => s + n.weakEdges.length, 0);
  lines.push(color.dim(`  ${nodes.length} plans, ${linkCount} links, ${weakCount} weak edges`));

  return lines.join('\n');
}

const STATUS_STYLES: Record<string, string> = {
  'planned': ':::planned',
  'in-progress': ':::inprogress',
  'built': ':::built',
  'deprecated': ':::deprecated',
};

function generateMermaid(graph: IndexGraph): string {
  const lines: string[] = [
    'graph LR',
  ];

  const nodes = Object.values(graph.nodes);

  // Define nodes with status-based styling
  for (const node of nodes) {
    const plan = (() => {
      try {
        const { projectRoot } = ensureProjectInitialized();
        return readPlan(getPlansDir(projectRoot), node.name);
      } catch { return null; }
    })();
    const status = plan?.frontmatter.status ?? 'planned';
    const style = STATUS_STYLES[status] || '';
    lines.push(`  ${node.name}["${node.name}"]${style}`);
  }

  // Track edges to avoid duplicates
  const seen = new Set<string>();

  // Strong links (solid arrows)
  for (const node of nodes) {
    for (const target of node.links) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('->');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${node.name} --> ${target}`);
    }
  }

  // Weak edges (dotted lines)
  for (const node of nodes) {
    for (const target of node.weakEdges) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('-.-');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${node.name} -.- ${target}`);
    }
  }

  // Style classes
  lines.push('');
  lines.push('  classDef planned fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e');
  lines.push('  classDef inprogress fill:#fef9c3,stroke:#ca8a04,color:#713f12');
  lines.push('  classDef built fill:#dcfce7,stroke:#16a34a,color:#14532d');
  lines.push('  classDef deprecated fill:#fee2e2,stroke:#dc2626,color:#7f1d1d');

  return lines.join('\n');
}

function generateDot(graph: IndexGraph): string {
  const lines: string[] = [
    'digraph anchormd {',
    '  rankdir=LR;',
    '  node [shape=box, style="rounded,filled", fontname="Helvetica"];',
    '',
  ];

  const statusColors: Record<string, string> = {
    'planned': '#e0f2fe',
    'in-progress': '#fef9c3',
    'built': '#dcfce7',
    'deprecated': '#fee2e2',
  };

  const nodes = Object.values(graph.nodes);

  // Nodes
  for (const node of nodes) {
    const plan = (() => {
      try {
        const { projectRoot } = ensureProjectInitialized();
        return readPlan(getPlansDir(projectRoot), node.name);
      } catch { return null; }
    })();
    const status = plan?.frontmatter.status ?? 'planned';
    const fillColor = statusColors[status] || '#f5f5f5';
    lines.push(`  "${node.name}" [fillcolor="${fillColor}"];`);
  }

  lines.push('');

  const seen = new Set<string>();

  // Strong links
  for (const node of nodes) {
    for (const target of node.links) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('->');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  "${node.name}" -> "${target}";`);
    }
  }

  // Weak edges
  for (const node of nodes) {
    for (const target of node.weakEdges) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('-.-');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  "${node.name}" -> "${target}" [style=dotted, color=gray];`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Parse and run ───────────────────────────────────────────────────────────

program.parse(process.argv);

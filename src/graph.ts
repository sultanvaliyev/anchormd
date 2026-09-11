/** Relationship graph rendering. Browser launch is owned by the CLI. */
import path from 'node:path';
import { readPlan } from './plan.js';
import { color } from './format.js';
import type { IndexGraph } from './types.js';

export function generateInteractiveGraph(graph: IndexGraph, plansDir: string, projectRoot: string): string {
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
  const data = JSON.stringify({ nodes, links }).replace(/</g, '\\u003c');

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
  .link-weak { stroke: rgba(148, 163, 184, 0.45); stroke-width: 1.2; stroke-dasharray: 5 4; }
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

  return html;
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

export function generateTerminalGraph(graph: IndexGraph, plansDir: string): string {
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

export function generateMermaid(graph: IndexGraph, plansDir: string): string {
  const lines: string[] = [
    'graph LR',
  ];

  const nodes = Object.values(graph.nodes);
  const ids = new Map(nodes.map((node, i) => [node.name, `p${i}`]));

  // Define nodes with status-based styling
  for (const node of nodes) {
    const plan = (() => {
      try {
        return readPlan(plansDir, node.name);
      } catch { return null; }
    })();
    const status = plan?.frontmatter.status ?? 'planned';
    const style = STATUS_STYLES[status] || '';
    const label = node.name.replace(/&/g, '#38;').replace(/"/g, '#34;').replace(/</g, '#60;').replace(/>/g, '#62;');
    lines.push(`  ${ids.get(node.name)}["${label}"]${style}`);
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
      lines.push(`  ${ids.get(node.name)} --> ${ids.get(target)}`);
    }
  }

  // Weak edges (dotted lines)
  for (const node of nodes) {
    for (const target of node.weakEdges) {
      if (!graph.nodes[target]) continue;
      const key = [node.name, target].sort().join('-.-');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${ids.get(node.name)} -.- ${ids.get(target)}`);
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

export function generateDot(graph: IndexGraph, plansDir: string): string {
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
        return readPlan(plansDir, node.name);
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

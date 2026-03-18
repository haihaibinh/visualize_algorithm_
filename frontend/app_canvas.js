const $ = id => document.getElementById(id);
const canvas = $('canvas');
const runBtn = $('runBtn'), clearBtn = $('clearBtn'), resetVizBtn = $('resetVizBtn');
const speedSlider = $('speed'), speedVal = $('speedVal');
const algoSelect = $('algoSelect');
const statusBar = $('statusBar'), contextMenu = $('contextMenu');
const setStartBtn = $('setStartBtn'), setEndBtn = $('setEndBtn');
const firstBtn = $('firstBtn'), prevBtn = $('prevBtn'), playPauseBtn = $('playPauseBtn');
const nextBtn = $('nextBtn'), lastBtn = $('lastBtn');
const stepSlider = $('stepSlider'), stepCounter = $('stepCounter');
const distanceTable = $('distanceTable');
const pqContainer = $('pqContainer');
const explanationText = $('explanationText');
const pseudocodeDisplay = $('pseudocodeDisplay');
function getCurrentAlgo() {
    return algoSelect.value;
}
{
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;

    function fitCanvas() {
        const container = canvas.parentElement;
        const w = container.clientWidth, h = container.clientHeight;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = Math.floor(w * DPR);
        canvas.height = Math.floor(h * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    window.addEventListener('resize', fitCanvas);
    fitCanvas();

    /* Data models */
    class Node { constructor(id, x, y) { this.id = id; this.x = x; this.y = y; this.r = 33; } }
    class Edge {
        constructor(f, t, w = 1) { this.from = f; this.to = t; this.w = Number(w); }
        mid(nmap) { const a = nmap.get(this.from), b = nmap.get(this.to); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
        weightHit(px, py, nmap) { const m = this.mid(nmap); return Math.hypot(px - m.x, py - m.y) < 24; }
    }

    const nodes = [], nmap = new Map(), edges = [];

    /* State */
    const state = {
        selected: null, dragging: null, dragOffset: { x: 0, y: 0 },
        creatingEdge: null, hovered: null, startId: null, endId: null,
        animPlaying: false, animTimer: null, lastSteps: null, finalPath: []
    };

    /* Visualization state */
    const vizState = {
        allSteps: [],
        currentStepIndex: 0,
        isPlaying: false,
        playInterval: null
    };

    let labelCounter = 0;
    const nextLabel = () => {
        const base = 26;
        let n = labelCounter++, s = '';
        do {
            s = String.fromCharCode(65 + (n % base)) + s;
            n = Math.floor(n / base) - 1;
        } while (n >= 0);
        return s;
    };

    /* Helpers */
    const hitNode = (x, y) => nodes.find(n => Math.hypot(n.x - x, n.y - y) <= n.r);
    const hitEdgeWeightIdx = (x, y) => edges.findIndex(e => e.weightHit(x, y, nmap));
    const pointNearEdge = (px, py, e) => {
        const a = nmap.get(e.from), b = nmap.get(e.to);
        if (!a || !b) return false;
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        if (l2 === 0) return false;
        let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        const projx = a.x + t * dx, projy = a.y + t * dy;
        return Math.hypot(px - projx, py - projy) <= 12;
    };
    const hitEdgeIdx = (x, y) => edges.findIndex(e => pointNearEdge(x, y, e));

    function status(msg, ttl = 4000) {
        statusBar.textContent = msg;
        if (state.statusTO) clearTimeout(state.statusTO);
        state.statusTO = setTimeout(() => statusBar.textContent = 'Ready', ttl);
    }

    function roundRectPath(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawArrow(x1, y1, x2, y2, width = 2, color = '#475569') {
        const head = 12, ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* Draw loop */
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Edges
        for (let i = 0; i < edges.length; i++) {
            const e = edges[i], a = nmap.get(e.from), b = nmap.get(e.to);
            if (!a || !b) continue;
            let color = '#94a3b8', w = 2;
            if (e._inPath) { color = '#ef4444'; w = 5; }
            else if (e._highlight) { color = '#fb923c'; w = 4; }
            else if (state.selected && state.selected.type === 'edge' && state.selected.id === i) { color = '#f59e0b'; w = 3; }

            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            const ax = a.x + Math.cos(ang) * a.r * 0.9, ay = a.y + Math.sin(ang) * a.r * 0.9;
            const bx = b.x - Math.cos(ang) * b.r * 0.9, by = b.y - Math.sin(ang) * b.r * 0.9;
            drawArrow(ax, ay, bx, by, w, color);

            const m = e.mid(nmap);
            ctx.font = '19.5px Inter,Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            roundRectPath(m.x - 27, m.y - 18, 54, 36, 18);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.fillText(String(e.w), m.x, m.y);

            if (state.hovered && state.hovered.type === 'edgeWeight' && state.hovered.edgeIndex === i) {
                ctx.strokeStyle = '#ffd166';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(m.x - 27, m.y - 18, 54, 36);
            }
        }

        // Creating edge temp line
        if (state.creatingEdge) {
            const from = nmap.get(state.creatingEdge.from);
            if (from) {
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(state.creatingEdge.toX, state.creatingEdge.toY);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Nodes
        for (const n of nodes) {
            let fill = '#ffffff', stroke = '#041025';
            if (n.id === state.startId) { fill = '#bbf7d0'; stroke = '#059669'; }
            if (n.id === state.endId) { fill = '#fecaca'; stroke = '#dc2626'; }
            if (n._visited) { fill = '#bfdbfe'; stroke = '#2563eb'; }
            if (n._current) { fill = '#fef08a'; stroke = '#b45309'; }
            if (state.selected && state.selected.type === 'node' && state.selected.id === n.id) stroke = '#f97316';
            if (state.hovered && state.hovered.type === 'node' && state.hovered.nodeId === n.id) stroke = '#ffd166';
            if (n._inOpenSet) { fill = '#e9d5ff'; stroke = '#9333ea'; } // A* open set - màu tím nhạt
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#041025';
            ctx.font = 'bold 21px Inter,Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.id, n.x, n.y);
        }

        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    /* Events */
    const getMouse = e => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('dblclick', e => {
        const p = getMouse(e);
        if (hitNode(p.x, p.y)) return;
        const id = nextLabel(), node = new Node(id, p.x, p.y);
        nodes.push(node);
        nmap.set(id, node);
        status(`Added ${id}`);
    });

    canvas.addEventListener('mousedown', e => {
        const p = getMouse(e);
        if (e.button === 2) return;
        const node = hitNode(p.x, p.y);

        if (e.shiftKey && node) {
            state.creatingEdge = { from: node.id, toX: p.x, toY: p.y };
            state.selected = { type: 'node', id: node.id };
            return;
        }

        if (node) {
            state.dragging = node;
            state.dragOffset = { x: p.x - node.x, y: p.y - node.y };
            state.selected = { type: 'node', id: node.id };
            return;
        }

        const wIdx = hitEdgeWeightIdx(p.x, p.y);
        if (wIdx >= 0) {
            state.hovered = { type: 'edgeWeight', edgeIndex: wIdx };
            editWeight(wIdx);
            return;
        }

        const eIdx = hitEdgeIdx(p.x, p.y);
        if (eIdx >= 0) {
            state.selected = { type: 'edge', id: eIdx };
            return;
        }

        state.selected = null;
    });

    canvas.addEventListener('mousemove', e => {
        const p = getMouse(e);

        if (state.creatingEdge) {
            state.creatingEdge.toX = p.x;
            state.creatingEdge.toY = p.y;
            state.hovered = null;
            const t = hitNode(p.x, p.y);
            if (t && t.id !== state.creatingEdge.from) state.hovered = { type: 'node', nodeId: t.id };
            return;
        }

        if (state.dragging) {
            state.dragging.x = p.x - state.dragOffset.x;
            state.dragging.y = p.y - state.dragOffset.y;
            return;
        }

        state.hovered = null;
        const node = hitNode(p.x, p.y);
        if (node) {
            state.hovered = { type: 'node', nodeId: node.id };
            return;
        }

        const wIdx = hitEdgeWeightIdx(p.x, p.y);
        if (wIdx >= 0) {
            state.hovered = { type: 'edgeWeight', edgeIndex: wIdx };
            return;
        }

        const eIdx = hitEdgeIdx(p.x, p.y);
        if (eIdx >= 0) {
            state.hovered = { type: 'edge', edgeIndex: eIdx };
            return;
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (state.creatingEdge) {
            const p = getMouse(e);
            const target = hitNode(p.x, p.y);
            const from = state.creatingEdge.from;

            if (target && target.id !== from) {
                const to = target.id;
                const exists = edges.some(ed => ed.from === from && ed.to === to);

                if (!exists) {
                    let weightToSet = 1;
                    const reverse = edges.find(ed => ed.from === to && ed.to === from);
                    if (reverse) weightToSet = reverse.w;

                    edges.push(new Edge(from, to, weightToSet));
                    status(reverse ? `Edge ${from} → ${to} created (synced W = ${weightToSet})` : `Edge ${from} → ${to} created`);
                } else {
                    status('Edge already exists');
                }
            }
            state.creatingEdge = null;
            return;
        }
        state.dragging = null;
    });

    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const p = getMouse(e), node = hitNode(p.x, p.y);

        if (node) {
            contextMenu.style.left = (e.clientX + 6) + 'px';
            contextMenu.style.top = (e.clientY + 6) + 'px';
            contextMenu.classList.remove('hidden');
            contextMenu.dataset.nodeId = node.id;
        } else {
            contextMenu.classList.add('hidden');
        }
    });

    setStartBtn.addEventListener('click', () => {
        const nid = contextMenu.dataset.nodeId;
        if (nid) {
            state.startId = nid;
            status(`Start: ${nid}`);
        }
        contextMenu.classList.add('hidden');
    });

    setEndBtn.addEventListener('click', () => {
        const nid = contextMenu.dataset.nodeId;
        if (nid) {
            state.endId = nid;
            status(`End: ${nid}`);
        }
        contextMenu.classList.add('hidden');
    });

    window.addEventListener('click', e => {
        if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    });

    window.addEventListener('keydown', e => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
            if (state.selected.type === 'node') removeNode(state.selected.id);
            else if (state.selected.type === 'edge') removeEdge(state.selected.id);
            state.selected = null;
        }
    });

    function removeNode(id) {
        for (let i = edges.length - 1; i >= 0; i--)
            if (edges[i].from === id || edges[i].to === id) edges.splice(i, 1);
        const idx = nodes.findIndex(n => n.id === id);
        if (idx >= 0) nodes.splice(idx, 1);
        nmap.delete(id);
        status(`Removed ${id}`);
        if (state.startId === id) state.startId = null;
        if (state.endId === id) state.endId = null;
    }

    function removeEdge(idx) {
        if (idx >= 0 && idx < edges.length) {
            const e = edges.splice(idx, 1)[0];
            status(`Removed ${e.from}→${e.to}`);
        }
    }

    function editWeight(idx) {
        const e = edges[idx];
        if (!e) return;
        const val = prompt(`Edit weight ${e.from}→${e.to}`, String(e.w));
        if (val === null) return;
        const num = Number(val);
        if (isNaN(num)) {
            alert('Invalid');
            return;
        }
        e.w = num;
        for (let rev of edges) {
            if (rev.from === e.to && rev.to === e.from) {
                rev.w = num;
            }
        }
        status(`Weight updated to ${num}`);
    }

    /* ========== VISUALIZATION FUNCTIONS ========== */

    function renderDistanceTable(step) {
        if (!step) return;
        const algo = getCurrentAlgo();
        const distances = step.distances || {};
        const predecessors = step.predecessor || {};

        let html = '<thead><tr>';

        // Dynamic headers based on algorithm
        if (algo === 'astar') {
            html += '<th>Node</th><th>g(n)</th><th>h(n)</th><th>f(n)</th><th>Prev</th>';
        } else {
            html += '<th>Node</th><th>Distance</th><th>Prev</th>';
        }

        html += '</tr></thead><tbody>';

        const sortedNodes = Object.keys(distances).sort();

        for (const node of sortedNodes) {
            const dist = distances[node] === null || distances[node] === undefined ? '∞' : distances[node].toFixed(1);
            const pred = predecessors[node] || '-';

            let rowClass = '';
            if (step.relaxation && step.relaxation.to === node && step.relaxation.improved) {
                rowClass = 'updating';
            }

            if (algo === 'astar') {
                // A* specific rendering
                const gScore = dist;
                const hScore = step.heuristics && step.heuristics[node] !== undefined
                    ? step.heuristics[node].toFixed(1)
                    : '-';
                const fScore = step.f_scores && step.f_scores[node] !== undefined
                    ? (step.f_scores[node] === null ? '∞' : step.f_scores[node].toFixed(1))
                    : '-';

                html += `
                <tr class="${rowClass}">
                    <td><strong>${node}</strong></td>
                    <td>${gScore}</td>
                    <td style="color:#a78bfa;">${hScore}</td>
                    <td style="color:#60a5fa;font-weight:600;">${fScore}</td>
                    <td>${pred}</td>
                </tr>
            `;
            } else {
                // Dijkstra & Bellman-Ford rendering
                html += `
                <tr class="${rowClass}">
                    <td><strong>${node}</strong></td>
                    <td>${dist}</td>
                    <td>${pred}</td>
                </tr>
            `;
            }
        }

        html += '</tbody>';
        distanceTable.innerHTML = html;
    }

    function renderPriorityQueue(step) {
        if (!step) return;
        const algo = getCurrentAlgo();

        if (algo === 'bellman_ford') {
            // Bellman-Ford: Show iteration info
            const iteration = step.iteration !== undefined ? step.iteration : 0;
            const totalIterations = step.total_iterations || (Object.keys(step.distances || {}).length - 1);
            const relaxationCount = step.total_relaxations || 0;
            const edgesChecked = step.edges_checked || [];

            let html = `
            <div style="padding:12px;background:#0f172a;border-radius:6px;">
                <div style="margin-bottom:8px;">
                    <strong style="color:#60a5fa;">📊 Iteration:</strong> 
                    <span style="color:#fbbf24;font-weight:600;">${iteration} / ${totalIterations}</span>
                </div>
                <div style="margin-bottom:8px;">
                    <strong style="color:#60a5fa;">✅ Relaxations:</strong> 
                    <span>${relaxationCount}</span>
                </div>
        `;

            if (edgesChecked.length > 0) {
                html += `
                <div>
                    <strong style="color:#60a5fa;">🔍 Edges:</strong>
                    <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                        ${edgesChecked.map(e => `<span class="pq-item">${e}</span>`).join('')}
                    </div>
                </div>
            `;
            }

            html += '</div>';
            pqContainer.innerHTML = html;
            return;
        }

        // Dijkstra & A*: Show priority queue
        const pq = step.priority_queue || [];

        if (pq.length === 0) {
            pqContainer.innerHTML = '<em style="color:#64748b;">Empty</em>';
            return;
        }

        let html = '<div class="pq-items">';
        pq.forEach(([score, node], i) => {
            const isPopping = (i === 0 && step.current_node === node);

            // Format display based on algorithm
            let displayText = '';
            if (algo === 'astar' && step.f_scores) {
                const g = step.distances[node] !== undefined ? step.distances[node].toFixed(1) : '?';
                const h = step.heuristics && step.heuristics[node] !== undefined ? step.heuristics[node].toFixed(1) : '?';
                displayText = `${node}: f=${score.toFixed(1)} (g=${g}+h=${h})`;
            } else {
                displayText = `${node}: ${typeof score === 'number' ? score.toFixed(1) : score}`;
            }

            html += `
            <span class="pq-item ${isPopping ? 'popping' : ''}">
                ${displayText}
            </span>
        `;
        });
        html += '</div>';

        pqContainer.innerHTML = html;
    }
    function renderExplanation(step) {
        if (!step) return;
        const algo = getCurrentAlgo();

        let html = `
        <div class="explanation-box">
            <p><strong>Step ${step.step}</strong></p>
            <p>${step.explanation || 'Đang khởi tạo...'}</p>
    `;

        if (step.relaxation) {
            const rel = step.relaxation;
            const oldDist = rel.old_dist === null || rel.old_dist === undefined ? '∞' : rel.old_dist.toFixed(1);
            const newDist = rel.new_dist.toFixed(1);
            const weight = rel.weight.toFixed(1);

            if (algo === 'astar') {
                // A* specific calculation display
                const hValue = rel.h_value !== undefined ? rel.h_value.toFixed(1) : '?';
                const oldF = rel.old_f !== undefined ? (rel.old_f === null ? '∞' : rel.old_f.toFixed(1)) : '?';
                const newF = rel.new_f !== undefined ? rel.new_f.toFixed(1) : '?';

                html += `
                <div class="relaxation-calc">
                    <code style="display:block;margin-bottom:6px;">
                        g(${rel.to}) = g(${rel.from}) + w = ${rel.old_g || 0} + ${weight} = ${newDist}
                    </code>
                    <code style="display:block;margin-bottom:6px;">
                        f(${rel.to}) = g + h = ${newDist} + ${hValue} = ${newF}
                    </code>
                    <code>
                        ${rel.improved ? newF + ' < ' + oldF + ' ✅' : newF + ' ≥ ' + oldF + ' ❌'}
                    </code>
                </div>
            `;
            } else {
                // Dijkstra & Bellman-Ford
                html += `
                <div class="relaxation-calc">
                    <code>
                        dist[${rel.from}] + w(${rel.from}→${rel.to}) = ${oldDist === '∞' ? '0' : oldDist} + ${weight} = ${newDist}
                        ${rel.improved ? ' < ' + oldDist + ' ✅' : ' ≥ ' + oldDist + ' ❌'}
                    </code>
                </div>
            `;
            }
        }

        html += '</div>';
        explanationText.innerHTML = html;
    }
    function renderPseudocode(step) {
        const algo = getCurrentAlgo();
        let code = [];

        if (algo === 'dijkstra') {
            code = [
                'function Dijkstra(graph, start):',
                '  dist[start] ← 0',
                '  for each node v: dist[v] ← ∞',
                '  PQ.push((0, start))',
                '  while PQ not empty:',
                '    (d, u) ← PQ.pop()',
                '    if u visited: continue',
                '    mark u as visited',
                '    for each neighbor v of u:',
                '      alt ← dist[u] + weight(u,v)',
                '      if alt < dist[v]:',
                '        dist[v] ← alt',
                '        prev[v] ← u',
                '        PQ.push((alt, v))',
                '  return reconstruct_path(prev)'
            ];
        } else if (algo === 'astar') {
            code = [
                'function A*(graph, start, end):',
                '  g[start] ← 0',
                '  f[start] ← h(start, end)',
                '  open_set ← {start}',
                '  while open_set not empty:',
                '    current ← node in open_set with lowest f',
                '    if current = end: return path',
                '    remove current from open_set',
                '    for each neighbor of current:',
                '      tentative_g ← g[current] + weight',
                '      if tentative_g < g[neighbor]:',
                '        g[neighbor] ← tentative_g',
                '        f[neighbor] ← g[neighbor] + h(neighbor, end)',
                '        add neighbor to open_set',
                '  return reconstruct_path(prev)'
            ];
        } else if (algo === 'bellman_ford') {
            code = [
                'function BellmanFord(graph, start):',
                '  dist[start] ← 0',
                '  for each node v: dist[v] ← ∞',
                '  for i = 1 to |V|-1:',
                '    for each edge (u,v) with weight w:',
                '      if dist[u] + w < dist[v]:',
                '        dist[v] ← dist[u] + w',
                '        prev[v] ← u',
                '  # Check negative cycles',
                '  for each edge (u,v) with weight w:',
                '    if dist[u] + w < dist[v]:',
                '      error "Negative cycle"',
                '  return reconstruct_path(prev)'
            ];
        }

        const currentLine = step ? (step.pseudocode_line || 0) : 0;

        let html = code.map((line, i) => {
            const highlight = (i === currentLine) ? 'highlight' : '';
            return `<div class="code-line ${highlight}">${line}</div>`;
        }).join('');

        pseudocodeDisplay.innerHTML = html;
    }
    function updatePanelTitles() {
        const algo = getCurrentAlgo();
        const titles = document.querySelectorAll('.viz-section h3');

        if (titles.length >= 2) {
            // Update Priority Queue / Iteration Info title
            if (algo === 'bellman_ford') {
                titles[1].textContent = '📊 Iteration Info';
            } else {
                titles[1].textContent = '🔢 Priority Queue';
            }
        }
    }

    function updateVisualization(stepIndex) {
        if (!vizState.allSteps.length) return;

        vizState.currentStepIndex = Math.max(0, Math.min(stepIndex, vizState.allSteps.length - 1));
        const step = vizState.allSteps[vizState.currentStepIndex];

        // Update all panels
        renderDistanceTable(step);
        renderPriorityQueue(step);
        renderExplanation(step);
        renderPseudocode(step);

        // Update canvas highlighting
        const algo = getCurrentAlgo();
        const visited = new Set(step.visited_nodes || []);
        const openSet = algo === 'astar' && step.open_nodes ? new Set(step.open_nodes) : new Set();

        nodes.forEach(n => {
            n._visited = visited.has(n.id);
            n._current = (n.id === step.current_node);
            n._inOpenSet = openSet.has(n.id); // Cho A*
        });

        // Highlight relaxed edge
        const rel = step.relaxation;
        edges.forEach(ed => {
            ed._highlight = rel && ed.from === rel.from && ed.to === rel.to && rel.improved;
        });

        // Highlight final path
        const finalPath = step.path || [];
        edges.forEach(ed => {
            ed._inPath = false;
            for (let i = 0; i < finalPath.length - 1; i++) {
                const u = finalPath[i], v = finalPath[i + 1];
                if ((ed.from === u && ed.to === v) || (ed.from === v && ed.to === u)) {
                    ed._inPath = true;
                }
            }
        });

        // Update step counter
        stepCounter.textContent = `Step ${vizState.currentStepIndex} / ${vizState.allSteps.length - 1}`;
        stepSlider.value = vizState.currentStepIndex;
        stepSlider.max = vizState.allSteps.length - 1;
    }

    /* ========== PLAYBACK CONTROLS ========== */

    playPauseBtn.addEventListener('click', () => {
        if (vizState.isPlaying) {
            clearInterval(vizState.playInterval);
            vizState.isPlaying = false;
            playPauseBtn.textContent = '▶️';
        } else {
            if (vizState.currentStepIndex >= vizState.allSteps.length - 1) {
                vizState.currentStepIndex = 0;
                updateVisualization(0);
            }
            vizState.isPlaying = true;
            playPauseBtn.textContent = '⏸️';
            vizState.playInterval = setInterval(() => {
                if (vizState.currentStepIndex >= vizState.allSteps.length - 1) {
                    playPauseBtn.click();
                    return;
                }
                updateVisualization(vizState.currentStepIndex + 1);
            }, Number(speedSlider.value));
        }
    });

    nextBtn.addEventListener('click', () => {
        if (vizState.isPlaying) playPauseBtn.click();
        updateVisualization(vizState.currentStepIndex + 1);
    });

    prevBtn.addEventListener('click', () => {
        if (vizState.isPlaying) playPauseBtn.click();
        updateVisualization(vizState.currentStepIndex - 1);
    });

    firstBtn.addEventListener('click', () => {
        if (vizState.isPlaying) playPauseBtn.click();
        updateVisualization(0);
    });

    lastBtn.addEventListener('click', () => {
        if (vizState.isPlaying) playPauseBtn.click();
        updateVisualization(vizState.allSteps.length - 1);
    });

    stepSlider.addEventListener('input', (e) => {
        if (vizState.isPlaying) playPauseBtn.click();
        updateVisualization(Number(e.target.value));
    });

    /* ========== RUN ALGORITHM ========== */

runBtn.addEventListener('click', async () => {
    if (state.animPlaying) {
        status('Animation running — stop first');
        return;
    }
    if (!state.startId || !state.endId) {
        status('Set Start and End nodes');
        return;
    }

    // Kiểm tra cạnh âm với Dijkstra
    const algo = getCurrentAlgo();
    if (algo === 'dijkstra' || algo === 'astar') {
        const hasNegativeEdge = edges.some(e => e.w < 0);
        if (hasNegativeEdge) {
            showErrorModal({
                title: '⚠️ Lỗi: Cạnh âm phát hiện',
                message: 'Thuật toán không hoạt động đúng với đồ thị có cạnh trọng số âm.',
                suggestion: 'Vui lòng sử dụng thuật toán Bellman-Ford để xử lý đồ thị có cạnh âm.'
            });
            status('Không hỗ trợ cạnh âm');
            return;
        }
    }

    const body = buildPayload();
    status('Sending graph to backend...');

    try {
        const res = await fetch('http://localhost:5000/run_graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, method: algoSelect.value })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            status(`Error: ${res.status} - ${err.error || err.detail || res.statusText}`);
            return;
        }

        const data = await res.json();
        vizState.allSteps = data.steps || [];
        vizState.currentStepIndex = 0;
        state.finalPath = data.path || [];

        status(`Loaded ${vizState.allSteps.length} steps. Use controls to navigate.`);

        // Initialize visualization at step 0
        updateVisualization(0);

        // Show result modal
        const backendMs = Math.round(Number(data.algorithm_time || 0));
        const totalCost = computeTotalCost(state.finalPath);
        showResultModal({
            path: state.finalPath,
            totalCost,
            stepsCount: vizState.allSteps.length,
            responseMs: backendMs
        });

    } catch (err) {
        console.error(err);
        status('Failed to fetch — is backend running?');
    }
});

    clearBtn.addEventListener('click', () => {
        nodes.length = 0;
        edges.length = 0;
        nmap.clear();
        state.selected = null;
        state.startId = null;
        state.endId = null;
        labelCounter = 0;
        vizState.allSteps = [];
        vizState.currentStepIndex = 0;
        status('Graph cleared');

        // Clear visualization panels
        distanceTable.innerHTML = '<thead><tr><th>Node</th><th>Distance</th><th>Prev</th></tr></thead><tbody><tr><td colspan="3" style="text-align:center;color:#64748b;">Chưa có dữ liệu</td></tr></tbody>';
        pqContainer.innerHTML = '<em style="color:#64748b;">Chưa có dữ liệu</em>';
        explanationText.innerHTML = '<div class="explanation-box"><p>Nhấn <strong>▶️ Chạy</strong> để bắt đầu visualization</p></div>';
        pseudocodeDisplay.innerHTML = '';
        stepCounter.textContent = 'Step 0 / 0';
    });

    resetVizBtn.addEventListener('click', () => {
        stopAnimation();
        state.finalPath = [];
        state.lastSteps = null;
        state.selected = null;
        vizState.allSteps = [];
        vizState.currentStepIndex = 0;

        nodes.forEach(n => {
            delete n._visited;
            delete n._current;
        });

        edges.forEach(e => {
            delete e._inPath;
            delete e._highlight;
        });

        // Clear visualization panels
        distanceTable.innerHTML = '<thead><tr><th>Node</th><th>Distance</th><th>Prev</th></tr></thead><tbody><tr><td colspan="3" style="text-align:center;color:#64748b;">Chưa có dữ liệu</td></tr></tbody>';
        pqContainer.innerHTML = '<em style="color:#64748b;">Chưa có dữ liệu</em>';
        explanationText.innerHTML = '<div class="explanation-box"><p>Nhấn <strong>▶️ Chạy</strong> để bắt đầu visualization</p></div>';
        pseudocodeDisplay.innerHTML = '';
        stepCounter.textContent = 'Step 0 / 0';

        status('Visualization reset');
    });

    speedSlider.addEventListener('input', () => speedVal.textContent = `${speedSlider.value}ms`);
    algoSelect.addEventListener('change', () => {
        updatePanelTitles();
        renderPseudocode(null); // Re-render pseudocode cho algorithm mới
    });

    function buildPayload() {
        const g = {};
        nodes.forEach(n => g[n.id] = {});
        edges.forEach(e => {
            if (!g[e.from]) g[e.from] = {};
            g[e.from][e.to] = e.w;
        });
        const pos = {};
        nodes.forEach(n => pos[n.id] = { x: n.x, y: n.y });
        return { graph: g, start: state.startId, end: state.endId, positions: pos };
    }

    function computeTotalCost(path) {
        if (!path || path.length < 2) return 0;
        let sum = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const f = path[i], t = path[i + 1];
            const e = edges.find(ed => ed.from === f && ed.to === t);
            if (e) sum += Number(e.w) || 0;
            else {
                const er = edges.find(ed => ed.from === t && ed.to === f);
                if (er) sum += Number(er.w) || 0;
            }
        }
        return sum;
    }

    function ensureModalStyles() {
        if (document.getElementById('resultModalStyles')) return;
        const css = `
    #resultModalOverlay{position:fixed;inset:0;background:rgba(2,6,23,0.75);display:flex;align-items:center;justify-content:center;z-index:9999}
    #resultModal{width:min(720px,95%);background:#1e293b;border-radius:12px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:Inter,Arial;color:#e2e8f0;border:1px solid #334155;position:relative}
    #resultModal h3{margin:0 0 16px 0;font-size:20px;color:#60a5fa}
    #resultModal table{width:100%;border-collapse:collapse;font-size:15px;margin-top:12px}
    #resultModal td{padding:10px 8px;border-bottom:1px solid #334155}
    #resultModal .row-key{width:38%;color:#94a3b8;font-weight:600}
    #resultModal .closeBtn{position:absolute;right:18px;top:14px;background:transparent;border:0;font-size:24px;cursor:pointer;color:#94a3b8}
    #resultModal .closeBtn:hover{color:#e2e8f0}
    #resultModal .path-chips{display:flex;flex-wrap:wrap;gap:6px}
    #resultModal .chip{background:#334155;color:#e2e8f0;padding:6px 12px;border-radius:999px;font-size:13px;border:1px solid #475569}
    `;
        const s = document.createElement('style');
        s.id = 'resultModalStyles';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function showResultModal({ path = [], totalCost = 0, stepsCount = 0, responseMs = 0 }) {
        ensureModalStyles();
        const prev = document.getElementById('resultModalOverlay');
        if (prev) prev.remove();

        const overlay = document.createElement('div');
        overlay.id = 'resultModalOverlay';
        const modal = document.createElement('div');
        modal.id = 'resultModal';

        modal.innerHTML = `
      <button class="closeBtn" title="Close">×</button>
      <h3>🎉 Thuật toán - Kết quả</h3>
      <table>
        <tr><td class="row-key">Đường đi ngắn nhất (path)</td><td><div class="path-chips">${path && path.length ? path.map(p => `<span class="chip">${p}</span>`).join('') : '<em>Không tìm thấy</em>'}</div></td></tr>
        <tr><td class="row-key">Chi phí tổng</td><td>${(path && path.length > 1) ? totalCost.toFixed(1) : '-'}</td></tr>
        <tr><td class="row-key">Số bước (steps)</td><td>${stepsCount}</td></tr>
        <tr><td class="row-key">Thời gian phản hồi</td><td>${responseMs.toFixed(2)} ms</td></tr>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button id="closeResultOk" style="padding:10px 20px;border-radius:8px;border:0;background:#3b82f6;color:#fff;cursor:pointer;font-weight:600">Đóng</button>
      </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        modal.querySelector('.closeBtn').addEventListener('click', () => overlay.remove());
        document.getElementById('closeResultOk').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }
function showErrorModal({ title = '⚠️ Lỗi', message = '', suggestion = '' }) {
    // Đảm bảo CSS đã được thêm vào
    ensureModalStyles();
    
    // Xóa modal cũ nếu có
    const prev = document.getElementById('resultModalOverlay');
    if (prev) prev.remove();

    // Tạo overlay (nền mờ)
    const overlay = document.createElement('div');
    overlay.id = 'resultModalOverlay';
    
    // Tạo modal chính
    const modal = document.createElement('div');
    modal.id = 'resultModal';

    // Nội dung HTML của modal
    modal.innerHTML = `
        <button class="closeBtn" title="Close">×</button>
        <h3 style="color:#ef4444">${title}</h3>
        <div style="margin-top:16px;padding:16px;background:#7f1d1d;border-radius:8px;border:1px solid #991b1b">
            <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6">${message}</p>
            ${suggestion ? `<p style="margin:0;font-size:14px;color:#fca5a5;line-height:1.6"><strong>💡 Gợi ý:</strong> ${suggestion}</p>` : ''}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button id="closeErrorOk" style="padding:10px 20px;border-radius:8px;border:0;background:#ef4444;color:#fff;cursor:pointer;font-weight:600">Đã hiểu</button>
        </div>
    `;

    // Thêm modal vào overlay
    overlay.appendChild(modal);
    
    // Thêm overlay vào body
    document.body.appendChild(overlay);

    // Event listeners để đóng modal
    
    // 1. Nút X góc phải
    modal.querySelector('.closeBtn').addEventListener('click', () => {
        overlay.remove();
    });
    
    // 2. Nút "Đã hiểu"
    document.getElementById('closeErrorOk').addEventListener('click', () => {
        overlay.remove();
    });
    
    // 3. Click vào overlay (nền mờ)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}
    function stopAnimation() {
        state.animPlaying = false;
        if (state.animTimer) clearTimeout(state.animTimer);
        if (vizState.isPlaying) {
            clearInterval(vizState.playInterval);
            vizState.isPlaying = false;
            playPauseBtn.textContent = '▶️';
        }
    }

    // Initialize pseudocode display
    renderPseudocode(null);
    updatePanelTitles();
    // Seed demo graph
    (function seed() {
        const w = canvas.getBoundingClientRect().width, h = canvas.getBoundingClientRect().height;
        const a = new Node(nextLabel(), w * 0.2, h * 0.4);
        const b = new Node(nextLabel(), w * 0.5, h * 0.25);
        const c = new Node(nextLabel(), w * 0.7, h * 0.5);
        const d = new Node(nextLabel(), w * 0.45, h * 0.7);

        [a, b, c, d].forEach(n => {
            nodes.push(n);
            nmap.set(n.id, n);
        });

        edges.push(new Edge(a.id, b.id, 4));
        edges.push(new Edge(a.id, d.id, 2));
        edges.push(new Edge(b.id, c.id, 3));
        edges.push(new Edge(d.id, b.id, 1));
        edges.push(new Edge(d.id, c.id, 5));

        status('Demo loaded – double-click:add node, Shift+drag:add edge');
    })();
}
# bellmanford_real.py
import time
from typing import Dict, Any, Tuple, List

def bellmanford_real(adj: Dict[Any, Dict[Any, float]], start: Any, end: Any) -> Dict[str, Any]:
    """
    Bellman-Ford that also records simple process steps.
    Returns similar dict as dijkstra_real.
    
    FIXED: Properly collects all nodes including destinations
    """
    t0 = time.perf_counter()
    
    # ✅ FIX: Collect ALL nodes (both sources and destinations)
    nodes = set(adj.keys())
    for u in adj:
        nodes.update(adj[u].keys())
    nodes = list(nodes)
    
    # ✅ Ensure start and end are in nodes list
    if start not in nodes:
        nodes.append(start)
    if end not in nodes:
        nodes.append(end)
    
    # Initialize distances and predecessors
    dist = {n: float('inf') for n in nodes}
    prev = {n: None for n in nodes}
    dist[start] = 0

    process = []
    step = 0

    # Relax edges |V|-1 times
    for i in range(max(0, len(nodes) - 1)):
        changed = False
        # Iterate all edges
        for u in nodes:
            for v, w in adj.get(u, {}).items():
                if dist[u] + float(w) < dist[v]:
                    dist[v] = dist[u] + float(w)
                    prev[v] = u
                    changed = True
                    step += 1
                    process.append({
                        "step": step,
                        "current": v,
                        "visited": [n for n in nodes if dist[n] < float('inf')],
                        "predecessor": {k: v for k, v in prev.items() if v is not None}
                    })
        if not changed:
            break

    # Check negative cycles (unlikely for OSM lengths, but included for completeness)
    for u in nodes:
        for v, w in adj.get(u, {}).items():
            if dist[u] + float(w) < dist[v]:
                # Negative cycle detected
                return {
                    "path": [],
                    "process": process,
                    "distance": None,
                    "compute_time": (time.perf_counter() - t0) * 1000,
                    "error": "Negative cycle detected"
                }

    # Reconstruct path
    path = []
    if dist.get(end, float('inf')) == float('inf'):
        path = []
    else:
        node = end
        while node is not None:
            path.append(node)
            node = prev.get(node)
        path.reverse()

    compute_time = (time.perf_counter() - t0) * 1000
    total_distance = dist.get(end, None) if dist.get(end) != float('inf') else None

    return {
        "path": path,
        "process": process,
        "distance": total_distance,
        "compute_time": compute_time
    }
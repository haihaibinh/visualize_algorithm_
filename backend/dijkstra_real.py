# dijkstra_real.py
import heapq
import time
from typing import Dict, Any, Tuple, List

def dijkstra_real(adj: Dict[Any, Dict[Any, float]], start: Any, end: Any) -> Dict[str, Any]:
    """
    Input:
      - adj: adjacency map {node: {neighbor: weight}}
      - start, end: node IDs (OSM node ids)
    Returns dict:
      {
        "path": [nodeID, ...],
        "process": [ {step, current, visited, predecessor}, ... ],
        "distance": total_distance,
        "compute_time": ms
      }
    """
    t0 = time.perf_counter()
    dist = {}
    prev = {}
    pq = []
    process = []

    for node in adj.keys():
        dist[node] = float('inf')
        prev[node] = None
    if start not in dist:
        # If start not in graph, return empty
        compute_time = (time.perf_counter() - t0) * 1000
        return {"path": [], "process": [], "distance": None, "compute_time": compute_time}

    dist[start] = 0
    heapq.heappush(pq, (0, start))
    visited_set = set()
    step = 0

    while pq:
        d, u = heapq.heappop(pq)
        if u in visited_set:
            continue
        visited_set.add(u)
        step += 1

        # record simple process step
        process.append({
            "step": step,
            "current": u,
            "visited": list(visited_set),
            "predecessor": {k: v for k, v in prev.items() if v is not None}
        })

        if u == end:
            break

        neighbors = adj.get(u, {})
        for v, w in neighbors.items():
            if v in visited_set:
                continue
            nd = d + float(w)
            if nd < dist.get(v, float('inf')):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    # reconstruct path
    path = []
    node = end
    if prev.get(node) is None and node != start:
        # maybe unreachable
        path = []
    else:
        while node is not None:
            path.append(node)
            node = prev.get(node)
        path.reverse()

    compute_time = (time.perf_counter() - t0) * 1000
    total_distance = dist[end] if dist.get(end) != float('inf') else None

    return {
        "path": path,
        "process": process,
        "distance": total_distance,
        "compute_time": compute_time
    }

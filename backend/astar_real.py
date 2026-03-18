# astar_real.py
import heapq
import math
import time
from typing import Dict, Any, Tuple, List

def haversine_coords(a: Tuple[float,float], b: Tuple[float,float]) -> float:
    # a and b are (lat, lon)
    lat1, lon1 = a
    lat2, lon2 = b
    R = 6371000  # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(x))

def astar_real(adj: Dict[Any, Dict[Any, float]], positions: Dict[Any, Dict[str,float]], start: Any, end: Any) -> Dict[str,Any]:
    """
    A* using positions {node: {"x": lon, "y": lat}} for heuristic (haversine).
    Returns dict like dijkstra_real.
    """
    t0 = time.perf_counter()
    if start not in adj or end not in adj:
        compute_time = (time.perf_counter() - t0) * 1000
        return {"path": [], "process": [], "distance": None, "compute_time": compute_time}

    open_set = []
    gscore = {}
    fscore = {}
    prev = {}
    process = []
    visited = set()
    step = 0

    for n in adj.keys():
        gscore[n] = float('inf')
        fscore[n] = float('inf')
        prev[n] = None
    gscore[start] = 0

    # positions: {node: {"x": lon, "y": lat}}
    def heur(u, v):
        pu = positions.get(u)
        pv = positions.get(v)
        if not pu or not pv:
            return 0
        # positions store x=lon, y=lat
        return haversine_coords((pu["y"], pu["x"]), (pv["y"], pv["x"]))

    heapq.heappush(open_set, (heur(start, end), start))
    fscore[start] = heur(start, end)

    while open_set:
        _, u = heapq.heappop(open_set)
        if u in visited:
            continue
        visited.add(u)
        step += 1
        process.append({
            "step": step,
            "current": u,
            "visited": list(visited),
            "predecessor": {k: v for k, v in prev.items() if v is not None}
        })

        if u == end:
            break

        for v, w in adj.get(u, {}).items():
            tentative_g = gscore[u] + float(w)
            if tentative_g < gscore.get(v, float('inf')):
                gscore[v] = tentative_g
                prev[v] = u
                fscore[v] = tentative_g + heur(v, end)
                heapq.heappush(open_set, (fscore[v], v))

    # reconstruct
    path = []
    if gscore.get(end, float('inf')) == float('inf'):
        path = []
    else:
        node = end
        while node is not None:
            path.append(node)
            node = prev.get(node)
        path.reverse()

    compute_time = (time.perf_counter() - t0) * 1000
    total_distance = gscore[end] if gscore.get(end) != float('inf') else None

    return {
        "path": path,
        "process": process,
        "distance": total_distance,
        "compute_time": compute_time
    }

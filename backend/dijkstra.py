import heapq
import copy
import time
from typing import Dict, Any, List, Tuple, Optional

INF = float("inf")

def _reconstruct_path(prev: Dict[str, Optional[str]], end: str) -> List[str]:
    """Reconstruct path from start to end using predecessor map."""
    if end not in prev or prev[end] is None:
        return []
    path = []
    node = end
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()
    return path

def generate_explanation(current, neighbor, relaxing, dist_u, weight, old_dist, new_dist):
    """Generate Vietnamese explanation for each step."""
    if current is None:
        return "🚀 Khởi tạo: Đặt khoảng cách từ Start về chính nó = 0, các node khác = ∞"
    if neighbor is None:
        return f"📍 Đang xét node <strong>{current}</strong>. Lấy ra khỏi Priority Queue (đã có khoảng cách ngắn nhất)."
    if relaxing:
        return f"✅ Tìm thấy đường đi tốt hơn đến <strong>{neighbor}</strong> qua <strong>{current}</strong>!<br/>Cập nhật: {old_dist if old_dist != INF else '∞'} → {new_dist:.1f}"
    return f"⏭️ Đường đi qua <strong>{current}</strong> đến <strong>{neighbor}</strong> không cải thiện. Giữ nguyên khoảng cách cũ."

def dijkstra(graph: Dict[str, Dict[str, float]], start: str, end: str) -> Dict[str, Any]:
    """
    Run Dijkstra on `graph` from `start` to `end`.
    Returns dict with enhanced tracking data for visualization.
    """
    # Start timing
    start_time = time.perf_counter()

    # Ensure all nodes appear in keys
    all_nodes = set(graph.keys())
    for u, nbrs in graph.items():
        for v in nbrs.keys():
            all_nodes.add(v)
    for node in all_nodes:
        graph.setdefault(node, {})

    # Initialization
    dist: Dict[str, float] = {node: INF for node in all_nodes}
    prev: Dict[str, Optional[str]] = {node: None for node in all_nodes}
    dist[start] = 0.0

    pq: List[Tuple[float, str]] = []
    heapq.heappush(pq, (0.0, start))

    visited = set()
    steps: List[Dict[str, Any]] = []
    step_idx = 0

    # Initial step
    pq_snapshot = [(d, n) for d, n in sorted(list(pq))[:15]]
    steps.append({
        "step": step_idx,
        "current_node": None,
        "visited_nodes": list(visited),
        "distances": {n: (None if dist[n] == INF else dist[n]) for n in sorted(all_nodes)},
        "predecessor": {n: prev[n] for n in sorted(all_nodes)},
        "priority_queue": pq_snapshot,
        "relaxation": None,
        "explanation": generate_explanation(None, None, False, 0, 0, 0, 0),
        "pseudocode_line": 0,
        "path": []
    })
    step_idx += 1
    while pq:
        d_u, u = heapq.heappop(pq)
        
        # Ignore stale entries
        if d_u > dist[u]:
            continue

        # Mark u as visited
        visited.add(u)
        # Log state after popping node u (before relaxation)
        pq_snapshot = [(d, n) for d, n in sorted(list(pq))[:15]]
        tentative_path = _reconstruct_path(prev, end) if dist.get(end, INF) < INF else []
        
        steps.append({
            "step": step_idx,
            "current_node": u,
            "visited_nodes": sorted(list(visited)),
            "distances": {n: (None if dist[n] == INF else dist[n]) for n in sorted(all_nodes)},
            "predecessor": {n: prev[n] for n in sorted(all_nodes)},
            "priority_queue": pq_snapshot,
            "relaxation": None,
            "explanation": generate_explanation(u, None, False, 0, 0, 0, 0),
            "pseudocode_line": 5,
            "path": tentative_path
        })
        step_idx += 1

        # Early exit
        if u == end:
            break

        # Relax edges
        for v, w in graph.get(u, {}).items():
            try:
                weight = float(w)
            except Exception:
                continue
            
            old_dist_v = dist[v]
            new_dist_v = dist[u] + weight
            improved = new_dist_v < old_dist_v
            
            relaxation_info = {
                "from": u,
                "to": v,
                "old_dist": old_dist_v if old_dist_v != INF else None,
                "new_dist": new_dist_v,
                "weight": weight,
                "improved": improved
            }
            
            # Update distance if improved
            if improved:
                dist[v] = new_dist_v
                prev[v] = u
                heapq.heappush(pq, (dist[v], v))
            
            # Snapshot after each edge relaxation
            pq_snapshot = [(d, n) for d, n in sorted(list(pq))[:15]]
            tentative_path = _reconstruct_path(prev, end) if dist.get(end, INF) < INF else []
            
            steps.append({
                "step": step_idx,
                "current_node": u,
                "visited_nodes": sorted(list(visited)),
                "distances": {n: (None if dist[n] == INF else dist[n]) for n in sorted(all_nodes)},
                "predecessor": {n: prev[n] for n in sorted(all_nodes)},
                "priority_queue": pq_snapshot,
                "relaxation": relaxation_info,
                "explanation": generate_explanation(u, v, improved, dist[u], weight, old_dist_v, new_dist_v),
                "pseudocode_line": 10 if improved else 9,
                "path": tentative_path
            })
            step_idx += 1

    # Final path
    final_path = _reconstruct_path(prev, end)
    final_distance = dist[end] if dist[end] != INF else None

    # Final state
    steps.append({
        "step": step_idx,
        "current_node": None,
        "visited_nodes": sorted(list(visited)),
        "distances": {n: (None if dist[n] == INF else dist[n]) for n in sorted(all_nodes)},
        "predecessor": {n: prev[n] for n in sorted(all_nodes)},
        "priority_queue": [],
        "relaxation": None,
        "explanation": "🎉 Hoàn thành! " + (f"Tìm thấy đường đi ngắn nhất: {' → '.join(final_path)}" if final_path else "Không tìm thấy đường đi."),
        "pseudocode_line": 13,
        "path": final_path
    })

    # End timing
    compute_time = (time.perf_counter() - start_time) * 1000.0

    result = {
        "path": final_path,
        "distance": final_distance,
        "steps": steps,
        "compute_time": compute_time,
        "algorithm_time": compute_time  # For compatibility with frontend
    }
    return result

# Test
if __name__ == "__main__":
    sample = {
        "A": {"B": 5, "C": 2},
        "B": {"D": 3},
        "C": {"B": 1, "D": 6},
        "D": {}
    }
    result = dijkstra(sample, "A", "D")
    print(f"Path: {result['path']}")
    print(f"Distance: {result['distance']}")
    print(f"Steps: {len(result['steps'])}")
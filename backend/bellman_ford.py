import time
from typing import Dict, Any, List, Optional

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

def generate_explanation(iteration, current_edge, relaxing, old_dist, new_dist, is_init=False, is_final_check=False, has_negative_cycle=False):
    """Generate Vietnamese explanation for each Bellman-Ford step."""
    if is_init:
        return "🚀 Khởi tạo: Đặt dist[start] = 0, tất cả node khác = ∞"
    
    if is_final_check:
        if has_negative_cycle:
            return "⚠️ <strong>Phát hiện chu trình âm!</strong> Đồ thị không có đường đi ngắn nhất xác định."
        return "✅ Kiểm tra chu trình âm hoàn tất. Không phát hiện chu trình âm."
    
    if current_edge:
        u, v = current_edge
        if relaxing:
            return f"✅ <strong>Iteration {iteration}</strong>: Cải thiện đường đi đến <strong>{v}</strong> qua <strong>{u}</strong>!<br/>Cập nhật: {old_dist if old_dist != INF else '∞'} → {new_dist:.1f}"
        return f"⏭️ <strong>Iteration {iteration}</strong>: Xét edge <strong>{u} → {v}</strong>. Không cải thiện, giữ nguyên."
    
    return f"🔄 <strong>Iteration {iteration}</strong>: Đang duyệt tất cả các edges..."

def bellman_ford(graph: Dict[str, Dict[str, float]], start: str, end: str) -> Dict[str, Any]:
    """
    Run Bellman-Ford algorithm on `graph` from `start` to `end`.
    Returns dict with enhanced tracking data for visualization.
    
    Args:
        graph: Adjacency dict {node: {neighbor: weight}}
        start: Start node
        end: End node
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
    distances: Dict[str, float] = {node: INF for node in all_nodes}
    predecessor: Dict[str, Optional[str]] = {node: None for node in all_nodes}
    distances[start] = 0.0
    
    steps: List[Dict[str, Any]] = []
    step_idx = 0
    total_relaxations = 0
    
    # Build edge list
    all_edges = []
    for u in graph:
        for v, w in graph[u].items():
            all_edges.append((u, v, w))
    
    num_nodes = len(all_nodes)
    total_iterations = num_nodes - 1
    
    # Initial step
    steps.append({
        "step": step_idx,
        "iteration": 0,
        "current_edge": None,
        "visited_nodes": [],
        "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
        "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
        "relaxation": None,
        "total_relaxations": 0,
        "edges_checked": [],
        "total_iterations": total_iterations,
        "explanation": generate_explanation(0, None, False, 0, 0, is_init=True),
        "pseudocode_line": 0,
        "path": [],
        "is_final_check": False
    })
    step_idx += 1
    
    # Main relaxation phase: Repeat |V|-1 times
    for iteration in range(1, num_nodes):
        iteration_updated = False
        edges_checked_this_iter = []
        
        # Log iteration start
        steps.append({
            "step": step_idx,
            "iteration": iteration,
            "current_edge": None,
            "visited_nodes": [],
            "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
            "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
            "relaxation": None,
            "total_relaxations": total_relaxations,
            "edges_checked": edges_checked_this_iter.copy(),
            "total_iterations": total_iterations,
            "explanation": generate_explanation(iteration, None, False, 0, 0),
            "pseudocode_line": 3,
            "path": _reconstruct_path(predecessor, end) if distances.get(end, INF) < INF else [],
            "is_final_check": False
        })
        step_idx += 1
        
        # Relax all edges
        for u, v, w in all_edges:
            try:
                weight = float(w)
            except Exception:
                continue
            
            edge_label = f"{u}→{v}"
            edges_checked_this_iter.append(edge_label)
            
            old_dist_v = distances[v]
            new_dist_v = distances[u] + weight
            improved = distances[u] != INF and new_dist_v < old_dist_v
            
            relaxation_info = {
                "from": u,
                "to": v,
                "old_dist": old_dist_v if old_dist_v != INF else None,
                "new_dist": new_dist_v,
                "weight": weight,
                "improved": improved
            }
            
            # Update if improved
            if improved:
                distances[v] = new_dist_v
                predecessor[v] = u
                iteration_updated = True
                total_relaxations += 1
            
            # Snapshot after each edge check
            steps.append({
                "step": step_idx,
                "iteration": iteration,
                "current_edge": (u, v),
                "visited_nodes": [],
                "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
                "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
                "relaxation": relaxation_info,
                "total_relaxations": total_relaxations,
                "edges_checked": edges_checked_this_iter.copy(),
                "total_iterations": total_iterations,
                "explanation": generate_explanation(iteration, (u, v), improved, old_dist_v, new_dist_v),
                "pseudocode_line": 5 if improved else 4,
                "path": _reconstruct_path(predecessor, end) if distances.get(end, INF) < INF else [],
                "is_final_check": False
            })
            step_idx += 1
        
        # Early termination if no updates
        if not iteration_updated:
            steps.append({
                "step": step_idx,
                "iteration": iteration,
                "current_edge": None,
                "visited_nodes": [],
                "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
                "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
                "relaxation": None,
                "total_relaxations": total_relaxations,
                "edges_checked": edges_checked_this_iter,
                "total_iterations": total_iterations,
                "explanation": f"⏭️ <strong>Iteration {iteration}</strong>: Không có cải thiện nào. Dừng sớm!",
                "pseudocode_line": 7,
                "path": _reconstruct_path(predecessor, end) if distances.get(end, INF) < INF else [],
                "is_final_check": False
            })
            step_idx += 1
            break
    
    # Check for negative cycles
    has_negative_cycle = False
    for u, v, w in all_edges:
        try:
            weight = float(w)
        except Exception:
            continue
        
        if distances[u] != INF and distances[u] + weight < distances[v]:
            has_negative_cycle = True
            
            # Log negative cycle detection
            steps.append({
                "step": step_idx,
                "iteration": num_nodes,
                "current_edge": (u, v),
                "visited_nodes": [],
                "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
                "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
                "relaxation": {
                    "from": u,
                    "to": v,
                    "old_dist": distances[v] if distances[v] != INF else None,
                    "new_dist": distances[u] + weight,
                    "weight": weight,
                    "improved": True
                },
                "total_relaxations": total_relaxations,
                "edges_checked": [],
                "total_iterations": total_iterations,
                "explanation": generate_explanation(num_nodes, (u, v), False, 0, 0, is_final_check=True, has_negative_cycle=True),
                "pseudocode_line": 10,
                "path": [],
                "is_final_check": True
            })
            step_idx += 1
            
            # Raise exception for negative cycle
            compute_time = (time.perf_counter() - start_time) * 1000.0
            return {
                "path": [],
                "distance": None,
                "steps": steps,
                "compute_time": compute_time,
                "algorithm_time": compute_time,
                "error": "Negative cycle detected"
            }
    # No negative cycle found
    steps.append({
        "step": step_idx,
        "iteration": num_nodes,
        "current_edge": None,
        "visited_nodes": [],
        "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
        "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
        "relaxation": None,
        "total_relaxations": total_relaxations,
        "edges_checked": [],
        "total_iterations": total_iterations,
        "explanation": generate_explanation(num_nodes, None, False, 0, 0, is_final_check=True, has_negative_cycle=False),
        "pseudocode_line": 8,
        "path": _reconstruct_path(predecessor, end) if distances.get(end, INF) < INF else [],
        "is_final_check": True
    })
    step_idx += 1
    
    # Final path
    final_path = _reconstruct_path(predecessor, end)
    final_distance = distances[end] if distances[end] != INF else None
    
    # Final state
    steps.append({
        "step": step_idx,
        "iteration": num_nodes,
        "current_edge": None,
        "visited_nodes": [],
        "distances": {n: (None if distances[n] == INF else distances[n]) for n in sorted(all_nodes)},
        "predecessor": {n: predecessor[n] for n in sorted(all_nodes)},
        "relaxation": None,
        "total_relaxations": total_relaxations,
        "edges_checked": [],
        "total_iterations": total_iterations,
        "explanation": "🎉 Hoàn thành! " + (f"Tìm thấy đường đi ngắn nhất: {' → '.join(final_path)}" if final_path else "Không tìm thấy đường đi."),
        "pseudocode_line": 12,
        "path": final_path,
        "is_final_check": False
    })
    
    # End timing
    compute_time = (time.perf_counter() - start_time) * 1000.0
    
    result = {
        "path": final_path,
        "distance": final_distance,
        "steps": steps,
        "compute_time": compute_time,
        "algorithm_time": compute_time
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
    
    result = bellman_ford(sample, "A", "D")
    print(f"Path: {result['path']}")
    print(f"Distance: {result['distance']}")
    print(f"Steps: {len(result['steps'])}")
    print(f"Time: {result['compute_time']:.2f}ms")
    
    # Test with negative cycle
    negative_cycle_graph = {
        "A": {"B": 1},
        "B": {"C": 2},
        "C": {"A": -5}
    }
    
    print("\n--- Testing negative cycle ---")
    result2 = bellman_ford(negative_cycle_graph, "A", "C")
    if "error" in result2:
        print(f"Error: {result2['error']}")
        print(f"Steps before error: {len(result2['steps'])}")
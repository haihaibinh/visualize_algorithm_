import heapq
import time
from typing import Dict, Any, List, Tuple, Optional
from collections import deque

INF = float("inf")

def compute_min_weight(graph: Dict[str, Dict[str, float]]) -> float:
    """Tính trọng số nhỏ nhất trong đồ thị."""
    min_w = INF
    for u, neighbors in graph.items():
        for v, weight in neighbors.items():
            try:
                w = float(weight)
                if w > 0 and w < min_w:
                    min_w = w
            except Exception:
                continue
    return min_w if min_w != INF else 1.0

def compute_min_edges_bfs(graph: Dict[str, Dict[str, float]], goal: str) -> Dict[str, int]:
    """
    Tính số cạnh tối thiểu từ mỗi node đến goal bằng BFS ngược.
    Trả về dict {node: số_cạnh_tối_thiểu}.
    """
    # Xây dựng đồ thị ngược (reversed graph)
    reversed_graph = {}
    all_nodes = set(graph.keys())
    for u, neighbors in graph.items():
        for v in neighbors.keys():
            all_nodes.add(v)
            if v not in reversed_graph:
                reversed_graph[v] = []
            reversed_graph[v].append(u)
    
    # Khởi tạo khoảng cách
    min_edges = {node: INF for node in all_nodes}
    min_edges[goal] = 0
    
    # BFS từ goal
    queue = deque([goal])
    
    while queue:
        current = queue.popleft()
        current_dist = min_edges[current]
        
        # Duyệt các node có thể đến current
        for predecessor in reversed_graph.get(current, []):
            if min_edges[predecessor] == INF:  # Chưa thăm
                min_edges[predecessor] = current_dist + 1
                queue.append(predecessor)
    
    return min_edges

def heuristic(u, v, w_min: float, min_edges: Dict[str, int]) -> float:
    """
    Tính heuristic h(n) = w_min × min_edges(n → goal).
    
    Args:
        u: Node hiện tại
        v: Node đích (goal)
        w_min: Trọng số nhỏ nhất trong đồ thị
        min_edges: Dict chứa số cạnh tối thiểu từ mỗi node đến goal
    """
    if u not in min_edges or min_edges[u] == INF:
        return 0.0
    
    return w_min * min_edges[u]

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

def generate_explanation(current, neighbor, relaxing, g_current, weight, old_g, new_g, h_value, old_f, new_f):
    """Generate Vietnamese explanation for each A* step."""
    if current is None:
        return "🚀 Khởi tạo: Đặt g(start) = 0, f(start) = h(start→end). Các node khác g = ∞, f = ∞"
    if neighbor is None:
        return f"🔍 Đang xét node <strong>{current}</strong> (có f-score thấp nhất trong open set)."
    if relaxing:
        return f"✅ Tìm thấy đường đi tốt hơn đến <strong>{neighbor}</strong> qua <strong>{current}</strong>!<br/>f = g + h = {new_g:.1f} + {h_value:.1f} = {new_f:.1f} (cũ: {old_f if old_f != INF else '∞'})"
    return f"⏭️ Đường đi qua <strong>{current}</strong> đến <strong>{neighbor}</strong> không cải thiện. Giữ nguyên."

def astar(graph: Dict[str, Dict[str, float]], start: str, end: str, positions: Dict[str, Dict[str, float]] = None) -> Dict[str, Any]:
    """
    Run A* algorithm on `graph` from `start` to `end`.
    Returns dict with enhanced tracking data for visualization.
    
    Args:
        graph: Adjacency dict {node: {neighbor: weight}}
        start: Start node
        end: End node
        positions: (Không sử dụng nữa - giữ lại để tương thích)
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
    
    # Tính w_min và min_edges
    w_min = compute_min_weight(graph)
    min_edges = compute_min_edges_bfs(graph, end)
    
    # Initialization
    g_score: Dict[str, float] = {node: INF for node in all_nodes}
    f_score: Dict[str, float] = {node: INF for node in all_nodes}
    prev: Dict[str, Optional[str]] = {node: None for node in all_nodes}
    
    g_score[start] = 0.0
    h_start = heuristic(start, end, w_min, min_edges)
    f_score[start] = h_start
    
    # Calculate all heuristics upfront for visualization
    heuristics = {}
    for node in all_nodes:
        heuristics[node] = heuristic(node, end, w_min, min_edges)
    
    open_set = [(f_score[start], start)]
    open_set_nodes = {start}
    closed_set = set()
    
    steps: List[Dict[str, Any]] = []
    step_idx = 0
    
    # Initial step
    pq_snapshot = [(f, n) for f, n in sorted(list(open_set))[:15]]
    steps.append({
        "step": step_idx,
        "current_node": None,
        "visited_nodes": list(closed_set),
        "open_nodes": list(open_set_nodes),
        "distances": {n: (None if g_score[n] == INF else g_score[n]) for n in sorted(all_nodes)},
        "f_scores": {n: (None if f_score[n] == INF else f_score[n]) for n in sorted(all_nodes)},
        "heuristics": heuristics,
        "predecessor": {n: prev[n] for n in sorted(all_nodes)},
        "priority_queue": pq_snapshot,
        "relaxation": None,
        "explanation": generate_explanation(None, None, False, 0, 0, 0, 0, 0, 0, 0),
        "pseudocode_line": 0,
        "path": []
    })
    step_idx += 1
    
    while open_set:
        f_current, current = heapq.heappop(open_set)
        
        # Skip stale entries
        if f_current > f_score[current]:
            continue
        
        # Remove from open set
        open_set_nodes.discard(current)
        
        # Add to closed set
        closed_set.add(current)
        
        # Log state after selecting current node
        pq_snapshot = [(f, n) for f, n in sorted(list(open_set))[:15]]
        tentative_path = _reconstruct_path(prev, end) if g_score.get(end, INF) < INF else []
        
        steps.append({
            "step": step_idx,
            "current_node": current,
            "visited_nodes": sorted(list(closed_set)),
            "open_nodes": sorted(list(open_set_nodes)),
            "distances": {n: (None if g_score[n] == INF else g_score[n]) for n in sorted(all_nodes)},
            "f_scores": {n: (None if f_score[n] == INF else f_score[n]) for n in sorted(all_nodes)},
            "heuristics": heuristics,
            "predecessor": {n: prev[n] for n in sorted(all_nodes)},
            "priority_queue": pq_snapshot,
            "relaxation": None,
            "explanation": generate_explanation(current, None, False, 0, 0, 0, 0, 0, 0, 0),
            "pseudocode_line": 5,
            "path": tentative_path
        })
        step_idx += 1
        
        # Early exit if reached goal
        if current == end:
            break
        
        # Explore neighbors
        for neighbor, weight in graph.get(current, {}).items():
            try:
                w = float(weight)
            except Exception:
                continue
            
            # Skip if neighbor already in closed set
            if neighbor in closed_set:
                continue
            
            tentative_g = g_score[current] + w
            old_g = g_score[neighbor]
            old_f = f_score[neighbor]
            h_neighbor = heuristics[neighbor]
            new_g = tentative_g
            new_f = new_g + h_neighbor
            
            improved = tentative_g < old_g
            
            relaxation_info = {
                "from": current,
                "to": neighbor,
                "old_g": old_g if old_g != INF else None,
                "new_g": new_g,
                "old_f": old_f if old_f != INF else None,
                "new_f": new_f,
                "h_value": h_neighbor,
                "weight": w,
                "improved": improved
            }
            
            # Update if improved
            if improved:
                g_score[neighbor] = new_g
                f_score[neighbor] = new_f
                prev[neighbor] = current
                
                # Add to open set if not already there
                if neighbor not in open_set_nodes:
                    heapq.heappush(open_set, (f_score[neighbor], neighbor))
                    open_set_nodes.add(neighbor)
            
            # Snapshot after each edge relaxation
            pq_snapshot = [(f, n) for f, n in sorted(list(open_set))[:15]]
            tentative_path = _reconstruct_path(prev, end) if g_score.get(end, INF) < INF else []
            
            steps.append({
                "step": step_idx,
                "current_node": current,
                "visited_nodes": sorted(list(closed_set)),
                "open_nodes": sorted(list(open_set_nodes)),
                "distances": {n: (None if g_score[n] == INF else g_score[n]) for n in sorted(all_nodes)},
                "f_scores": {n: (None if f_score[n] == INF else f_score[n]) for n in sorted(all_nodes)},
                "heuristics": heuristics,
                "predecessor": {n: prev[n] for n in sorted(all_nodes)},
                "priority_queue": pq_snapshot,
                "relaxation": relaxation_info,
                "explanation": generate_explanation(current, neighbor, improved, g_score[current], w, old_g, new_g, h_neighbor, old_f, new_f),
                "pseudocode_line": 10 if improved else 9,
                "path": tentative_path
            })
            step_idx += 1
    
    # Final path
    final_path = _reconstruct_path(prev, end)
    final_distance = g_score[end] if g_score[end] != INF else None
    
    # Final state
    steps.append({
        "step": step_idx,
        "current_node": None,
        "visited_nodes": sorted(list(closed_set)),
        "open_nodes": [],
        "distances": {n: (None if g_score[n] == INF else g_score[n]) for n in sorted(all_nodes)},
        "f_scores": {n: (None if f_score[n] == INF else f_score[n]) for n in sorted(all_nodes)},
        "heuristics": heuristics,
        "predecessor": {n: prev[n] for n in sorted(all_nodes)},
        "priority_queue": [],
        "relaxation": None,
        "explanation": "🎉 Hoàn thành! " + (f"Tìm thấy đường đi ngắn nhất: {' → '.join(final_path)}" if final_path else "Không tìm thấy đường đi."),
        "pseudocode_line": 14,
        "path": final_path
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
    
    result = astar(sample, "A", "D")
    print(f"Path: {result['path']}")
    print(f"Distance: {result['distance']}")
    print(f"Steps: {len(result['steps'])}")
    print(f"Time: {result['compute_time']:.2f}ms")
    
    # Kiểm tra heuristic values
    w_min = compute_min_weight(sample)
    min_edges = compute_min_edges_bfs(sample, "D")
    print(f"\nw_min: {w_min}")
    print(f"min_edges: {min_edges}")
    print(f"\nHeuristic values:")
    for node in sorted(sample.keys()):
        h = heuristic(node, "D", w_min, min_edges)
        print(f"  h({node} → D) = {w_min} × {min_edges.get(node, 'INF')} = {h}")
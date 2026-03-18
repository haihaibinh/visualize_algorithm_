import os
import json
import time
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional
from dijkstra_real import dijkstra_real
from bellmanford_real import bellmanford_real
from astar_real import astar_real
from dijkstra import dijkstra
from bellman_ford import bellman_ford
from astar import astar

import osmnx as ox
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

OSM_PATH = "haibatrung.osm"
FIXED_OSM_PATH = "haibatrung_fixed.osm"
ALLOWED_HIGHWAYS = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "service"
}

app = Flask(__name__)
CORS(app)

G = None #chứa đồ thị 
ADJ_MAP: Dict[Any, Dict[Any, float]] = {}
POSITIONS: Dict[Any, Dict[str, float]] = {}
GEOJSON_COMBINED = None
VALID_EDGES = set() 

def fix_osm_remove_bad_edges(input_path: str, output_path: str) -> bool:
    try:
        tree = ET.parse(input_path)
        root = tree.getroot()
    except Exception as e:
        print(f"❌ fix_osm_remove_bad_edges: cannot parse {input_path}: {e}")
        return False

    valid_nodes = set()
    for node in root.findall("node"):
        nid = node.get("id")
        if nid:
            valid_nodes.add(nid)

    removed = 0
    for way in list(root.findall("way")):
        nds = way.findall("nd")
        bad = any(nd.get("ref") not in valid_nodes for nd in nds)
        if bad:
            root.remove(way)
            removed += 1

    try:
        tree.write(output_path, encoding="utf-8")
        print(f"🔧 fix_osm_remove_bad_edges: removed {removed} way(s), wrote {output_path}")
        return True
    except Exception as e:
        print(f"❌ fix_osm_remove_bad_edges: failed to write {output_path}: {e}")
        return False


def build_adj_and_positions(graph) -> None:
    """
    🆕 Chỉ build adjacency map từ các edges thuộc main roads (ways)
    """
    global ADJ_MAP, POSITIONS, VALID_EDGES
    ADJ_MAP = {}
    POSITIONS = {}
    VALID_EDGES = set()

    for node, data in graph.nodes(data=True):
        POSITIONS[node] = {"x": data.get("x"), "y": data.get("y")}

    # 🆕 Lọc edges: chỉ lấy edges thuộc ALLOWED_HIGHWAYS
    def is_main(h):
        if h is None:
            return False
        if isinstance(h, (list, tuple)):
            return any(str(v).lower() in ALLOWED_HIGHWAYS for v in h)
        return str(h).lower() in ALLOWED_HIGHWAYS

    for u, v, key, data in graph.edges(keys=True, data=True):
        highway = data.get("highway")
        
        # 🆕 Chỉ thêm vào ADJ_MAP nếu thuộc main roads
        if is_main(highway):
            length = float(data.get("length", 1.0))
            ADJ_MAP.setdefault(u, {})[v] = length
            VALID_EDGES.add((u, v))  # Lưu lại edge hợp lệ

    print(f"🔗 ADJ_MAP built: {len(ADJ_MAP)} nodes, {len(VALID_EDGES)} valid edges (only main roads)")


def build_geojson_combined(graph) -> str:
    """
    Trả về GeoJSON kết hợp cả nodes và ways (edges)
    Chỉ lấy các phần tử nằm trên main roads (highways)
    """
    try:
        edges_gdf = ox.graph_to_gdfs(graph, nodes=False, edges=True)
        nodes_gdf = ox.graph_to_gdfs(graph, nodes=True, edges=False)
    except Exception as e:
        print("❌ build_geojson_combined: graph_to_gdfs failed:", e)
        return ""

    def is_main(h):
        if h is None:
            return False
        if isinstance(h, (list, tuple)):
            return any(str(v).lower() in ALLOWED_HIGHWAYS for v in h)
        return str(h).lower() in ALLOWED_HIGHWAYS

    # Filter main roads edges
    mask = edges_gdf["highway"].apply(is_main)
    filtered_edges = edges_gdf[mask]

    # Extract unique node IDs from filtered edges
    node_ids = set()
    for idx, row in filtered_edges.iterrows():
        if isinstance(idx, tuple):
            node_ids.add(idx[0])  # u
            node_ids.add(idx[1])  # v
        else:
            node_ids.add(row.name[0])
            node_ids.add(row.name[1])

    # Filter nodes
    filtered_nodes = nodes_gdf[nodes_gdf.index.isin(node_ids)]

    # Convert to GeoJSON
    try:
        nodes_geojson = json.loads(filtered_nodes.to_json())
        edges_geojson = json.loads(filtered_edges.to_json())
        
        # Combine features
        combined = {
            "type": "FeatureCollection",
            "features": nodes_geojson.get("features", []) + edges_geojson.get("features", [])
        }
        
        print(f"🗺️ GeoJSON built: {len(filtered_nodes)} nodes + {len(filtered_edges)} ways")
        return json.dumps(combined)
    except Exception as e:
        print("❌ build_geojson_combined: to_json failed:", e)
        return ""


def load_osm_graph():
    global G, GEOJSON_COMBINED
    if not os.path.exists(OSM_PATH):
        print(f"❌ OSM file not found: {OSM_PATH}")
        return

    try:
        # 🔧 Load with simplify=False to keep intermediate nodes
        G = ox.graph_from_xml(OSM_PATH, simplify=False)
    except Exception as e:
        print("❌ Lỗi load OSM:", e)
        if fix_osm_remove_bad_edges(OSM_PATH, FIXED_OSM_PATH):
            G = ox.graph_from_xml(FIXED_OSM_PATH, simplify=False)
        else:
            G = None
            return

    print("✅ Load OSM hoàn tất")
    print(f"→ Nodes: {len(G.nodes())}, Edges: {len(G.edges())}")

    build_adj_and_positions(G)
    GEOJSON_COMBINED = build_geojson_combined(G)


print("🔌 Starting Flask server: loading OSM graph...")
load_osm_graph()


@app.route("/")
def home():
    return send_from_directory(".", "index.html")


@app.route("/hanoi_map")
def hanoi_map():
    return send_from_directory(".", "hanoi_map.html")


@app.get("/map_data")
def map_data():
    """Returns combined GeoJSON with both nodes and ways"""
    if GEOJSON_COMBINED:
        return jsonify(json.loads(GEOJSON_COMBINED))
    return jsonify({"error": "Map data not available"}), 404


# ----------------------------
# Manual Graph Mode – /run_graph
# Sử dụng: dijkstra(), bellmanford(), astar()
# ----------------------------
@app.post("/run_graph")
def run_graph():
    t0 = time.perf_counter()
    data = request.get_json()

    adj = data["graph"]
    start = data["start"]
    end = data["end"]
    method = data.get("method", "dijkstra")
    positions = data.get("positions")

    try:
        if method == "dijkstra":
            result = dijkstra(adj, start, end)
        elif method == "bellman_ford":
            result = bellman_ford(adj, start, end)
        elif method == "astar":
            result = astar(adj, start, end, positions=positions)
        else:
            return jsonify({"error": "Invalid method"}), 400
    except Exception as e:
        return jsonify({"error": "Algorithm failed", "details": str(e)}), 500

    api_time = (time.perf_counter() - t0) * 1000

    if isinstance(result, dict):
        result["api_time"] = api_time
        result["mode"] = "manual_graph"
        return jsonify(result)

    path, dist, steps, algo_time = result
    return jsonify({
        "mode": "manual_graph",
        "path": path,
        "distance": dist,
        "steps": steps,
        "algorithm_time": algo_time,
        "api_time": api_time
    })


# ============================================================
# 🆕 OPTIMIZED /route - Chỉ sử dụng edges trong VALID_EDGES
# Hanoi Map Mode - Sử dụng: dijkstra_real(), bellmanford_real(), astar_real()
# ============================================================
@app.post("/route")
def route_api():
    if G is None:
        return jsonify({"error": "OSM graph not loaded"}), 503

    t0 = time.perf_counter()
    data = request.get_json()

    method = data.get("method", "dijkstra")

    # Ưu tiên sử dụng node IDs nếu có
    start_node = data.get("start_node")
    end_node = data.get("end_node")

    # Fallback: Tìm node từ lat/lon nếu không có node IDs
    if not start_node or not end_node:
        start_lat = data.get("start_lat")
        start_lon = data.get("start_lon")
        end_lat = data.get("end_lat")
        end_lon = data.get("end_lon")

        if not all([start_lat, start_lon, end_lat, end_lon]):
            return jsonify({
                "error": "Missing parameters",
                "details": "Either provide start_node/end_node or start_lat/start_lon/end_lat/end_lon"
            }), 400

        try:
            start_node = ox.distance.nearest_nodes(G, start_lon, start_lat)
            end_node = ox.distance.nearest_nodes(G, end_lon, end_lat)
            start_node = int(start_node)
            end_node = int(end_node)
            print(f"📍 Found nodes from coords: {start_node} -> {end_node}")
        except AttributeError:
            try:
                start_node = ox.nearest_nodes(G, start_lon, start_lat)
                end_node = ox.nearest_nodes(G, end_lon, end_lat)
                start_node = int(start_node)
                end_node = int(end_node)
                print(f"📍 Found nodes from coords (fallback): {start_node} -> {end_node}")
            except Exception as e:
                return jsonify({"error": "Nearest node error", "details": str(e)}), 500
        except Exception as e:
            return jsonify({"error": "Nearest node error", "details": str(e)}), 500
    else:
        start_node = int(start_node)
        end_node = int(end_node)
        print(f"✅ Using provided node IDs: {start_node} -> {end_node}")

    # Validate nodes exist in graph
    if start_node not in G.nodes():
        return jsonify({"error": f"Start node {start_node} not found in graph"}), 400
    if end_node not in G.nodes():
        return jsonify({"error": f"End node {end_node} not found in graph"}), 400

    # 🆕 Validate nodes có trong ADJ_MAP (có kết nối đến ways)
    if start_node not in ADJ_MAP and not any(start_node in neighbors for neighbors in ADJ_MAP.values()):
        return jsonify({"error": f"Start node {start_node} is not connected to any main roads"}), 400
    if end_node not in ADJ_MAP and not any(end_node in neighbors for neighbors in ADJ_MAP.values()):
        return jsonify({"error": f"End node {end_node} is not connected to any main roads"}), 400

    # Run algorithm
    try:
        if method == "dijkstra":
            res = dijkstra_real(ADJ_MAP, start_node, end_node)
        elif method == "bellman_ford":
            res = bellmanford_real(ADJ_MAP, start_node, end_node)
        elif method == "astar":
            res = astar_real(ADJ_MAP, POSITIONS, start_node, end_node)
        else:
            return jsonify({"error": "Invalid method"}), 400
    except Exception as e:
        return jsonify({"error": "Algorithm failed", "details": str(e)}), 500

    nodes_path = res.get("path", [])
    process = res.get("process", [])
    distance = res.get("distance", None)

    # 🆕 Validate path: tất cả các edges phải thuộc VALID_EDGES
    invalid_edges = []
    for i in range(len(nodes_path) - 1):
        u, v = nodes_path[i], nodes_path[i + 1]
        if (u, v) not in VALID_EDGES:
            invalid_edges.append((u, v))
    
    if invalid_edges:
        print(f"⚠️ Warning: Path contains {len(invalid_edges)} edges not in main roads")
        print(f"   Invalid edges: {invalid_edges[:5]}...")  # Show first 5

    # Build full geometry with intermediate nodes (chỉ từ valid edges)
    full_geometry = []
    
    for i in range(len(nodes_path) - 1):
        u = nodes_path[i]
        v = nodes_path[i + 1]
        
        # 🆕 Chỉ xử lý nếu edge hợp lệ
        if (u, v) not in VALID_EDGES:
            print(f"⚠️ Skipping invalid edge: {u} -> {v}")
            continue
        
        # Add start node
        if i == 0:
            data_u = G.nodes.get(u)
            if data_u:
                full_geometry.append([data_u["y"], data_u["x"]])
        
        # Get edge geometry (contains intermediate points)
        edge_found = False
        if G.has_edge(u, v):
            for key, edata in G[u][v].items():
                # OSMnx stores geometry in 'geometry' attribute
                if 'geometry' in edata:
                    geom = edata['geometry']
                    # Extract coordinates from LineString
                    for coord in geom.coords:
                        full_geometry.append([coord[1], coord[0]])  # lon, lat -> lat, lon
                    edge_found = True
                else:
                    # No geometry, just use end node
                    data_v = G.nodes.get(v)
                    if data_v:
                        full_geometry.append([data_v["y"], data_v["x"]])
                    edge_found = True
                break
        
        if not edge_found:
            # No edge found, use nodes directly
            data_v = G.nodes.get(v)
            if data_v:
                full_geometry.append([data_v["y"], data_v["x"]])

    # Build nodes info
    nodes_info = {}
    for node in nodes_path:
        data = G.nodes.get(node)
        if data:
            nodes_info[node] = {"lat": data["y"], "lon": data["x"]}
        else:
            pos = POSITIONS.get(node)
            if pos:
                nodes_info[node] = {"lat": pos["y"], "lon": pos["x"]}

    # Build edges list (chỉ valid edges)
    edges_info = []
    for u, v in zip(nodes_path[:-1], nodes_path[1:]):
        if (u, v) not in VALID_EDGES:
            continue
            
        found = False
        if G.has_edge(u, v):
            for key, edata in G[u][v].items():
                edges_info.append([u, v, {
                    "length": edata.get("length", None),
                    "highway": edata.get("highway", None)
                }])
                found = True
                break
        if not found:
            cost = ADJ_MAP.get(u, {}).get(v)
            edges_info.append([u, v, {"length": cost}])

    api_time = (time.perf_counter() - t0) * 1000

    print(f"📊 Path: {len(nodes_path)} nodes, Geometry: {len(full_geometry)} points, Valid edges: {len(edges_info)}")

    return jsonify({
        "path": nodes_path,
        "geometry": full_geometry,
        "process": process,
        "nodes": nodes_info,
        "edges": edges_info,
        "distance": distance,
        "algorithm_time": res.get("compute_time", None),
        "api_time": api_time,
        "start_node": start_node,
        "end_node": end_node,
        "invalid_edges_count": len(invalid_edges)  # 🆕 Thông báo số edge không hợp lệ
    })


# API tìm Node ID gần nhất từ tọa độ click
@app.route('/get_nearest_node', methods=['POST'])
def get_nearest_node():
    if G is None:
        return jsonify({"error": "Graph not loaded"}), 503
        
    data = request.get_json()
    lat = data.get('lat')
    lon = data.get('lon')
    
    if lat is None or lon is None:
        return jsonify({"error": "Missing lat or lon"}), 400

    try:
        node_id = ox.distance.nearest_nodes(G, lon, lat)
        node_id = int(node_id)
        
        # 🆕 Kiểm tra xem node có kết nối đến main roads không
        is_connected = node_id in ADJ_MAP or any(node_id in neighbors for neighbors in ADJ_MAP.values())
        
        print(f"✅ Found nearest node: {node_id} for ({lat}, {lon}) - Connected to main roads: {is_connected}")
        return jsonify({
            'node_id': node_id,
            'is_connected': is_connected
        })
        
    except AttributeError:
        try:
            node_id = ox.nearest_nodes(G, lon, lat)
            node_id = int(node_id)
            is_connected = node_id in ADJ_MAP or any(node_id in neighbors for neighbors in ADJ_MAP.values())
            print(f"✅ Found nearest node (fallback): {node_id} for ({lat}, {lon}) - Connected: {is_connected}")
            return jsonify({
                'node_id': node_id,
                'is_connected': is_connected
            })
        except Exception as e:
            print(f"❌ Fallback failed: {e}")
            return jsonify({"error": "Failed to find nearest node", "details": str(e)}), 500
            
    except Exception as e:
        print(f"❌ Error finding nearest node: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to find nearest node", "details": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
const $ = id => document.getElementById(id);

// Add map-mode class to body for styling
document.body.classList.add('map-mode');

const runBtn = $('runBtn'), resetVizBtn = $('resetVizBtn');
const algoSelect = $('algoSelect');
const statusBar = $('statusBar');
const toggleNodesBtn = $('toggleNodesBtn');
const toggleWaysBtn = $('toggleWaysBtn');

// ============================================================
// CACHE SYSTEM - In-memory cache (NO localStorage)
// ============================================================
class LRUCache {
    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }
}

const nodeCache = new LRUCache(500);

// Status bar helper
function statusMap(msg, ttl = 5000) {
    if (statusBar) statusBar.textContent = msg;
}

// Global variables
let map, nodeLayer, wayLayer;
let showNodes = true, showWays = false;
let startMarker = null, endMarker = null, routeLine = null;
let animationMarker = null;
let clickCount = 0;
let startNodeId = null, endNodeId = null;

// ============================================================
// OPTIMIZED - Fetch với cache (6 digits precision)
// ============================================================
async function fetchNearestNode(lat, lon) {
    // 🆕 Increased precision: 6 digits = ~11cm (was 4 digits = ~11m)
    const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    
    const cached = nodeCache.get(cacheKey);
    if (cached) {
        console.log('✅ Cache hit:', cacheKey);
        return cached;
    }

    try {
        const res = await fetch('http://127.0.0.1:5000/get_nearest_node', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lon })
        });

        if (!res.ok) return null;
        const data = await res.json();
        const nodeId = data.node_id;
        
        nodeCache.set(cacheKey, nodeId);
        console.log('💾 Cached:', cacheKey, '→', nodeId);
        
        return nodeId;
    } catch (err) {
        console.error("Nearest node error:", err);
        return null;
    }
}

// Result modal
const resultModal = $('resultModal');
if (resultModal) {
    const closeBtn = resultModal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            resultModal.classList.add('hidden');
        });
    }
}

function showResultModal(data) {
    if (!resultModal) return;
    
    const modalPath = $('modalPath');
    const modalDistance = $('modalDistance');
    const modalSteps = $('modalSteps');
    const modalTime = $('modalTime');
    
    if (modalPath) modalPath.textContent = `Đường đi (Node IDs): ${data.path ? data.path.join(' → ') : 'Không tìm thấy'}`;
    if (modalDistance) modalDistance.textContent = `Khoảng cách tổng: ${data.distance ? Math.round(data.distance) + 'm' : 'Không xác định'}`;
    if (modalSteps) modalSteps.textContent = `Số bước thuật toán: ${data.process ? data.process.length : 0}`;
    if (modalTime) modalTime.textContent = `Thời gian: Thuật toán ${Math.round(data.algorithm_time)}ms (API: ${Math.round(data.api_time)}ms)`;
    
    resultModal.classList.remove('hidden');
}

// ============================================================
// ANIMATION SYSTEM
// ============================================================
let currentAnimation = null;

function stopAnimation() {
    if (currentAnimation) {
        clearInterval(currentAnimation);
        currentAnimation = null;
    }
    if (animationMarker && map) {
        map.removeLayer(animationMarker);
        animationMarker = null;
    }
}

function animateRoute(coords, distance, duration = 3000) {
    stopAnimation();
    
    if (!coords || coords.length < 2 || !map) return;

    const steps = Math.min(coords.length * 5, 150);
    let currentStep = 0;

    const animationIcon = L.divIcon({
        className: 'animation-marker',
        html: '<div style="background: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(59,130,246,0.5);"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    animationMarker = L.marker(coords[0], { icon: animationIcon }).addTo(map);

    currentAnimation = setInterval(() => {
        const progress = currentStep / steps;
        const totalSegments = coords.length - 1;
        const exactPosition = progress * totalSegments;
        const segmentIndex = Math.floor(exactPosition);
        const segmentProgress = exactPosition - segmentIndex;

        if (segmentIndex >= coords.length - 1) {
            animationMarker.setLatLng(coords[coords.length - 1]);
            clearInterval(currentAnimation);
            currentAnimation = null;
            
            setTimeout(() => {
                if (animationMarker && map) {
                    map.removeLayer(animationMarker);
                    animationMarker = null;
                }
            }, 1000);
            return;
        }

        const start = coords[segmentIndex];
        const end = coords[segmentIndex + 1];
        const lat = start[0] + (end[0] - start[0]) * segmentProgress;
        const lon = start[1] + (end[1] - start[1]) * segmentProgress;

        animationMarker.setLatLng([lat, lon]);
        currentStep++;
    }, duration / steps);
}

// ============================================================
// WAIT FOR LEAFLET AND INITIALIZE MAP
// ============================================================
function waitForLeaflet(cb) {
    if (window.L) return cb();
    const to = setInterval(() => {
        if (window.L) {
            clearInterval(to);
            cb();
        }
    }, 50);
}

waitForLeaflet(async () => {
    const center = [21.0078, 105.8475];
    map = L.map('map').setView(center, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load map data with nodes and ways
    statusMap('Loading map data...');
    
    try {
        const resp = await fetch('http://localhost:5000/map_data');
        
        if (!resp.ok) {
            statusMap('Failed to load map data from server');
            return;
        }

        const geojson = await resp.json();
        
        if (!geojson || !geojson.features) {
            console.warn('Invalid GeoJSON data');
            statusMap('No map data available');
            return;
        }

        console.log('✅ GeoJSON loaded:', geojson.features.length, 'features');

        const nodeSet = new Set();
        const nodeCoords = new Map();
        const wayLines = [];

        geojson.features.forEach(feature => {
            if (feature.geometry.type === 'LineString') {
                // Store way for later
                wayLines.push(feature.geometry.coordinates);

                // Get all coordinates from the LineString
                feature.geometry.coordinates.forEach(coord => {
                    const key = `${coord[1]},${coord[0]}`; // lat,lon as key
                    if (!nodeSet.has(key)) {
                        nodeSet.add(key);
                        nodeCoords.set(key, [coord[1], coord[0]]); // [lat, lon]
                    }
                });
            } else if (feature.geometry.type === 'Point') {
                // Handle Point geometry directly
                const coord = feature.geometry.coordinates;
                const key = `${coord[1]},${coord[0]}`;
                if (!nodeSet.has(key)) {
                    nodeSet.add(key);
                    nodeCoords.set(key, [coord[1], coord[0]]);
                }
            }
        });

        console.log(`🔍 Found ${nodeCoords.size} unique nodes`);
        console.log(`🛣️ Found ${wayLines.length} ways`);

        // Create node layer (circle markers)
        nodeLayer = L.layerGroup();
        nodeCoords.forEach(([lat, lon]) => {
            L.circleMarker([lat, lon], {
                radius: 3,
                fillColor: '#3b82f6',
                color: '#1e40af',
                weight: 1,
                opacity: 0.7,
                fillOpacity: 0.5
            }).addTo(nodeLayer);
        });

        // Create way layer (polylines)
        wayLayer = L.layerGroup();
        wayLines.forEach(coords => {
            const latLngs = coords.map(c => [c[1], c[0]]);
            L.polyline(latLngs, {
                color: '#3b82f6',
                weight: 2,
                opacity: 0.6
            }).addTo(wayLayer);
        });

        // Add initial layer based on state
        if (showNodes) nodeLayer.addTo(map);
        if (showWays) wayLayer.addTo(map);

        statusMap('Map data loaded');

        // Toggle buttons
        if (toggleNodesBtn) {
            toggleNodesBtn.addEventListener('click', () => {
                showNodes = !showNodes;
                
                if (showNodes) {
                    nodeLayer.addTo(map);
                    toggleNodesBtn.classList.add('active');
                    toggleNodesBtn.textContent = 'Hide Nodes';
                } else {
                    map.removeLayer(nodeLayer);
                    toggleNodesBtn.classList.remove('active');
                    toggleNodesBtn.textContent = 'Show Nodes';
                }
            });
        }

        if (toggleWaysBtn) {
            toggleWaysBtn.addEventListener('click', () => {
                showWays = !showWays;
                
                if (showWays) {
                    wayLayer.addTo(map);
                    toggleWaysBtn.classList.add('active');
                    toggleWaysBtn.textContent = 'Hide Ways';
                } else {
                    map.removeLayer(wayLayer);
                    toggleWaysBtn.classList.remove('active');
                    toggleWaysBtn.textContent = 'Show Ways';
                }
            });
        }

    } catch (err) {
        console.error('❌ Failed to load map data:', err);
        statusMap('Error fetching map data');
    }

    // Clear selection helper
    function clearMapSelection() {
        if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
        if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
        if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
        stopAnimation();
        clickCount = 0;
        startNodeId = null;
        endNodeId = null;
    }

    // Map click handler
    map.on('click', async e => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;

        statusMap('🔍 Đang tìm node gần nhất...');
        const nodeId = await fetchNearestNode(lat, lon);

        if (!nodeId) {
            statusMap("❌ Không tìm được node gần nhất!");
            return;
        }

        clickCount++;

        if (clickCount === 1) {
            startNodeId = nodeId;
            if (startMarker) map.removeLayer(startMarker);
            
            const startIcon = L.divIcon({
                className: 'start-marker',
                html: '<div style="background: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            
            startMarker = L.marker(e.latlng, { icon: startIcon }).addTo(map)
                .bindPopup(`<b>Điểm bắt đầu</b><br>Node: ${nodeId}`).openPopup();
            statusMap(`✅ Điểm bắt đầu → Node ${nodeId}`);
        }
        else if (clickCount === 2) {
            endNodeId = nodeId;
            if (endMarker) map.removeLayer(endMarker);
            
            const endIcon = L.divIcon({
                className: 'end-marker',
                html: '<div style="background: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            
            endMarker = L.marker(e.latlng, { icon: endIcon }).addTo(map)
                .bindPopup(`<b>Điểm kết thúc</b><br>Node: ${nodeId}`).openPopup();
            statusMap(`✅ Điểm kết thúc → Node ${nodeId}. Nhấn "Run" để tìm đường!`);
        }
        else {
            clearMapSelection();
            clickCount = 1;
            startNodeId = nodeId;
            
            const startIcon = L.divIcon({
                className: 'start-marker',
                html: '<div style="background: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            
            startMarker = L.marker(e.latlng, { icon: startIcon }).addTo(map)
                .bindPopup(`<b>Điểm bắt đầu</b><br>Node: ${nodeId}`).openPopup();
            statusMap(`🔄 Reset → Node ${nodeId}`);
        }
    });

    // Double-click to clear
    map.on('dblclick', () => {
        clearMapSelection();
        statusMap('🗑️ Đã xóa selection');
    });

    // Reset button
    if (resetVizBtn) {
        resetVizBtn.addEventListener('click', () => {
            clearMapSelection();
            statusMap('🔄 Đã reset selection');
        });
    }

    // Run button
    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            if (!startMarker || !endMarker) {
                statusMap('⚠️ Vui lòng chọn điểm bắt đầu và kết thúc trên bản đồ');
                return;
            }

            if (!startNodeId || !endNodeId) {
                statusMap('❌ Lỗi: Không xác định được node ID');
                return;
            }

            const method = algoSelect?.value || 'dijkstra';
            statusMap('🚀 Đang tìm đường ngắn nhất...');

            stopAnimation();
            if (routeLine) map.removeLayer(routeLine);

            try {
                const body = {
                    start_node: startNodeId,
                    end_node: endNodeId,
                    method
                };

                console.log('📤 Sending request:', body);

                const res = await fetch('http://127.0.0.1:5000/route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ detail: res.statusText }));
                    statusMap(`❌ Lỗi: ${res.status} - ${err.error || err.detail || res.statusText}`);
                    return;
                }

                const data = await res.json();
                console.log('📥 Response:', data);

                if (!data.path || !data.path.length) {
                    statusMap('❌ Không tìm thấy đường đi');
                    showResultModal(data);
                    return;
                }

                // 🆕 USE GEOMETRY instead of path for accurate visualization
                const coords = data.geometry || data.path.map(id => {
                    const node = data.nodes[id];
                    return [node.lat, node.lon];
                });

                console.log(`📊 Path nodes: ${data.path.length}, Geometry points: ${coords.length}`);

                window.routeProcess = data.process || [];
                window.routePath = data.path;
                window.routeNodes = data.nodes;
                window.routeEdges = data.edges;

                routeLine = L.polyline(coords, { 
                    color: '#ef4444', 
                    weight: 5,
                    opacity: 0.8
                }).addTo(map);
                
                map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

                const distance = data.distance || 0;
                statusMap(`✅ Tìm thấy đường đi: ${data.path.length} nodes, ${coords.length} points, ${Math.round(distance)}m`);
                
                setTimeout(() => {
                    animateRoute(coords, distance);
                }, 300);

                showResultModal(data);

            } catch (err) {
                console.error(err);
                statusMap('❌ Lỗi kết nối - Kiểm tra backend có đang chạy?');
            }
        });
    }
});


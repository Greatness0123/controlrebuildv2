const { ipcRenderer } = window.electron;

let currentWorkflow = null;
let workflows = [];
let nodes = [];
let edges = [];
let isDragging = false;
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let activePort = null;
let currentView = 'node';
let scale = 1;
let animationFrameId = null;
let installedApps = [];

const canvas = document.getElementById('workflowCanvas');
const connectionsSvg = document.getElementById('connections');
const workflowList = document.getElementById('workflowList');
const activeWorkflowName = document.getElementById('activeWorkflowName');

// Initialize
async function init() {
    setupEventListeners();
    await loadWorkflows();
    detectTheme();
}

async function loadWorkflows() {
    workflows = await ipcRenderer.invoke('get-all-workflows');
    renderWorkflowList();
}

function renderWorkflowList() {
    workflowList.innerHTML = '';
    workflows.forEach(w => {
        const item = document.createElement('div');
        item.className = `workflow-item ${currentWorkflow && currentWorkflow.id === w.id ? 'active' : ''}`;
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                <input type="checkbox" class="toggle-wf" ${w.enabled ? 'checked' : ''} data-id="${w.id}" title="Enable/Disable">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${w.name}</span>
            </div>
            <div style="display: flex; gap: 4px;">
                <i class="fas fa-trash-alt delete-wf" data-id="${w.id}" title="Delete"></i>
            </div>
        `;
        item.onclick = (e) => {
            if (e.target.classList.contains('delete-wf')) {
                deleteWorkflow(w.id);
            } else if (e.target.classList.contains('toggle-wf')) {
                toggleWorkflow(w.id, e.target.checked);
            } else {
                selectWorkflow(w);
            }
        };
        workflowList.appendChild(item);
    });
}

async function toggleWorkflow(id, enabled) {
    const res = await ipcRenderer.invoke('toggle-workflow', id, enabled);
    if (res.success) {
        await loadWorkflows();
    }
}

async function deleteWorkflow(id) {
    if (confirm('Delete this workflow?')) {
        await ipcRenderer.invoke('delete-workflow', id);
        if (currentWorkflow && currentWorkflow.id === id) {
            currentWorkflow = null;
            nodes = [];
            edges = [];
            renderCanvas();
        }
        await loadWorkflows();
    }
}

function selectWorkflow(w) {
    currentWorkflow = w;
    nodes = w.nodes || [];
    edges = w.edges || [];
    activeWorkflowName.textContent = w.name;
    renderWorkflowList();
    renderCanvas();
}

function setupEventListeners() {
    document.getElementById('closeBtn').onclick = () => ipcRenderer.invoke('hide-window', 'workflow');
    document.getElementById('minimizeBtn').onclick = () => ipcRenderer.invoke('minimize-window');
    document.getElementById('maximizeBtn').onclick = () => ipcRenderer.invoke('maximize-window');

    document.getElementById('addWorkflowBtn').onclick = () => {
        document.getElementById('workflowModalOverlay').style.display = 'flex';
    };

    document.getElementById('cancelWorkflowBtn').onclick = () => {
        document.getElementById('workflowModalOverlay').style.display = 'none';
    };

    document.getElementById('confirmAddWorkflowBtn').onclick = createNewWorkflow;

    document.getElementById('toggleSidebarBtn').onclick = () => {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('collapsed');
        // Redraw connections after transition
        setTimeout(updateConnections, 350);
    };

    document.getElementById('nodeViewBtn').onclick = () => switchView('node');
    document.getElementById('listViewBtn').onclick = () => switchView('list');

    document.getElementById('addNodeBtn').onclick = () => {
        document.getElementById('nodeModalOverlay').style.display = 'flex';
    };

    document.getElementById('cancelNodeBtn').onclick = () => {
        document.getElementById('nodeModalOverlay').style.display = 'none';
    };

    document.getElementById('confirmAddNodeBtn').onclick = () => {
        const type = document.getElementById('nodeTypeSelect').value;
        addNode(type);
        document.getElementById('nodeModalOverlay').style.display = 'none';
    };

    document.getElementById('saveBtn').onclick = saveCurrentWorkflow;
    document.getElementById('runBtn').onclick = runCurrentWorkflow;

    document.getElementById('canvasContainer').onwheel = onWheel;

    document.getElementById('cancelAppPickerBtn').onclick = () => {
        document.getElementById('appPickerModalOverlay').style.display = 'none';
    };

    document.getElementById('appSearchInput').oninput = (e) => {
        renderAppList(e.target.value);
    };

    // Drag and drop for nodes
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function createNewWorkflow() {
    const name = document.getElementById('newWorkflowName').value;
    const keyword = document.getElementById('newWorkflowKeyword').value;

    if (name) {
        const newWf = {
            name,
            enabled: true,
            trigger: keyword ? { type: 'keyword', value: keyword.toLowerCase() } : { type: 'none' },
            nodes: [],
            edges: [],
            steps: []
        };
        saveWorkflow(newWf);
        document.getElementById('workflowModalOverlay').style.display = 'none';
        document.getElementById('newWorkflowName').value = '';
        document.getElementById('newWorkflowKeyword').value = '';
    } else {
        alert('Please enter a name for the workflow');
    }
}

async function saveWorkflow(wf) {
    const res = await ipcRenderer.invoke('save-workflow', wf);
    if (res.success) {
        await loadWorkflows();
        selectWorkflow(res.workflow);
    }
}

async function saveCurrentWorkflow() {
    if (!currentWorkflow) return;
    currentWorkflow.nodes = nodes;
    currentWorkflow.edges = edges;
    currentWorkflow.steps = generateStepsFromNodes();

    // Verify trigger still exists if it's a start node
    const hasStartNode = nodes.find(n => n.type.startsWith('start'));
    if (!hasStartNode) {
        currentWorkflow.trigger = { type: 'none' };
    }

    await saveWorkflow(currentWorkflow);
    alert('Workflow saved!');
}

function deleteNode(id) {
    nodes = nodes.filter(n => n.id !== id);
    edges = edges.filter(e => e.source !== id && e.target !== id);
    renderCanvas();
}

function generateStepsFromNodes() {
    if (edges.length === 0) {
        return nodes.filter(n => !n.type.startsWith('start')).map(n => ({ ...n.data, type: n.type }));
    }

    let orderedSteps = [];
    let visited = new Set();
    let queue = nodes.filter(n => n.type.startsWith('start')).map(n => n.id);

    // If no start nodes, start with all nodes that have no incoming edges
    if (queue.length === 0) {
        queue = nodes.filter(n => !edges.find(e => e.target === n.id)).map(n => n.id);
    }

    while (queue.length > 0) {
        let currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        let node = nodes.find(n => n.id === currentId);
        if (node && !node.type.startsWith('start')) {
            orderedSteps.push({
                type: node.type,
                value: node.data.value,
                description: node.data.description || ''
            });
        }

        let nextEdges = edges.filter(e => e.source === currentId);
        nextEdges.forEach(e => queue.push(e.target));
    }

    return orderedSteps;
}

function runCurrentWorkflow() {
    if (!currentWorkflow) return;
    ipcRenderer.invoke('execute-workflow', currentWorkflow.id);
    ipcRenderer.invoke('hide-window', 'workflow');
    ipcRenderer.invoke('show-window', 'chat');
}

function switchView(view) {
    currentView = view;
    document.getElementById('nodeViewBtn').classList.toggle('active', view === 'node');
    document.getElementById('listViewBtn').classList.toggle('active', view === 'list');

    document.getElementById('canvasContainer').style.display = view === 'node' ? 'block' : 'none';
    document.getElementById('addNodeBtn').style.display = view === 'node' ? 'flex' : 'none';
    document.getElementById('listView').style.display = view === 'list' ? 'block' : 'none';

    if (view === 'list') renderListView();
}

function renderListView() {
    const listView = document.getElementById('listView');
    listView.innerHTML = '';
    const steps = generateStepsFromNodes();
    steps.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'list-step';
        div.innerHTML = `
            <div style="width: 24px; height: 24px; border-radius: 12px; background: var(--accent-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px;">${i+1}</div>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 13px;">${s.type.toUpperCase()}: ${s.value}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${s.description}</div>
            </div>
        `;
        listView.appendChild(div);
    });
}

function addNode(type) {
    const id = 'node_' + Date.now();
    const newNode = {
        id,
        type,
        position: { x: 100, y: 100 },
        data: { value: '', description: '' }
    };
    nodes.push(newNode);
    renderCanvas();
}

function renderCanvas() {
    // Clear nodes except SVG
    const nodesInDom = canvas.querySelectorAll('.node');
    nodesInDom.forEach(n => n.remove());

    nodes.forEach(n => {
        const nodeEl = createNodeElement(n);
        canvas.appendChild(nodeEl);
    });

    updateConnections();
}

function createNodeElement(n) {
    const div = document.createElement('div');
    div.className = 'node';
    div.id = n.id;
    div.style.left = n.position.x + 'px';
    div.style.top = n.position.y + 'px';

    const iconMap = {
        start_time: 'fa-stopwatch',
        start_keyword: 'fa-bolt',
        app: 'fa-window-maximize',
        file: 'fa-file',
        document: 'fa-file-alt',
        web_search: 'fa-search',
        nl_task: 'fa-brain'
    };

        let contentHtml = `<input type="text" class="node-input" placeholder="Value..." value="${n.data.value || ''}">`;

        if (n.type === 'start_time') {
            contentHtml = `
                <input type="time" class="node-input" value="${n.data.value || '08:00'}">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; margin-top: 4px;">
                    ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `
                        <label style="font-size: 8px; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                            ${d}<input type="checkbox" class="day-check" data-day="${d}" ${n.data.days?.includes(d) ? 'checked' : ''}>
                        </label>
                    `).join('')}
                </div>
            `;
        } else if (n.type === 'web_search') {
            contentHtml = `<input type="text" class="node-input" placeholder="Search query or instruction..." value="${n.data.value || ''}">`;
        } else if (n.type === 'nl_task') {
            contentHtml = `<textarea class="node-textarea" placeholder="Describe the task for the AI..." style="width: 100%">${n.data.value || ''}</textarea>`;
        }

    const isStartNode = n.type.startsWith('start');
    const headerColor = isStartNode ? 'var(--accent-color)' : 'transparent';
    const textColor = isStartNode ? 'white' : 'inherit';

    div.innerHTML = `
        <div class="node-header" style="background: ${headerColor}; color: ${textColor}">
            <i class="fas ${iconMap[n.type] || 'fa-square'}"></i>
            <span style="flex: 1">${n.type.replace('_', ' ').toUpperCase()}</span>
            <i class="fas fa-times delete-node" style="font-size: 10px; cursor: pointer; opacity: 0.8"></i>
        </div>
        <div class="node-content">
            ${contentHtml}
            <div style="margin-top: 8px; display: flex; justify-content: space-between;">
                <button class="node-btn-pick" style="display: ${['app', 'file', 'document'].includes(n.type) ? 'block' : 'none'}">Pick</button>
            </div>
        </div>
        ${!n.type.startsWith('start') ? '<div class="node-port port-in"></div>' : ''}
        <div class="node-port port-out"></div>
    `;

    div.querySelector('.delete-node').onclick = (e) => {
        e.stopPropagation();
        deleteNode(n.id);
    };

    const input = div.querySelector('.node-input') || div.querySelector('.node-textarea');
    input.onchange = (e) => {
        n.data.value = e.target.value;
        if (n.type === 'start_keyword') currentWorkflow.trigger = { type: 'keyword', value: e.target.value.toLowerCase() };
        if (n.type === 'start_time') {
            const checks = div.querySelectorAll('.day-check:checked');
            const days = Array.from(checks).map(c => c.dataset.day);
            n.data.days = days;
            currentWorkflow.trigger = { type: 'time', value: e.target.value, days: days };
        }
    };

    if (n.type === 'start_time') {
        div.querySelectorAll('.day-check').forEach(cb => {
            cb.onchange = () => {
                const checks = div.querySelectorAll('.day-check:checked');
                const days = Array.from(checks).map(c => c.dataset.day);
                n.data.days = days;
                currentWorkflow.trigger = { type: 'time', value: input.value, days: days };
            };
        });
    }

    const pickBtn = div.querySelector('.node-btn-pick');
    if (pickBtn) {
        pickBtn.onclick = async () => {
            if (n.type === 'app') {
                showAppPicker((selectedApp) => {
                    const val = selectedApp.path || selectedApp.id;
                    input.value = selectedApp.name;
                    n.data.value = val;
                });
            } else {
                const res = await ipcRenderer.invoke('pick-item', n.type);
                if (res) {
                    input.value = res;
                    n.data.value = res;
                }
            }
        };
    }

    return div;
}

function onMouseDown(e) {
    const nodeEl = e.target.closest('.node');
    const portEl = e.target.closest('.node-port');

    if (portEl) {
        activePort = { el: portEl, nodeId: nodeEl.id, type: portEl.classList.contains('port-out') ? 'out' : 'in' };
        document.body.classList.add('connecting-node');
        return;
    }

    if (nodeEl) {
        isDragging = true;
        draggedElement = nodeEl;
        const rect = nodeEl.getBoundingClientRect();
        // Adjust drag offset for scale
        dragOffset.x = (e.clientX - rect.left);
        dragOffset.y = (e.clientY - rect.top);
        nodeEl.style.zIndex = 1000;
        document.body.classList.add('dragging-node');
    }
}

function onMouseMove(e) {
    if (!isDragging && !activePort) return;
    e.preventDefault();

    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    animationFrameId = requestAnimationFrame(() => {
        if (isDragging && draggedElement) {
            const containerRect = document.getElementById('canvasContainer').getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();

            // Calculate position relative to scaled canvas
            let x = (e.clientX - canvasRect.left - dragOffset.x) / scale;
            let y = (e.clientY - canvasRect.top - dragOffset.y) / scale;

            // Get current internal position to add delta
            const node = nodes.find(n => n.id === draggedElement.id);
            if (node) {
                node.position.x += x;
                node.position.y += y;

                draggedElement.style.left = node.position.x + 'px';
                draggedElement.style.top = node.position.y + 'px';
            }
            updateConnections();
        }
    });
}

function onMouseUp(e) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    document.body.classList.remove('dragging-node');
    document.body.classList.remove('connecting-node');

    if (isDragging && draggedElement) {
        draggedElement.style.zIndex = 10;
    }

    const portEl = e.target.closest('.node-port');
    if (activePort && portEl) {
        const targetNode = e.target.closest('.node');
        if (targetNode && targetNode.id !== activePort.nodeId) {
            const targetType = portEl.classList.contains('port-in') ? 'in' : 'out';
            if (activePort.type !== targetType) {
                const sourceId = activePort.type === 'out' ? activePort.nodeId : targetNode.id;
                const targetId = activePort.type === 'in' ? activePort.nodeId : targetNode.id;

                // Add edge
                if (!edges.find(edge => edge.source === sourceId && edge.target === targetId)) {
                    edges.push({ id: `e_${sourceId}_${targetId}`, source: sourceId, target: targetId });
                    updateConnections();
                }
            }
        }
    }

    isDragging = false;
    draggedElement = null;
    activePort = null;
}

function onWheel(e) {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(0.2, scale * delta), 2);

        // Zoom towards mouse position
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        scale = newScale;
        canvas.style.transform = `scale(${scale})`;
        canvas.style.transformOrigin = '0 0';

        updateConnections();
    }
}

function updateConnections() {
    connectionsSvg.innerHTML = '';
    const cRect = canvas.getBoundingClientRect();

    edges.forEach(edge => {
        const sourceNode = document.getElementById(edge.source);
        const targetNode = document.getElementById(edge.target);
        if (sourceNode && targetNode) {
            const sourcePort = sourceNode.querySelector('.port-out');
            const targetPort = targetNode.querySelector('.port-in');
            if (sourcePort && targetPort) {
                const sRect = sourcePort.getBoundingClientRect();
                const tRect = targetPort.getBoundingClientRect();

                // Divide by scale to get internal coordinates
                const x1 = (sRect.left - cRect.left + (5 * scale)) / scale;
                const y1 = (sRect.top - cRect.top + (5 * scale)) / scale;
                const x2 = (tRect.left - cRect.left + (5 * scale)) / scale;
                const y2 = (tRect.top - cRect.top + (5 * scale)) / scale;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const dx = Math.abs(x1 - x2) * 0.5;
                path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
                path.setAttribute('class', 'connection-line');
                connectionsSvg.appendChild(path);
            }
        }
    });
}

async function showAppPicker(onSelect) {
    if (installedApps.length === 0) {
        installedApps = await ipcRenderer.invoke('get-installed-apps');
    }
    renderAppList();
    document.getElementById('appPickerModalOverlay').style.display = 'flex';
    document.getElementById('appSearchInput').focus();
    window.onAppSelect = (app) => {
        onSelect(app);
        document.getElementById('appPickerModalOverlay').style.display = 'none';
    };
}

function renderAppList(filter = '') {
    const list = document.getElementById('appList');
    list.innerHTML = '';
    const filtered = installedApps.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));

    filtered.forEach(app => {
        const div = document.createElement('div');
        div.style.padding = '8px 12px';
        div.style.cursor = 'pointer';
        div.style.fontSize = '13px';
        div.style.borderBottom = '1px solid var(--border-color)';
        div.innerHTML = `<strong>${app.name}</strong><br><span style="font-size: 10px; opacity: 0.6">${app.path || app.id}</span>`;
        div.onclick = () => window.onAppSelect(app);
        div.onmouseover = () => div.style.background = 'var(--bg-tertiary)';
        div.onmouseout = () => div.style.background = 'transparent';
        list.appendChild(div);
    });
}

function detectTheme() {
    const updateTheme = (isDark) => {
        document.body.classList.toggle('dark-mode', isDark);
    };

    // Check initial preference
    ipcRenderer.invoke('get-settings').then(settings => {
        updateTheme(settings.theme === 'dark');
    });

    // Listen for changes
    ipcRenderer.on('settings-updated', (settings) => {
        updateTheme(settings.theme === 'dark');
    });
}

init();

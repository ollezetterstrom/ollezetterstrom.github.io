import { Logger } from './logger.js';

export const nodes = [];
export const edges = [];
let isSimulating = false;

const board = document.getElementById('board');
const linesLayer = document.getElementById('lines-layer');

/**
 * Calculates the ideal starting position for a new word to prevent physics explosions.
 * @param {Array} linkedNodes - An array of the actual node objects this new word connects to.
 * @param {Object} centerPoint - The X/Y coordinates of the center of your screen/board.
 * @returns {Object} { x, y } coordinates for the new node.
 */
export function getIdealSpawnPosition(linkedNodes, centerPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) {
    
    // Add a tiny random jitter (±20px) so if two nodes spawn in the exact 
    // same spot, they don't perfectly overlap and cause a physics glitch.
    const jitter = () => (Math.random() - 0.5) * 40;

    // SCENARIO 1: ISOLATED WORD (No links)
    // If it doesn't connect to anything, don't spawn it in the middle where it gets in the way.
    // Spawn it in a random orbit around the outer edge of the screen.
    if (!linkedNodes || linkedNodes.length === 0) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 300 + (Math.random() * 150); // Outer orbit distance
        
        return {
            x: centerPoint.x + (Math.cos(angle) * radius) + jitter(),
            y: centerPoint.y + (Math.sin(angle) * radius) + jitter()
        };
    }

    // SCENARIO 2: CONNECTED WORD (1 or more links)
    // Calculate the "Center of Mass" (average X and Y) of all connected nodes.
    let sumX = 0;
    let sumY = 0;

    for (const node of linkedNodes) {
        sumX += node.x; 
        sumY += node.y;
    }

    const avgX = sumX / linkedNodes.length;
    const avgY = sumY / linkedNodes.length;

    return {
        x: avgX + jitter(),
        y: avgY + jitter()
    };
}

export function clearPhysics() {
    Logger.debug("Clearing physics state...");
    nodes.length = 0;
    edges.length = 0;

    // Remove all DOM nodes except the background dots and lines layer
    const domNodes = board.querySelectorAll('.node');
    domNodes.forEach(n => n.remove());

    // Clear all SVG lines
    linesLayer.innerHTML = '';
    isSimulating = false;
}

export function createNode(word, startX, startY, isCore = false) {
    const el = document.createElement('div');
    el.className = `node active ${isCore ? 'core' : ''}`;
    el.innerText = word;
    board.appendChild(el);

    const node = { word, x: startX, y: startY, vx: 0, vy: 0, el: el, isCore: isCore };
    nodes.push(node);

    wakeSimulation();
    return node;
}

export function createEdge(source, target, weight) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const opacity = Math.min(1, (weight - 30) / 50 + 0.2);

    el.setAttribute('stroke', `rgba(0, 87, 255, ${opacity})`);
    el.setAttribute('stroke-width', (weight > 50) ? '3' : '1.5');

    linesLayer.appendChild(el);
    edges.push({ source, target, weight, el });
    wakeSimulation();
}

export function wakeSimulation() {
    if (!isSimulating) {
        isSimulating = true;
        requestAnimationFrame(simulationLoop);
    }
}

function simulationLoop() {
    // 1. Repulsion
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            let dx = nodes[i].x - nodes[j].x;
            let dy = nodes[i].y - nodes[j].y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;

            let force = 4500 / (dist * dist);

            let fx = (dx / dist) * force;
            let fy = (dy / dist) * force;

            nodes[i].vx += fx; nodes[i].vy += fy;
            nodes[j].vx -= fx; nodes[j].vy -= fy;
        }
    }

    // 2. Attraction
    for (let edge of edges) {
        let dx = edge.target.x - edge.source.x;
        let dy = edge.target.y - edge.source.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        let targetDist = 250 - (edge.weight * 1.5);
        let force = (dist - targetDist) * 0.005 * (edge.weight / 50);

        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;

        edge.source.vx += fx; edge.source.vy += fy;
        edge.target.vx -= fx; edge.target.vy -= fy;
    }

    // 3. Centering Gravity & Friction
    let totalKineticEnergy = 0;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    for (let node of nodes) {
        node.vx += (centerX - node.x) * 0.0005;
        node.vy += (centerY - node.y) * 0.0005;

        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;

        node.el.style.left = `${node.x}px`;
        node.el.style.top = `${node.y}px`;

        totalKineticEnergy += Math.abs(node.vx) + Math.abs(node.vy);
    }

    // 4. Update SVG Lines
    for (let edge of edges) {
        edge.el.setAttribute('x1', edge.source.x);
        edge.el.setAttribute('y1', edge.source.y);
        edge.el.setAttribute('x2', edge.target.x);
        edge.el.setAttribute('y2', edge.target.y);
    }

    if (totalKineticEnergy > 0.5) {
        requestAnimationFrame(simulationLoop);
    } else {
        isSimulating = false;
    }
}
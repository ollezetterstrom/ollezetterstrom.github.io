import { pipeline, cos_sim } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
import { createNode, createEdge, nodes, edges, wakeSimulation, clearPhysics, getIdealSpawnPosition } from './physics.js';
import { Logger } from './logger.js';
import { runAnimeCutscene } from './cutscene.js';
import { generateSmartHint } from './hint.js';
import { SFX } from './audio.js';

const MINIMUM_SCORE = 42.0;
let extractor = null;
let validWordsSet = new Set();      // The massive dictionary for player inputs
let targetWordsArray = [];          // The common 10k dictionary for target words
let gameWon = false;
let isHinting = false; // RESTORED
let panzoomInstance = null;

const canvasContainer = document.getElementById('canvas-container');
const board = document.getElementById('board');
const inputEl = document.getElementById('wordInput');
const btnEl = document.getElementById('addWordBtn');
const hintBtn = document.getElementById('hintBtn'); // NEW
const newGameBtn = document.getElementById('newGameBtn');
const statusText = document.getElementById('status-text');
const errorMsg = document.getElementById('error-msg');
const historyLog = document.getElementById('history-log');

async function initGame() {
    try {
        Logger.info("Initializing Game Engine...");

        // UPGRADED: Tweaked step for smoother wheel zooming
        panzoomInstance = Panzoom(board, {
            maxScale: 3.5,
            minScale: 0.15,
            step: 0.8
        });

        canvasContainer.addEventListener('wheel', panzoomInstance.zoomWithWheel);

        Logger.debug("Downloading/Loading AI Model...");
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        Logger.debug("Fetching exhaustive dictionary...");
        const fullResponse = await fetch('https://cdn.jsdelivr.net/gh/dwyl/english-words@master/words_alpha.txt');
        const fullText = await fullResponse.text();
        const fullDict = fullText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        validWordsSet = new Set(fullDict);

        Logger.debug("Fetching 10k common words list...");
        const commonResponse = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const commonText = await commonResponse.text();
        const commonDict = commonText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

        targetWordsArray = commonDict.filter(w => w.length >= 4 && w.length <= 8);

        Logger.success("Engine Ready!");
        startNewRound();

        inputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') processNewWord(); });
        btnEl.addEventListener('click', () => processNewWord());
        newGameBtn.addEventListener('click', startNewRound);

        setupCameraControls(); // INITIALIZE NEW CONTROLS

    } catch (error) {
        Logger.error("Failed to load engine", error);
        statusText.innerHTML = "❌ Error loading engine.";
    }
}

// ==========================================
// NEW: CAMERA & QoL CONTROLS
// ==========================================
function recenterCamera() {
    if (panzoomInstance) {
        // Passing { animate: true } creates that satisfying glide effect
        panzoomInstance.zoom(1, { animate: true });
        panzoomInstance.pan(0, 0, { animate: true });
    }
}

function setupCameraControls() {
    // 1. Hook up the UI buttons
    document.getElementById('zoomInBtn').addEventListener('click', () => panzoomInstance.zoomIn({ animate: true }));
    document.getElementById('zoomOutBtn').addEventListener('click', () => panzoomInstance.zoomOut({ animate: true }));
    document.getElementById('recenterBtn').addEventListener('click', recenterCamera);

    // 2. Double click background to recenter
    canvasContainer.addEventListener('dblclick', (e) => {
        // Only trigger if clicking the empty canvas, not a node
        if (e.target === canvasContainer || e.target === board || e.target.classList.contains('dots-bg')) {
            recenterCamera();
        }
    });

    // 3. Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        // Input Box QoL: Clear and unfocus if they hit Escape while typing
        if (document.activeElement === inputEl) {
            if (e.key === 'Escape') {
                inputEl.value = '';
                inputEl.blur();
            }
            return; // Don't trigger camera controls while typing
        }

        const panStep = 60;
        const currentPan = panzoomInstance.getPan();

        switch (e.key) {
            // Panning (WASD or Arrows)
            case 'ArrowUp':
            case 'w':
            case 'W':
                panzoomInstance.pan(currentPan.x, currentPan.y + panStep, { animate: true });
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                panzoomInstance.pan(currentPan.x, currentPan.y - panStep, { animate: true });
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                panzoomInstance.pan(currentPan.x + panStep, currentPan.y, { animate: true });
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                panzoomInstance.pan(currentPan.x - panStep, currentPan.y, { animate: true });
                break;

            // Zooming (+ / -)
            case '=':
            case '+':
                panzoomInstance.zoomIn({ animate: true });
                break;
            case '-':
            case '_':
                panzoomInstance.zoomOut({ animate: true });
                break;

            // Recenter (Space)
            case ' ':
                e.preventDefault(); // Stop space from scrolling the page
                recenterCamera();
                break;
        }
    });
}

function startNewRound() {
    Logger.divider();
    Logger.info("Starting New Round...");

    // 1. Reset Game State
    gameWon = false;
    clearPhysics();
    historyLog.innerHTML = "";
    errorMsg.innerText = "";
    document.querySelector('.brand').classList.remove('win-text');

    // 2. Reset Camera to Center
    if (panzoomInstance) {
        panzoomInstance.zoom(1, { animate: true });
        panzoomInstance.pan(0, 0, { animate: true });
    }

    // 3. Pick New Target Words from the COMMON list
    const word1 = targetWordsArray[Math.floor(Math.random() * targetWordsArray.length)];
    let word2 = targetWordsArray[Math.floor(Math.random() * targetWordsArray.length)];
    while (word1 === word2) word2 = targetWordsArray[Math.floor(Math.random() * targetWordsArray.length)];

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    createNode(word1, cx - 120, cy, true);
    createNode(word2, cx + 120, cy, true);

    Logger.success(`Target acquired: ${word1} -> ${word2}`);
    statusText.innerHTML = `✅ Ready!<br>Connect <b>${word1}</b> to <b>${word2}</b>.`;

    inputEl.disabled = false;
    btnEl.disabled = false;
    hintBtn.disabled = false; // NEW
    btnEl.innerText = "Add Word";
    inputEl.value = "";
    inputEl.focus();
}

async function processNewWord(overrideWord = null) {
    if (gameWon) return;

    const rawInput = overrideWord ? overrideWord.trim().toLowerCase() : inputEl.value.trim().toLowerCase();
    errorMsg.innerText = "";

    if (!rawInput) return;
    if (!validWordsSet.has(rawInput)) {
        Logger.warn(`Rejected: "${rawInput}" not in dictionary.`);
        SFX.playError();
        return errorMsg.innerText = `"${rawInput}" is not in the dictionary.`;
    }
    if (nodes.find(n => n.word === rawInput)) {
        Logger.warn(`Rejected: "${rawInput}" already on board.`);
        SFX.playError();
        return errorMsg.innerText = `"${rawInput}" is already on the board.`;
    }

    inputEl.disabled = true; btnEl.disabled = true; btnEl.innerText = "Thinking...";
    Logger.info(`Evaluating word: "${rawInput}"`);

    try {
        const inputEmbed = await extractor(rawInput, { pooling: 'mean', normalize: true });
        let validConnections = [];

        for (let existingNode of nodes) {
            const existingEmbed = await extractor(existingNode.word, { pooling: 'mean', normalize: true });
            const score = cos_sim(inputEmbed.data, existingEmbed.data) * 100;

            if (score >= MINIMUM_SCORE) {
                validConnections.push({ node: existingNode, score: score });
                Logger.debug(`Link found: ${existingNode.word} (${score.toFixed(1)}%)`);
            }
        }

        document.querySelectorAll('.node.active').forEach(el => el.classList.remove('active'));

        const spawnPos = getIdealSpawnPosition(validConnections.map(c => c.node));
        const newNode = createNode(rawInput, spawnPos.x, spawnPos.y, false);
        SFX.playSpawn();

        if (validConnections.length > 0) {
            newNode.el.classList.remove('isolated');
            validConnections.sort((a, b) => b.score - a.score);

            let subText = [];
            for (let conn of validConnections) {
                createEdge(newNode, conn.node, conn.score);
                SFX.playLinked();
                subText.push(`${conn.node.word} (${conn.score.toFixed(1)}%)`);
            }
            addToLog(rawInput, validConnections.length, validConnections[0].score.toFixed(1), subText.join(", "));
            Logger.success(`"${rawInput}" integrated. Links: ${validConnections.length}`);

            checkWinCondition();
        } else {
            newNode.el.classList.add('isolated');
            addToLog(rawInput, 0, "--", "Waiting for connections...");
            Logger.warn(`"${rawInput}" isolated. Score below threshold.`);
            SFX.playIsolated();
        }

        inputEl.value = "";
        inputEl.focus();

    } catch (error) {
        Logger.error("Processing Engine error", error);
        errorMsg.innerText = "Engine error.";
    } finally {
        if (!gameWon) {
            inputEl.disabled = false; btnEl.disabled = false; btnEl.innerText = "Add Word";
        }
    }
}

function checkWinCondition() {
    const coreNodes = nodes.filter(n => n.isCore);
    if (coreNodes.length < 2) return;

    const startNode = coreNodes[0];
    const targetNode = coreNodes[1];

    // Build Adjacency List
    const adjacency = new Map();
    nodes.forEach(n => adjacency.set(n, []));
    edges.forEach(e => {
        adjacency.get(e.source).push(e.target);
        adjacency.get(e.target).push(e.source);
    });

    // BFS Queue but we track the Parent Map to remember the path!
    const visited = new Map();
    visited.set(startNode, null);
    const queue = [startNode];

    let foundPath = false;

    while (queue.length > 0) {
        const current = queue.shift();

        if (current === targetNode) {
            foundPath = true;
            break;
        }

        const neighbors = adjacency.get(current) || [];
        for (let neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.set(neighbor, current);
                queue.push(neighbor);
            }
        }
    }

    if (foundPath) {
        // Reconstruct the winning path sequence
        const winningSequence = [];
        let curr = targetNode;
        while (curr !== null) {
            winningSequence.push(curr);
            curr = visited.get(curr);
        }
        winningSequence.reverse(); // Flip it so it goes Start -> Target

        triggerWin(winningSequence);
    }
}

function triggerWin(winningSequence) {
    gameWon = true;
    inputEl.disabled = true;
    btnEl.disabled = true;
    btnEl.innerText = "🎬 ANIMATING...";

    statusText.innerHTML = `🏆 <b>CONNECTION ESTABLISHED!</b><br>Executing cinematic...`;
    document.querySelector('.brand').classList.add('win-text');
    SFX.playWin();

    // Wait a brief second for the physics engine to settle the nodes
    setTimeout(() => {
        // Pass our path, panzoom library, and canvas to the director
        runAnimeCutscene(winningSequence, panzoomInstance, canvasContainer);
    }, 1000);
}



function addToLog(word, linkCount, bestScore, subText) {
    const log = document.getElementById('history-log');
    const item = document.createElement('div');
    item.className = 'log-item';

    if (linkCount > 0) {
        item.innerHTML = `
            <div class="log-main">
                <span><b>${word}</b> (${linkCount} link${linkCount > 1 ? 's' : ''})</span>
                <span class="log-score">${bestScore}%</span>
            </div>
            <div class="log-sub">Linked to: ${subText}</div>
        `;
    } else {
        item.innerHTML = `
            <div class="log-main log-isolated">
                <span><b>${word}</b> (Isolated)</span>
                <span>--</span>
            </div>
            <div class="log-sub log-isolated">${subText}</div>
        `;
    }
    log.insertBefore(item, log.firstChild);
}

function getConnectedComponent(startNode) {
    const visited = new Set();
    const queue = [startNode];
    visited.add(startNode);

    const adjacency = new Map();
    nodes.forEach(n => adjacency.set(n, []));
    edges.forEach(e => {
        adjacency.get(e.source).push(e.target);
        adjacency.get(e.target).push(e.source);
    });

    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = adjacency.get(current) || [];
        for (let neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return Array.from(visited);
}

window.addEventListener('DOMContentLoaded', initGame);

hintBtn.addEventListener('click', async () => {
    if (gameWon || isHinting) return;

    isHinting = true;
    hintBtn.disabled = true;
    hintBtn.innerText = "Calculating path... 0%";
    SFX.playHint();

    try {
        const coreNodes = nodes.filter(n => n.isCore);
        if (coreNodes.length < 2) throw new Error("Cores missing");

        const islandA = getConnectedComponent(coreNodes[0]);
        const islandB = getConnectedComponent(coreNodes[1]);

        // Check if already connected
        if (islandA.includes(coreNodes[1])) {
            errorMsg.innerText = "The path is already clear! Check the connections.";
            return;
        }

        const islandAWords = islandA.map(n => n.word);
        const islandBWords = islandB.map(n => n.word);

        const hintWord = await generateSmartHint(
            extractor,
            cos_sim,
            islandAWords,
            islandBWords,
            targetWordsArray,
            (progress) => {
                const percent = Math.floor(progress * 100);
                hintBtn.innerText = `Searching gap... ${percent}%`;
            }
        );

        if (hintWord) {
            Logger.info(`Spawning hint: ${hintWord}`);
            processNewWord(hintWord);
        } else {
            errorMsg.innerText = "Neural path blocked. Try exploring more first!";
        }

    } catch (e) {
        Logger.error("Smart Hint failed", e);
        errorMsg.innerText = "Hint engine exhausted.";
    } finally {
        hintBtn.innerText = "💡 Get Hint";
        hintBtn.disabled = false;
        isHinting = false;
    }
});
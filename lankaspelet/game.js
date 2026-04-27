import { pipeline, cos_sim } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
import { createNode, createEdge, nodes, edges, wakeSimulation, clearPhysics, getIdealSpawnPosition } from './physics.js';
import { Logger } from './logger.js';
import { runAnimeCutscene } from './cutscene.js';
import { generateSmartHint } from './hint.js';
import { SFX } from './audio.js';
import { CONFIG } from './config.js';
import { gameState, setExtractor, getGameState } from './state.js';

let extractor = null;

const canvasContainer = document.getElementById('canvas-container');
const board = document.getElementById('board');
const inputEl = document.getElementById('wordInput');
const btnEl = document.getElementById('addWordBtn');
const hintBtn = document.getElementById('hintBtn');
const newGameBtn = document.getElementById('newGameBtn');
const statusText = document.getElementById('status-text');
const errorMsg = document.getElementById('error-msg');
const historyLog = document.getElementById('history-log');

// ==========================================
// SMART INPUT FOCUS MANAGER
// ==========================================
class InputFocusManager {
    constructor(inputElement) {
        this.input = inputElement;
        this.wasFocused = false;
        this.focusRestoreScheduled = false;
        this.ignoreNextBlur = false;
        this.setupListeners();
    }

    setupListeners() {
        this.input.addEventListener('focus', () => {
            this.wasFocused = true;
        });

        this.input.addEventListener('blur', (e) => {
            if (this.ignoreNextBlur) {
                this.ignoreNextBlur = false;
                return;
            }
            if (this.wasFocused && !this.focusRestoreScheduled && !gameState.gameWon) {
                this.scheduleFocusRestore();
            }
        });

        this.input.addEventListener('input', () => {
            this.wasFocused = true;
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (this.input === document.activeElement && e.target !== this.input && e.target !== btnEl && e.target !== hintBtn) {
                this.wasFocused = true;
                this.ignoreNextBlur = true;
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                this.wasFocused = true;
            }
        });
    }

    scheduleFocusRestore() {
        if (this.focusRestoreScheduled) return;
        this.focusRestoreScheduled = true;

        requestAnimationFrame(() => {
            if (this.wasFocused && !gameState.gameWon && !this.input.disabled && document.activeElement !== this.input) {
                this.input.focus();
            }
            this.focusRestoreScheduled = false;
        });
    }

    keepFocus() {
        this.wasFocused = true;
    }
}

const inputFocusManager = new InputFocusManager(inputEl);

canvasContainer.addEventListener('click', (e) => {
    if (inputEl !== document.activeElement && inputEl.value.length > 0 && !gameState.gameWon) {
        inputFocusManager.keepFocus();
        inputEl.focus();
    }
});

// ==========================================
// SMART ZOOM HANDLER
// ==========================================
class SmartZoomHandler {
    constructor(panzoomInstance, container) {
        this.panzoom = panzoomInstance;
        this.container = container;
        this.scrollHistory = [];
        this.historyMaxLength = 10;
        this.pendingZoom = null;
        this.rafId = null;
        this.deviceType = 'mouse';
        this.accumulatedDelta = 0;
        this.setupWheelHandler();
        this.detectDeviceType();
    }

    detectDeviceType() {
        let samples = 0;
        const testWheel = (e) => {
            samples++;
            if (samples >= 3) {
                const avgDelta = this.scrollHistory.reduce((sum, s) => sum + Math.abs(s.delta), 0) / samples;
                this.deviceType = avgDelta < 40 ? 'trackpad' : 'mouse';
                this.scrollHistory = [];
                this.container.removeEventListener('wheel', testWheel, { passive: true });
            }
        };
        this.container.addEventListener('wheel', testWheel, { passive: true });
        setTimeout(() => {
            if (this.scrollHistory.length > 0) {
                const avgDelta = this.scrollHistory.reduce((sum, s) => sum + Math.abs(s.delta), 0) / this.scrollHistory.length;
                this.deviceType = avgDelta < 40 ? 'trackpad' : 'mouse';
            }
            this.scrollHistory = [];
        }, 300);
    }

    analyzeScrollPattern(deltaY) {
        this.scrollHistory.push({ delta: deltaY, time: performance.now() });
        if (this.scrollHistory.length > this.historyMaxLength) {
            this.scrollHistory.shift();
        }

        if (this.scrollHistory.length < 3) return this.deviceType;

        const recent = this.scrollHistory.slice(-5);
        const avgDelta = recent.reduce((sum, s) => sum + Math.abs(s.delta), 0) / recent.length;

        if (avgDelta < 35) return 'trackpad';
        if (avgDelta > 70) return 'mouse';

        return this.deviceType;
    }

    calculateStep(deltaY, deviceType) {
        const absDelta = Math.abs(deltaY);

        if (deviceType === 'trackpad') {
            this.accumulatedDelta += deltaY;
            const sensitivity = CONFIG.ZOOM.TRACKPAD_SENSITIVITY;
            const step = Math.abs(this.accumulatedDelta) * 0.001 * sensitivity;
            return Math.min(step, CONFIG.ZOOM.BASE_STEP * 3);
        }

        const normalized = Math.min(absDelta / 100, 1);
        return CONFIG.ZOOM.BASE_STEP * (0.5 + normalized);
    }

    setupWheelHandler() {
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();

            const deviceType = this.analyzeScrollPattern(e.deltaY);
            const step = this.calculateStep(e.deltaY, deviceType);

            if (deviceType === 'trackpad') {
                if (this.rafId) cancelAnimationFrame(this.rafId);

                this.rafId = requestAnimationFrame(() => {
                    this.panzoom.zoomWithWheel(e, { step: step });
                    this.accumulatedDelta = 0;
                    this.rafId = null;
                });
            } else {
                this.panzoom.zoomWithWheel(e, { step: step });
            }
        }, { passive: false });
    }
}

async function initGame() {
    try {
        Logger.info("Initializing Game Engine...");

        gameState.panzoomInstance = Panzoom(board, {
            maxScale: CONFIG.ZOOM.MAX_SCALE,
            minScale: CONFIG.ZOOM.MIN_SCALE,
            step: CONFIG.ZOOM.BASE_STEP,
            beforeMouseDown: (e) => {
                return inputEl === document.activeElement;
            }
        });

        const zoomHandler = new SmartZoomHandler(gameState.panzoomInstance, canvasContainer);

        Logger.debug("Downloading/Loading AI Model...");
        extractor = await pipeline('feature-extraction', CONFIG.AI.MODEL);
        setExtractor(extractor);

        Logger.debug("Fetching exhaustive dictionary...");
        const fullResponse = await fetch(CONFIG.DICTIONARY.FULL_URL);
        const fullText = await fullResponse.text();
        const fullDict = fullText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        gameState.validWordsSet = new Set(fullDict);

        Logger.debug("Fetching 10k common words list...");
        const commonResponse = await fetch(CONFIG.DICTIONARY.COMMON_URL);
        const commonText = await commonResponse.text();
        const commonDict = commonText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

        gameState.targetWordsArray = commonDict.filter(w => w.length >= CONFIG.DICTIONARY.MIN_WORD_LENGTH && w.length <= CONFIG.DICTIONARY.MAX_WORD_LENGTH);

        Logger.success("Engine Ready!");
        startNewRound();

        btnEl.addEventListener('click', () => processNewWord());
        newGameBtn.addEventListener('click', startNewRound);

        setupCameraControls();

    } catch (error) {
        Logger.error("Failed to load engine", error);
        statusText.innerHTML = "❌ Error loading engine.";
    }
}

// ==========================================
// CAMERA & QoL CONTROLS
// ==========================================
function recenterCamera() {
    if (gameState.panzoomInstance) {
        gameState.panzoomInstance.zoom(1, { animate: true });
        gameState.panzoomInstance.pan(0, 0, { animate: true });
    }
}

function setupCameraControls() {
    document.getElementById('zoomInBtn').addEventListener('click', () => gameState.panzoomInstance.zoomIn({ animate: true }));
    document.getElementById('zoomOutBtn').addEventListener('click', () => gameState.panzoomInstance.zoomOut({ animate: true }));
    document.getElementById('recenterBtn').addEventListener('click', recenterCamera);

    canvasContainer.addEventListener('dblclick', (e) => {
        if (e.target === canvasContainer || e.target === board || e.target.classList.contains('dots-bg')) {
            recenterCamera();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (document.activeElement === inputEl) {
            if (e.key === 'Escape') {
                inputEl.value = '';
                inputEl.blur();
            }
            return;
        }

        const panStep = CONFIG.ZOOM.PAN_STEP;
        const currentPan = gameState.panzoomInstance.getPan();

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                gameState.panzoomInstance.pan(currentPan.x, currentPan.y + panStep, { animate: true });
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                gameState.panzoomInstance.pan(currentPan.x, currentPan.y - panStep, { animate: true });
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                gameState.panzoomInstance.pan(currentPan.x + panStep, currentPan.y, { animate: true });
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                gameState.panzoomInstance.pan(currentPan.x - panStep, currentPan.y, { animate: true });
                break;
            case '=':
            case '+':
                gameState.panzoomInstance.zoomIn({ animate: true });
                break;
            case '-':
            case '_':
                gameState.panzoomInstance.zoomOut({ animate: true });
                break;
            case ' ':
                e.preventDefault();
                recenterCamera();
                break;
        }
    });
}

function startNewRound() {
    Logger.divider();
    Logger.info("Starting New Round...");

    gameState.gameWon = false;
    clearPhysics();
    historyLog.innerHTML = "";
    errorMsg.innerText = "";
    document.querySelector('.brand').classList.remove('win-text');

    if (gameState.panzoomInstance) {
        gameState.panzoomInstance.zoom(1, { animate: true });
        gameState.panzoomInstance.pan(0, 0, { animate: true });
    }

    const word1 = gameState.targetWordsArray[Math.floor(Math.random() * gameState.targetWordsArray.length)];
    let word2 = gameState.targetWordsArray[Math.floor(Math.random() * gameState.targetWordsArray.length)];
    while (word1 === word2) word2 = gameState.targetWordsArray[Math.floor(Math.random() * gameState.targetWordsArray.length)];

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    createNode(word1, cx - CONFIG.GAME.NODE_SPAWN_OFFSET_X, cy, true);
    createNode(word2, cx + CONFIG.GAME.NODE_SPAWN_OFFSET_X, cy, true);

    Logger.success(`Target acquired: ${word1} -> ${word2}`);
    statusText.innerHTML = `✅ Ready!<br>Connect <b>${word1}</b> to <b>${word2}</b>.`;

    inputEl.disabled = false;
    btnEl.disabled = false;
    hintBtn.disabled = false;
    btnEl.innerText = "Add Word";
    inputEl.value = "";
    inputFocusManager.keepFocus();
    inputEl.focus();
}

async function processNewWord(overrideWord = null) {
    if (gameState.gameWon) return;

    const rawInput = overrideWord ? overrideWord.trim().toLowerCase() : inputEl.value.trim().toLowerCase();
    errorMsg.innerText = "";

    if (!rawInput) return;
    if (!gameState.validWordsSet.has(rawInput)) {
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
        const inputEmbed = await extractor(rawInput, { pooling: CONFIG.AI.POOLING_STRATEGY, normalize: true });
        let validConnections = [];

        for (let existingNode of nodes) {
            const existingEmbed = await extractor(existingNode.word, { pooling: CONFIG.AI.POOLING_STRATEGY, normalize: true });
            const score = cos_sim(inputEmbed.data, existingEmbed.data) * 100;

            if (score >= CONFIG.GAME.MINIMUM_SCORE) {
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
        inputFocusManager.keepFocus();
        inputEl.focus();

    } catch (error) {
        Logger.error("Processing Engine error", error);
        errorMsg.innerText = "Engine error.";
    } finally {
        if (!gameState.gameWon) {
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
    gameState.gameWon = true;
    inputEl.disabled = true;
    btnEl.disabled = true;
    btnEl.innerText = "🎬 ANIMATING...";

    statusText.innerHTML = `🏆 <b>CONNECTION ESTABLISHED!</b><br>Executing cinematic...`;
    document.querySelector('.brand').classList.add('win-text');
    SFX.playWin();

    setTimeout(() => {
        runAnimeCutscene(winningSequence, gameState.panzoomInstance, canvasContainer);
    }, CONFIG.UI.WIN_ANIMATION_DELAY);
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
    if (gameState.gameWon || gameState.isHinting) return;

    gameState.isHinting = true;
    hintBtn.disabled = true;
    hintBtn.innerText = "Calculating path... 0%";
    SFX.playHint();

    try {
        const coreNodes = nodes.filter(n => n.isCore);
        if (coreNodes.length < 2) throw new Error("Cores missing");

        const islandA = getConnectedComponent(coreNodes[0]);
        const islandB = getConnectedComponent(coreNodes[1]);

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
            gameState.targetWordsArray,
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
        gameState.isHinting = false;
    }
});
import { pipeline, cos_sim } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
import { createNode, createEdge, nodes, edges, wakeSimulation, clearPhysics, getIdealSpawnPosition } from './physics.js';
import { Logger } from './logger.js';
import { runAnimeCutscene } from './cutscene.js';
import { generateSmartHint } from './hint.js';
import { SFX } from './audio.js';
import { CONFIG } from './config.js';
import { gameState, setExtractor } from './state.js';

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

async function initGame() {
    try {
        Logger.info("Initializing Game Engine...");

        gameState.panzoomInstance = Panzoom(board, {
            maxScale: CONFIG.ZOOM.MAX_SCALE,
            minScale: CONFIG.ZOOM.MIN_SCALE,
            step: 0.1,
            contain: 'outside',
            cursor: null
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (inputEl === document.activeElement && e.target !== inputEl && e.target !== btnEl && e.target !== hintBtn) {
                e.stopPropagation();
            }
        }, true);

        let zoomRaf = null;
        canvasContainer.addEventListener('wheel', (e) => {
            if (inputEl === document.activeElement) return;
            e.preventDefault();

            if (zoomRaf) cancelAnimationFrame(zoomRaf);
            
            zoomRaf = requestAnimationFrame(() => {
                const delta = -e.deltaY;
                const isTrackpad = Math.abs(e.deltaY) < 100 && Math.abs(e.deltaY) > 0;
                const step = isTrackpad ? 0.03 : 0.15;
                
                const zoom = delta > 0 ? step : -step;
                const currentScale = gameState.panzoomInstance.getScale();
                const newScale = Math.min(Math.max(currentScale + zoom, CONFIG.ZOOM.MIN_SCALE), CONFIG.ZOOM.MAX_SCALE);
                
                const rect = canvasContainer.getBoundingClientRect();
                const focalX = e.clientX - rect.left;
                const focalY = e.clientY - rect.top;
                
                gameState.panzoomInstance.zoom(newScale, { focalX, focalY });
                zoomRaf = null;
            });
        }, { passive: false });

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
        
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                processNewWord();
            }
        });

        newGameBtn.addEventListener('click', startNewRound);

        setupCameraControls();

    } catch (error) {
        Logger.error("Failed to load engine", error);
        statusText.innerHTML = "❌ Error loading engine.";
    }
}

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

        const currentPan = gameState.panzoomInstance.getPan();

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                gameState.panzoomInstance.pan(currentPan.x, currentPan.y + 60, { animate: true });
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                gameState.panzoomInstance.pan(currentPan.x, currentPan.y - 60, { animate: true });
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                gameState.panzoomInstance.pan(currentPan.x + 60, currentPan.y, { animate: true });
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                gameState.panzoomInstance.pan(currentPan.x - 60, currentPan.y, { animate: true });
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
    requestAnimationFrame(() => inputEl.focus());
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
        requestAnimationFrame(() => {
            if (!gameState.gameWon && !inputEl.disabled) {
                inputEl.focus();
            }
        });

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

    const adjacency = new Map();
    nodes.forEach(n => adjacency.set(n, []));
    edges.forEach(e => {
        adjacency.get(e.source).push(e.target);
        adjacency.get(e.target).push(e.source);
    });

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
        const winningSequence = [];
        let curr = targetNode;
        while (curr !== null) {
            winningSequence.push(curr);
            curr = visited.get(curr);
        }
        winningSequence.reverse();

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
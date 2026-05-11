const SERVER_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://ollezetterstrom-github-io.onrender.com';
const socket = io(SERVER_URL);
let currentRoom = '';
let isUserHost = false;
let countdownInterval = null;
let winScoreGoal = 100;

function showError(msg) {
    const box = document.getElementById('errorBox');
    box.textContent = msg;
    box.classList.add('visible');
    setTimeout(() => box.classList.remove('visible'), 4000);
}

function showScreen(id) {
    const isFullPage = id === 'game-screen' || id === 'gameover-screen';
    document.getElementById('mainHeader').style.display = isFullPage ? 'none' : 'flex';
    document.getElementById('pageWrap').style.display = isFullPage ? 'none' : 'flex';

    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    if (isFullPage) {
        document.getElementById('game-screen').style.display = id === 'game-screen' ? 'flex' : 'none';
        document.getElementById('gameover-screen').style.display = id === 'gameover-screen' ? 'flex' : 'none';
    } else {
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('gameover-screen').style.display = 'none';
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }
    document.getElementById('errorBox').classList.remove('visible');
}

function getUsername() {
    const v = document.getElementById('username').value.trim();
    return v || 'Player' + Math.floor(Math.random() * 1000);
}

function exitToHome() {
    window.location.reload();
}

function copyRoomUrl() {
    const text = currentRoom || document.getElementById('roomCodeDisplay').textContent;
    navigator.clipboard.writeText(text).catch(() => { });
    const c = document.getElementById('copyConfirm');
    if (c) { c.style.display = 'inline'; setTimeout(() => c.style.display = 'none', 2000); }
}

// ── HOME Actions
function createRoom() {
    socket.emit('createRoom', { username: getUsername(), difficulty: document.getElementById('diff').value });
}
function joinRoom() {
    const code = document.getElementById('roomCodeInput').value.trim();
    if (code.length !== 5) { showError('Room code must be 5 letters.'); return; }
    socket.emit('joinRoom', { roomId: code, username: getUsername() });
}

socket.on('errorMsg', showError);

socket.on('roomJoined', ({ roomId, isHost, settings }) => {
    currentRoom = roomId;
    isUserHost = isHost;
    document.getElementById('roomCodeDisplay').textContent = roomId;
    document.getElementById('roomUrlDisplay').textContent = roomId;
    document.getElementById('topbarRoomCode').textContent = roomId;

    // Populate Settings dock
    applySettingsUpdate(settings);
    const controls = ['setDiff', 'setWinScore', 'setRoundDelay'];
    controls.forEach(id => document.getElementById(id).disabled = !isUserHost);

    if (isHost) {
        document.getElementById('startBtn').style.display = 'flex';
        document.getElementById('waitingMsg').style.display = 'none';
    }
    showScreen('lobby-screen');
});

// ── Settings Synchronizer
function emitSettings() {
    if (!isUserHost) return;
    const diff = document.getElementById('setDiff').value;
    const score = document.getElementById('setWinScore').value;
    const delay = document.getElementById('setRoundDelay').value;
    socket.emit('updateSettings', {
        roomId: currentRoom,
        settings: { difficulty: diff, winScore: parseInt(score), roundDelay: parseInt(delay) }
    });
}
function applySettingsUpdate(settings) {
    document.getElementById('setDiff').value = settings.difficulty;
    document.getElementById('setWinScore').value = settings.winScore;
    document.getElementById('setRoundDelay').value = settings.roundDelay;
    winScoreGoal = settings.winScore;
    document.getElementById('topbarGoalText').textContent = `First to ${winScoreGoal} pts wins 🏁`;
    document.getElementById('gameoverSubText').textContent = `reached ${winScoreGoal} points first`;
}
socket.on('settingsUpdated', applySettingsUpdate);

// ── Sidebar resizing
const resizer = document.getElementById('sidebarResizer');
const sidebar = document.getElementById('gameSidebar');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = document.body.clientWidth - e.clientX;
    sidebar.style.width = newWidth + 'px';
});
document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = 'default';
    }
});

function buildSidebar(players) {
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    const ranks = ['🥇', '🥈', '🥉'];
    let html = '';
    sorted.forEach((p, i) => {
        const initial = p.username.charAt(0).toUpperCase();
        const pct = Math.min(100, Math.round((p.score / winScoreGoal) * 100));
        html += `
<div class="sidebar-player">
    <div class="sidebar-rank">${ranks[i] || (i + 1)}</div>
    <div class="sidebar-avatar">${initial}</div>
    <div class="sidebar-info">
        <div class="sidebar-name">${p.username}</div>
        <div class="sidebar-progress-track">
            <div class="sidebar-progress-fill" style="width:${pct}%"></div>
        </div>
    </div>
    <div class="sidebar-score">${p.score}</div>
</div>`;
    });
    document.getElementById('sidebarPlayers').innerHTML = html;
}

function buildLobbyList(players) {
    let html = '';
    Object.values(players).forEach(p => {
        const initial = p.username.charAt(0).toUpperCase();
        html += `<li><div class="player-avatar">${initial}</div>${p.username}<span class="player-score">${p.score} pts</span></li>`;
    });
    document.getElementById('lobbyPlayers').innerHTML = html;
}

socket.on('updatePlayers', (players) => {
    buildLobbyList(players);
    buildSidebar(players);
});

// ── GAME Actions
function startRound() {
    if (isUserHost) socket.emit('startRound', currentRoom);
}

function submitAnswer() {
    const answer = document.getElementById('answerInput').value;
    socket.emit('submitAnswer', { roomId: currentRoom, answer });
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').disabled = true;
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.textContent = '✓ Submitted!'; btn.style.background = '#16a34a';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('answerInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && !this.disabled) submitAnswer();
    });
});

socket.on('playWord', (word) => {
    document.getElementById('results-board').innerHTML = '';
    document.getElementById('countdownWrap').classList.remove('visible');
    document.getElementById('listenBanner').style.display = 'block';
    document.getElementById('topbarTargetWrap').style.display = 'none';
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

    const timerEl = document.getElementById('timerDisplay');
    timerEl.textContent = '🔊';
    timerEl.classList.remove('urgent');
    document.getElementById('timerLabel').textContent = 'listen carefully';

    const ansInput = document.getElementById('answerInput');
    const submitBtn = document.getElementById('submitBtn');
    ansInput.disabled = false; ansInput.value = '';
    submitBtn.disabled = false; submitBtn.textContent = 'Submit'; submitBtn.style.background = '';

    showScreen('game-screen');
    setTimeout(() => ansInput.focus(), 150);

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
});

socket.on('timer', (timeLeft) => {
    const el = document.getElementById('timerDisplay');
    el.textContent = timeLeft;
    document.getElementById('timerLabel').textContent = 'seconds left';
    document.getElementById('listenBanner').style.display = 'none';
    if (timeLeft <= 3) el.classList.add('urgent');
    else el.classList.remove('urgent');
});

socket.on('roundResults', ({ targetWord, results, players, nextRoundIn }) => {
    const timerEl = document.getElementById('timerDisplay');
    timerEl.textContent = '✅';
    timerEl.classList.remove('urgent');
    document.getElementById('timerLabel').textContent = 'Round Over!';
    document.getElementById('answerInput').disabled = true;
    document.getElementById('submitBtn').disabled = true;

    document.getElementById('topbarTargetWrap').style.display = 'flex';
    document.getElementById('topbarTargetWord').textContent =
        targetWord.charAt(0).toUpperCase() + targetWord.slice(1);

    buildSidebar(players);

    let html = '';
    results.forEach((r, i) => {
        const initial = r.username.charAt(0).toUpperCase();
        const displayGuess = r.answer === '' ? '(No Answer)' : r.answer.charAt(0).toUpperCase() + r.answer.slice(1);
        const badge = r.status === 'perfect' ? `✓ ${r.displayTime}` : r.status === 'close' ? `≈ ${r.displayTime}` : '✗';
        html += `
<div class="reveal-pill pill-${r.status}" style="animation-delay:${i * 0.07}s">
    <div class="pill-avatar">${initial}</div>
    <div class="pill-info">
        <div class="pill-name">${r.username}</div>
        <div class="pill-guess">${displayGuess}</div>
    </div>
    <div class="pill-badge">${badge}</div>
</div>`;
    });
    document.getElementById('results-board').innerHTML = html;

    if (nextRoundIn) {
        const wrap = document.getElementById('countdownWrap');
        const bar = document.getElementById('countdownBar');
        const lbl = document.getElementById('countdownLabel');
        wrap.classList.add('visible');
        bar.style.transition = 'none';
        bar.style.width = '100%';
        let secsLeft = nextRoundIn;
        lbl.textContent = `Next round in ${secsLeft}s…`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            bar.style.transition = `width ${nextRoundIn}s linear`;
            bar.style.width = '0%';
        }));
        countdownInterval = setInterval(() => {
            secsLeft--;
            if (secsLeft <= 0) {
                clearInterval(countdownInterval); countdownInterval = null;
                lbl.textContent = 'Starting…';
            } else {
                lbl.textContent = `Next round in ${secsLeft}s…`;
            }
        }, 1000);
    }
});

socket.on('gameOver', ({ winner, players }) => {
    document.getElementById('gameoverWinner').textContent = winner;
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('finalScores').innerHTML = sorted.map((p, i) =>
        `<li><span class="score-rank">${medals[i] || (i + 1)}</span><span class="score-name">${p.username}</span><span class="score-pts">${p.score} pts</span></li>`
    ).join('');

    document.getElementById('returnLobbyBtn').style.display = isUserHost ? 'block' : 'none';
    showScreen('gameover-screen');
});

// ── Game Over -> Return to Lobby Handlers
function returnToLobby() {
    socket.emit('returnToLobby', currentRoom);
}
socket.on('backToLobby', (settings) => {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    document.getElementById('countdownWrap').classList.remove('visible');
    applySettingsUpdate(settings);
    showScreen('lobby-screen');
});
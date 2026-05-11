const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://ollezetterstrom.github.io',
];

const io = new Server(server, {
    cors: {
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
                cb(null, true);
            } else {
                cb(null, true);
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

const rooms = {};

// ── Static files from public/
app.use(express.static('public'));

app.get('/:roomCode', (req, res, next) => {
    if (/^[A-Za-z]{5}$/.test(req.params.roomCode)) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', rooms: Object.keys(rooms).length });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Helpers
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function getEditDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }
    return matrix[b.length][a.length];
}

async function startRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.roundActive || room.gameOver) return;

    room.roundActive = true;
    room.answers = {};

    const fallback = ['developer', 'umbrella', 'calendar', 'mystery', 'champion', 'alchemy', 'fragment', 'whisper', 'jealous', 'cinnamon'];
    try {
        const res = await fetch(`https://random-word-api.herokuapp.com/word?number=1&diff=${room.settings.difficulty}`);
        const data = await res.json();
        room.currentWord = data[0].toLowerCase();
    } catch (e) {
        room.currentWord = fallback[Math.floor(Math.random() * fallback.length)];
    }

    io.to(roomId).emit('playWord', room.currentWord);
    room.roundStartTime = Date.now();

    let timeLeft = 7;
    const timer = setInterval(() => {
        io.to(roomId).emit('timer', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            endRound(roomId);
        }
        timeLeft--;
    }, 1000);
}

function endRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.roundActive = false;

    const targetWord = room.currentWord;
    const results = [];

    for (const [socketId, player] of Object.entries(room.players)) {
        const ansObj = room.answers[socketId] || { text: '', time: 7.0 };
        const answer = ansObj.text;
        const timeTaken = ansObj.time;

        const distance = getEditDistance(targetWord, answer);
        const maxLen = Math.max(targetWord.length, answer.length);
        const accuracy = maxLen === 0 ? 0 : 1 - (distance / maxLen);

        let status = 'wrong', displayTime = 'X', points = 0;

        if (answer === targetWord) {
            status = 'perfect';
            displayTime = timeTaken + 's';
            points = 5;
        } else if (accuracy >= 0.5 && answer.length > 0) {
            status = 'close';
            displayTime = timeTaken + 's';
            points = Math.round(accuracy * 3);
        }

        player.score += points;
        results.push({ username: player.username, answer, timeTaken, displayTime, status, points });
    }

    const statusRank = { perfect: 1, close: 2, wrong: 3 };
    results.sort((a, b) => {
        if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
        return a.timeTaken - b.timeTaken;
    });

    const winner = Object.values(room.players).find(p => p.score >= room.settings.winScore);

    if (winner) {
        room.gameOver = true;
        io.to(roomId).emit('roundResults', { targetWord, results, players: room.players, nextRoundIn: null });
        setTimeout(() => {
            io.to(roomId).emit('gameOver', { winner: winner.username, players: room.players });
        }, 3000);
        return;
    }

    io.to(roomId).emit('roundResults', {
        targetWord, results, players: room.players,
        nextRoundIn: room.settings.roundDelay
    });

    setTimeout(() => startRound(roomId), room.settings.roundDelay * 1000);
}

// ── Socket handlers
io.on('connection', (socket) => {

    socket.on('createRoom', ({ username, difficulty }) => {
        const roomId = generateRoomCode();
        socket.join(roomId);
        rooms[roomId] = {
            hostId: socket.id,
            players: {},
            settings: {
                difficulty: difficulty || 2,
                winScore: 100,
                roundDelay: 6
            },
            currentWord: '',
            answers: {},
            roundActive: false,
            gameOver: false
        };
        rooms[roomId].players[socket.id] = { username, score: 0 };
        socket.emit('roomJoined', { roomId, isHost: true, settings: rooms[roomId].settings });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        roomId = roomId.toUpperCase();
        if (!rooms[roomId]) return socket.emit('errorMsg', 'Room not found!');
        socket.join(roomId);
        rooms[roomId].players[socket.id] = { username, score: 0 };
        socket.emit('roomJoined', { roomId, isHost: false, settings: rooms[roomId].settings });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('updateSettings', ({ roomId, settings }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.settings = { ...room.settings, ...settings };
            io.to(roomId).emit('settingsUpdated', room.settings);
        }
    });

    socket.on('startRound', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.roundActive || room.hostId !== socket.id) return;
        startRound(roomId);
    });

    socket.on('submitAnswer', ({ roomId, answer }) => {
        const room = rooms[roomId];
        if (room && room.roundActive && !room.answers[socket.id]) {
            const timeTaken = ((Date.now() - room.roundStartTime) / 1000).toFixed(1);
            room.answers[socket.id] = { text: answer.toLowerCase().trim(), time: parseFloat(timeTaken) };
        }
    });

    // Handle return to lobby
    socket.on('returnToLobby', (roomId) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.gameOver = false;
            room.roundActive = false;
            for (let pid in room.players) {
                room.players[pid].score = 0;
            }
            io.to(roomId).emit('backToLobby', room.settings);
            io.to(roomId).emit('updatePlayers', room.players);
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                io.to(roomId).emit('updatePlayers', room.players);
                if (Object.keys(room.players).length === 0) delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log('🎮 SpellCheck Party → http://0.0.0.0:' + PORT));
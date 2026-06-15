const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// State
let db = {
  leaderboard: {}, // username -> score
  chatHistory: [], // array of { id, username, message, timestamp, isSystem }
  lastWinner: null // { username, score, timestamp }
};

// Load database
if (fs.existsSync(DATA_FILE)) {
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    db = JSON.parse(rawData);
    if (!db.leaderboard) db.leaderboard = {};
    if (!db.chatHistory) db.chatHistory = [];
    if (db.lastWinner === undefined) db.lastWinner = null;
  } catch (error) {
    console.error('Error loading database, resetting to default:', error);
  }
}

// Save database helper
let isDirty = false;
function saveDatabase() {
  if (!isDirty) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
    isDirty = false;
    console.log('Database auto-saved successfully.');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Auto-save every 5 seconds
const saveInterval = setInterval(saveDatabase, 5000);

// Graceful shutdown handler
function shutdown() {
  console.log('Shutdown initiated. Saving database...');
  clearInterval(saveInterval);
  saveDatabase();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Active connections tracker
const onlineUsers = new Map(); // socket.id -> username

// Matchmaking Lobby & Tournament state variables
let isLobbyActive = false;
let lobbyTimeLeft = 0;
let tournamentParticipants = []; // array of usernames (max 3)
let lobbyInterval = null;

let isTournamentActive = false;
let tournamentTimeLeft = 0;
let tournamentScores = {}; // username -> clicks in tournament
let tournamentInterval = null;

function getLeaderboard() {
  // Sort leaderboard descending and return top 10
  return Object.entries(db.leaderboard)
    .map(([username, score]) => ({ username, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Send initial state
  socket.emit('init', {
    leaderboard: getLeaderboard(),
    chatHistory: db.chatHistory.slice(-50), // Send last 50 messages
    onlineCount: io.engine.clientsCount,
    lastWinner: db.lastWinner,
    lobbyState: { isActive: isLobbyActive, timeLeft: lobbyTimeLeft, participants: tournamentParticipants },
    tournamentState: { isActive: isTournamentActive, timeLeft: tournamentTimeLeft, participants: tournamentParticipants, scores: tournamentScores }
  });

  // Broadcast online count to all clients
  io.emit('onlineCount', io.engine.clientsCount);

  // Handle user joining (register username)
  socket.on('join', (username) => {
    // Sanitize username
    const cleanUsername = username.trim().substring(0, 20) || 'Anonymous';
    
    // Check if username is already in online users for this socket
    onlineUsers.set(socket.id, cleanUsername);
    
    // Initialize user in leaderboard if not exists
    if (db.leaderboard[cleanUsername] === undefined) {
      db.leaderboard[cleanUsername] = 0;
      isDirty = true;
    }

    console.log(`${cleanUsername} joined the game.`);

    // Send updated leaderboard to all
    io.emit('leaderboardUpdate', getLeaderboard());

    // Broadcast system message
    const systemMsg = {
      id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      username: 'System',
      message: `${cleanUsername} joined the server!`,
      timestamp: Date.now(),
      isSystem: true
    };
    db.chatHistory.push(systemMsg);
    if (db.chatHistory.length > 100) db.chatHistory.shift();
    isDirty = true;
    io.emit('chatMessage', systemMsg);
  });

  // Handle Click
  socket.on('click', () => {
    const username = onlineUsers.get(socket.id);
    if (!username) return; // User hasn't joined properly

    // Increment click count
    db.leaderboard[username] = (db.leaderboard[username] || 0) + 1;
    isDirty = true;

    // Track score on tournament if active and player is registered as a participant
    if (isTournamentActive && tournamentParticipants.includes(username)) {
      tournamentScores[username] = (tournamentScores[username] || 0) + 1;
      io.emit('tournamentScoresUpdate', tournamentScores);
    }

    // Send immediate update to all users
    io.emit('leaderboardUpdate', getLeaderboard());
  });

  // Handle Chat Message
  socket.on('chatMessage', (messageText) => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;

    const cleanMsg = messageText.trim().substring(0, 200);
    if (cleanMsg.length === 0) return;

    const chatMsg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      username,
      message: cleanMsg,
      timestamp: Date.now(),
      isSystem: false
    };

    db.chatHistory.push(chatMsg);
    if (db.chatHistory.length > 100) db.chatHistory.shift();
    isDirty = true;

    io.emit('chatMessage', chatMsg);
  });

  // Handle Chat Unsend (Self)
  socket.on('unsendMessage', (messageId) => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;

    const index = db.chatHistory.findIndex(msg => msg.id === messageId);
    if (index === -1) return;

    const msg = db.chatHistory[index];
    // Verify ownership
    if (msg.username === username) {
      db.chatHistory.splice(index, 1);
      isDirty = true;
      io.emit('messageDeleted', messageId);
    }
  });

  // Handle Admin Delete Chat Message
  socket.on('adminDeleteMessage', ({ messageId, password }) => {
    if (password !== (process.env.ADMIN_PASSWORD || 'admin123')) {
      socket.emit('adminError', 'Password admin salah!');
      return;
    }
    const index = db.chatHistory.findIndex(msg => msg.id === messageId);
    if (index === -1) return;

    db.chatHistory.splice(index, 1);
    isDirty = true;
    io.emit('messageDeleted', messageId);
  });

  // Handle Admin Delete Player Score
  socket.on('adminDeletePlayer', ({ targetUsername, password }) => {
    if (password !== (process.env.ADMIN_PASSWORD || 'admin123')) {
      socket.emit('adminError', 'Password admin salah!');
      return;
    }
    if (db.leaderboard[targetUsername] !== undefined) {
      delete db.leaderboard[targetUsername];
      isDirty = true;

      // Broadcast updated leaderboard to all
      io.emit('leaderboardUpdate', getLeaderboard());

      // Broadcast system log message about the deletion
      const systemMsg = {
        id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        username: 'System',
        message: `Pemain "${targetUsername}" telah dihapus oleh Admin.`,
        timestamp: Date.now(),
        isSystem: true
      };
      db.chatHistory.push(systemMsg);
      if (db.chatHistory.length > 100) db.chatHistory.shift();
      io.emit('chatMessage', systemMsg);
    }
  });

  // Handle Public Open Tournament Lobby (15s matchmaking)
  socket.on('openTournamentLobby', () => {
    if (isTournamentActive || isLobbyActive) {
      socket.emit('tournamentError', 'Turnamen atau Lobby sedang berjalan!');
      return;
    }

    isLobbyActive = true;
    lobbyTimeLeft = 15;
    tournamentParticipants = [];
    isDirty = true;

    // Broadcast lobby opened to all clients
    io.emit('lobbyOpened', { timeLeft: lobbyTimeLeft, participants: tournamentParticipants });

    // Broadcast system message to chat
    const systemMsg = {
      id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      username: 'System',
      message: '📢 Lobby turnamen klik dibuka! Silakan gabung (maksimal 3 pemain). 📢',
      timestamp: Date.now(),
      isSystem: true
    };
    db.chatHistory.push(systemMsg);
    if (db.chatHistory.length > 100) db.chatHistory.shift();
    io.emit('chatMessage', systemMsg);

    // Lobby Interval timer
    lobbyInterval = setInterval(() => {
      lobbyTimeLeft--;
      io.emit('lobbyTick', lobbyTimeLeft);

      if (lobbyTimeLeft <= 0) {
        clearInterval(lobbyInterval);
        isLobbyActive = false;

        // Verify if we have at least 2 players
        if (tournamentParticipants.length >= 2) {
          startTournament();
        } else {
          // Canceled due to insufficient players
          io.emit('lobbyCanceled', 'Lobby dibatalkan karena kekurangan pemain (minimal 2 pemain).');
          tournamentParticipants = [];
          
          const systemMsg = {
            id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            username: 'System',
            message: '⏱️ Turnamen dibatalkan karena jumlah peserta kurang dari 2.',
            timestamp: Date.now(),
            isSystem: true
          };
          db.chatHistory.push(systemMsg);
          if (db.chatHistory.length > 100) db.chatHistory.shift();
          io.emit('chatMessage', systemMsg);
        }
      }
    }, 1000);
  });

  // Handle Public Join Tournament Lobby
  socket.on('joinTournamentLobby', () => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;

    if (!isLobbyActive) {
      socket.emit('tournamentError', 'Lobby pendaftaran belum dibuka!');
      return;
    }

    if (tournamentParticipants.includes(username)) {
      return; // Already registered
    }

    if (tournamentParticipants.length >= 3) {
      socket.emit('tournamentError', 'Lobby sudah penuh (maksimal 3 pemain)!');
      return;
    }

    tournamentParticipants.push(username);
    io.emit('lobbyUpdate', tournamentParticipants);

    // Matchmaking Capped: If reaches 3 players, start tournament immediately!
    if (tournamentParticipants.length === 3) {
      clearInterval(lobbyInterval);
      isLobbyActive = false;
      startTournament();
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    if (username) {
      console.log(`${username} disconnected.`);
      onlineUsers.delete(socket.id);

      const systemMsg = {
        id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        username: 'System',
        message: `${username} left the server.`,
        timestamp: Date.now(),
        isSystem: true
      };
      db.chatHistory.push(systemMsg);
      if (db.chatHistory.length > 100) db.chatHistory.shift();
      isDirty = true;
      io.emit('chatMessage', systemMsg);
    }
    
    // Broadcast updated online count
    io.emit('onlineCount', io.engine.clientsCount);
  });
});

function startTournament() {
  isTournamentActive = true;
  tournamentTimeLeft = 60;
  tournamentScores = {};
  
  // Set starting scores
  tournamentParticipants.forEach(p => {
    tournamentScores[p] = 0;
  });
  isDirty = true;

  io.emit('tournamentStart', { timeLeft: tournamentTimeLeft, participants: tournamentParticipants });

  // Broadcast system message
  const systemMsg = {
    id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    username: 'System',
    message: `🚨 Turnamen Klik Dimulai! Peserta: ${tournamentParticipants.join(', ')}. Klik secepat mungkin! 🚨`,
    timestamp: Date.now(),
    isSystem: true
  };
  db.chatHistory.push(systemMsg);
  if (db.chatHistory.length > 100) db.chatHistory.shift();
  io.emit('chatMessage', systemMsg);

  // Tournament countdown timer
  tournamentInterval = setInterval(() => {
    tournamentTimeLeft--;
    io.emit('tournamentTick', tournamentTimeLeft);

    if (tournamentTimeLeft <= 0) {
      clearInterval(tournamentInterval);
      isTournamentActive = false;

      // Determine winner among participants
      let winnerName = null;
      let highestScore = 0;

      Object.entries(tournamentScores).forEach(([username, score]) => {
        if (score > highestScore) {
          highestScore = score;
          winnerName = username;
        }
      });

      if (winnerName) {
        db.lastWinner = {
          username: winnerName,
          score: highestScore,
          timestamp: Date.now()
        };
        isDirty = true;

        io.emit('tournamentEnd', db.lastWinner);

        const winMsg = {
          id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          username: 'System',
          message: `🏆 Turnamen Selesai! Pemenangnya adalah "${winnerName}" dengan ${highestScore} klik dalam 1 menit!`,
          timestamp: Date.now(),
          isSystem: true
        };
        db.chatHistory.push(winMsg);
        if (db.chatHistory.length > 100) db.chatHistory.shift();
        io.emit('chatMessage', winMsg);
      } else {
        io.emit('tournamentEnd', null);

        const winMsg = {
          id: 'sys-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          username: 'System',
          message: '⏱️ Turnamen Selesai! Tidak ada pemenang karena tidak ada yang mengklik.',
          timestamp: Date.now(),
          isSystem: true
        };
        db.chatHistory.push(winMsg);
        if (db.chatHistory.length > 100) db.chatHistory.shift();
        io.emit('chatMessage', winMsg);
      }

      // Reset participants list
      tournamentParticipants = [];
    }
  }, 1000);
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

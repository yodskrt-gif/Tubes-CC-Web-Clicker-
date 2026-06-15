const socket = io();

// DOM Elements
const usernameModal = document.getElementById('username-modal');
const usernameForm = document.getElementById('username-form');
const usernameInput = document.getElementById('username-input');
const playerDisplayName = document.getElementById('player-display-name');
const playerScore = document.getElementById('player-score');
const quantumCore = document.getElementById('quantum-core');
const userCount = document.getElementById('user-count');
const leaderboardList = document.getElementById('leaderboard-list');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const logoutBtn = document.getElementById('logout-btn');

// Admin DOM Elements
const adminModal = document.getElementById('admin-modal');
const adminForm = document.getElementById('admin-form');
const adminPasswordInput = document.getElementById('admin-password-input');
const adminCloseBtn = document.getElementById('admin-close-btn');
const adminTrigger = document.getElementById('admin-trigger');
const adminActionBar = document.getElementById('admin-action-bar');

// Tournament Matchmaking & Score DOM Elements
const tournamentActionBar = document.getElementById('tournament-action-bar');
const openLobbyBtn = document.getElementById('open-lobby-btn');
const tournamentLobbyCard = document.getElementById('tournament-lobby-card');
const lobbyCountdown = document.getElementById('lobby-countdown');
const joinLobbyBtn = document.getElementById('join-lobby-btn');
const tournamentParticipantStatus = document.getElementById('tournament-participant-status');
const tournamentLiveList = document.getElementById('tournament-live-list');

// Hall of Fame & Tournament DOM
const hallOfFameBox = document.getElementById('hall-of-fame');
const hofWinnerName = document.getElementById('hof-winner-name');
const hofWinnerScore = document.getElementById('hof-winner-score');
const tournamentTimerCard = document.getElementById('tournament-timer-card');
const tournamentCountdown = document.getElementById('tournament-countdown');
const myTournamentScore = document.getElementById('my-tournament-score');

// State
let myUsername = localStorage.getItem('quantum_username') || '';
let localClicks = 0;
let isAdmin = false;
let adminPassword = '';
let lastRanks = {}; // username -> rank index (0-based) for animations

// Tournament Client State
let isLobbyActive = false;
let isTournamentRunning = false;
let isParticipant = false;
let lobbyParticipants = [];
let myTournamentClicks = 0;

// Admin Session Check
adminPassword = localStorage.getItem('admin_password') || '';
if (adminPassword) {
  isAdmin = true;
  adminTrigger.classList.add('active');
  adminActionBar.classList.remove('hidden');
}

// Connect to network or show register modal
if (myUsername) {
  usernameModal.classList.add('hidden');
  playerDisplayName.textContent = myUsername;
  socket.emit('join', myUsername);
} else {
  usernameModal.classList.remove('hidden');
}

// Username registration handler
usernameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (name.length >= 3 && name.length <= 15) {
    myUsername = name;
    localStorage.setItem('quantum_username', myUsername);
    usernameModal.classList.add('hidden');
    playerDisplayName.textContent = myUsername;
    socket.emit('join', myUsername);
  }
});

// Logout Handler
logoutBtn.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin keluar dan berganti akun?')) {
    localStorage.removeItem('quantum_username');
    // We can also clear admin password to be safe
    localStorage.removeItem('admin_password');
    location.reload();
  }
});

// Admin Panel Toggle
adminTrigger.addEventListener('click', () => {
  if (isAdmin) {
    // Log out admin
    isAdmin = false;
    adminPassword = '';
    localStorage.removeItem('admin_password');
    adminTrigger.classList.remove('active');
    adminActionBar.classList.add('hidden');
    location.reload(); // Reload to strip delete actions
  } else {
    adminModal.classList.remove('hidden');
  }
});

adminCloseBtn.addEventListener('click', () => {
  adminModal.classList.add('hidden');
});

adminForm.addEventListener('submit', (e) => {
  e.preventDefault();
  adminPassword = adminPasswordInput.value;
  localStorage.setItem('admin_password', adminPassword);
  isAdmin = true;
  adminTrigger.classList.add('active');
  adminActionBar.classList.remove('hidden');
  adminModal.classList.add('hidden');
  adminPasswordInput.value = '';
  location.reload(); // Reload to redraw interface with delete buttons
});

// Public Tournament Lobby Trigger
openLobbyBtn.addEventListener('click', () => {
  socket.emit('openTournamentLobby');
});

joinLobbyBtn.addEventListener('click', () => {
  socket.emit('joinTournamentLobby');
});

// Socket Events
socket.on('init', (data) => {
  // Setup rank cache
  lastRanks = {};
  data.leaderboard.forEach((item, index) => {
    lastRanks[item.username] = index;
  });

  // Render Leaderboard
  updateLeaderboardUI(data.leaderboard);
  
  // Render Chat History
  chatMessages.innerHTML = '';
  data.chatHistory.forEach(msg => appendChatMessage(msg));
  scrollToBottom();

  // Set online count
  userCount.textContent = data.onlineCount;

  // Render last winner to Hall of Fame
  updateHallOfFameUI(data.lastWinner);

  // Sync lobby state
  if (data.lobbyState && data.lobbyState.isActive) {
    isLobbyActive = true;
    tournamentLobbyCard.classList.remove('hidden');
    lobbyCountdown.textContent = `${data.lobbyState.timeLeft}s`;
    updateLobbyUI(data.lobbyState.participants);

    tournamentActionBar.classList.add('lobby-active');
    openLobbyBtn.disabled = true;
    openLobbyBtn.textContent = 'Lobby Sedang Dibuka...';
  } else {
    tournamentLobbyCard.classList.add('hidden');
  }

  // Sync tournament state
  if (data.tournamentState && data.tournamentState.isActive) {
    isTournamentRunning = true;
    document.querySelector('.game-panel').classList.add('tournament-mode');
    tournamentTimerCard.classList.remove('hidden');
    tournamentCountdown.textContent = `${data.tournamentState.timeLeft}s`;
    
    // Status (Participant vs Spectator)
    const isMeIn = data.tournamentState.participants.includes(myUsername);
    isParticipant = isMeIn;
    
    if (isMeIn) {
      tournamentParticipantStatus.textContent = 'Anda terdaftar sebagai peserta!';
      tournamentParticipantStatus.style.color = 'var(--color-cyan)';
      document.querySelector('.timer-scores-preview').style.display = 'block';
    } else {
      tournamentParticipantStatus.textContent = 'Menonton Turnamen (Anda tidak terdaftar)';
      tournamentParticipantStatus.style.color = 'var(--text-secondary)';
      document.querySelector('.timer-scores-preview').style.display = 'none';
    }

    // Sync live list
    tournamentLiveList.innerHTML = '';
    const scores = data.tournamentState.scores || {};
    data.tournamentState.participants.forEach(p => {
      const isSelf = p === myUsername;
      const score = scores[p] || 0;
      if (isSelf) {
        myTournamentClicks = score;
        myTournamentScore.textContent = myTournamentClicks;
      }
      const li = document.createElement('li');
      li.className = isSelf ? 'live-item-self' : 'live-item';
      li.innerHTML = `<span class="live-name">${escapeHTML(p)}${isSelf ? ' (Anda)' : ''}</span>: <span class="live-score">${score}</span>`;
      tournamentLiveList.appendChild(li);
    });

    tournamentActionBar.classList.add('tournament-active');
    openLobbyBtn.disabled = true;
    openLobbyBtn.textContent = 'Turnamen Sedang Berjalan...';
  } else {
    document.querySelector('.game-panel').classList.remove('tournament-mode');
    if (!isLobbyActive) {
      tournamentTimerCard.classList.add('hidden');
    }
  }

  // Update local score from server database state if available
  const myRecord = data.leaderboard.find(p => p.username === myUsername);
  if (myRecord) {
    localClicks = myRecord.score;
    playerScore.textContent = localClicks;
  }
});

socket.on('onlineCount', (count) => {
  userCount.textContent = count;
});

socket.on('leaderboardUpdate', (leaderboard) => {
  updateLeaderboardUI(leaderboard);
  
  // Sync local score with server state
  const myRecord = leaderboard.find(p => p.username === myUsername);
  if (myRecord) {
    localClicks = myRecord.score;
    playerScore.textContent = localClicks;
  }
});

socket.on('chatMessage', (msg) => {
  appendChatMessage(msg);
  scrollToBottom();
});

socket.on('messageDeleted', (messageId) => {
  const el = document.getElementById(messageId);
  if (el) {
    el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 1, 1)';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8) translateY(-15px)';
    setTimeout(() => {
      el.remove();
    }, 300);
  }
});

socket.on('adminError', (err) => {
  alert(err);
  // Reset admin token on failure
  isAdmin = false;
  adminPassword = '';
  localStorage.removeItem('admin_password');
  adminTrigger.classList.remove('active');
  adminActionBar.classList.add('hidden');
  location.reload();
});

// Lobby Sockets
socket.on('lobbyOpened', (data) => {
  isLobbyActive = true;
  isTournamentRunning = false;

  tournamentLobbyCard.classList.remove('hidden');
  tournamentTimerCard.classList.add('hidden');

  lobbyCountdown.textContent = `${data.timeLeft}s`;
  updateLobbyUI(data.participants);

  tournamentActionBar.classList.add('lobby-active');
  tournamentActionBar.classList.remove('tournament-active');
  openLobbyBtn.disabled = true;
  openLobbyBtn.textContent = 'Lobby Sedang Dibuka...';
});

socket.on('lobbyTick', (timeLeft) => {
  lobbyCountdown.textContent = `${timeLeft}s`;
});

socket.on('lobbyUpdate', (participants) => {
  updateLobbyUI(participants);
});

socket.on('lobbyCanceled', (message) => {
  alert(message);
  resetTournamentUI();
});

socket.on('tournamentError', (err) => {
  alert(err);
});

// Tournament Sockets
socket.on('tournamentStart', (data) => {
  isLobbyActive = false;
  isTournamentRunning = true;
  document.querySelector('.game-panel').classList.add('tournament-mode');
  myTournamentClicks = 0;
  myTournamentScore.textContent = '0';

  tournamentLobbyCard.classList.add('hidden');
  tournamentTimerCard.classList.remove('hidden');

  tournamentCountdown.textContent = `${data.timeLeft}s`;

  // Status (Participant vs Spectator)
  const isMeIn = data.participants.includes(myUsername);
  isParticipant = isMeIn;
  
  if (isMeIn) {
    tournamentParticipantStatus.textContent = 'Anda terdaftar sebagai peserta!';
    tournamentParticipantStatus.style.color = 'var(--color-cyan)';
    document.querySelector('.timer-scores-preview').style.display = 'block';
  } else {
    tournamentParticipantStatus.textContent = 'Menonton Turnamen (Anda tidak terdaftar)';
    tournamentParticipantStatus.style.color = 'var(--text-secondary)';
    document.querySelector('.timer-scores-preview').style.display = 'none';
  }

  // Reset live scoreboard list
  tournamentLiveList.innerHTML = '';
  data.participants.forEach(p => {
    const isSelf = p === myUsername;
    const li = document.createElement('li');
    li.id = `live-score-${p}`;
    li.className = isSelf ? 'live-item-self' : 'live-item';
    li.innerHTML = `<span class="live-name">${escapeHTML(p)}${isSelf ? ' (Anda)' : ''}</span>: <span class="live-score">0</span>`;
    tournamentLiveList.appendChild(li);
  });

  tournamentActionBar.classList.remove('lobby-active');
  tournamentActionBar.classList.add('tournament-active');
  openLobbyBtn.disabled = true;
  openLobbyBtn.textContent = 'Turnamen Sedang Berjalan...';
});

socket.on('tournamentTick', (timeLeft) => {
  tournamentCountdown.textContent = `${timeLeft}s`;
});

socket.on('tournamentScoresUpdate', (scores) => {
  const sorted = Object.entries(scores)
    .map(([username, score]) => ({ username, score }))
    .sort((a, b) => b.score - a.score);

  tournamentLiveList.innerHTML = '';
  sorted.forEach(({ username, score }) => {
    const isMe = username === myUsername;
    const li = document.createElement('li');
    li.className = isMe ? 'live-item-self' : 'live-item';
    li.innerHTML = `<span class="live-name">${escapeHTML(username)}${isMe ? ' (Anda)' : ''}</span>: <span class="live-score">${score}</span>`;
    tournamentLiveList.appendChild(li);
  });
});

socket.on('tournamentEnd', (winner) => {
  isTournamentRunning = false;
  resetTournamentUI();

  if (winner) {
    alert(`🏆 Turnamen Selesai!\nPemenangnya adalah: "${winner.username}" dengan ${winner.score} klik dalam 1 menit!`);
    updateHallOfFameUI(winner);
  } else {
    alert('⏱️ Turnamen Selesai!\nTidak ada yang mengklik selama turnamen berlangsung.');
  }
});

// UI Reset & Lobby Helpers
function resetTournamentUI() {
  isLobbyActive = false;
  isTournamentRunning = false;
  isParticipant = false;
  lobbyParticipants = [];
  myTournamentClicks = 0;

  document.querySelector('.game-panel').classList.remove('tournament-mode');
  tournamentLobbyCard.classList.add('hidden');
  tournamentTimerCard.classList.add('hidden');

  tournamentActionBar.classList.remove('lobby-active');
  tournamentActionBar.classList.remove('tournament-active');
  openLobbyBtn.disabled = false;
  openLobbyBtn.textContent = 'Buka Lobby Turnamen';
}

function updateLobbyUI(participants) {
  lobbyParticipants = participants;
  isParticipant = participants.includes(myUsername);

  for (let i = 1; i <= 3; i++) {
    const slotEl = document.querySelector(`.lobby-slot[data-slot="${i}"]`);
    if (!slotEl) continue;
    const nameEl = slotEl.querySelector('.slot-username');
    if (!nameEl) continue;
    
    if (i <= participants.length) {
      slotEl.classList.add('occupied');
      nameEl.textContent = participants[i - 1];
    } else {
      slotEl.classList.remove('occupied');
      nameEl.textContent = 'Kosong';
    }
  }

  if (isParticipant) {
    joinLobbyBtn.disabled = true;
    joinLobbyBtn.textContent = 'Sudah Bergabung';
  } else if (participants.length >= 3) {
    joinLobbyBtn.disabled = true;
    joinLobbyBtn.textContent = 'Lobby Penuh';
  } else {
    joinLobbyBtn.disabled = false;
    joinLobbyBtn.textContent = 'Gabung Turnamen';
  }
}

// Core Tap/Click Logic
quantumCore.addEventListener('click', (e) => {
  if (!myUsername) return;

  // Instant local visual feedback for global score
  localClicks++;
  playerScore.textContent = localClicks;

  // If tournament is active and player is a participant, increment local tournament score
  if (isTournamentRunning && isParticipant) {
    myTournamentClicks++;
    myTournamentScore.textContent = myTournamentClicks;
  }

  // Emit event to Node.js backend container
  socket.emit('click');

  // Trigger tactile shake effect
  quantumCore.classList.remove('shake-core');
  void quantumCore.offsetWidth; // Trigger reflow
  quantumCore.classList.add('shake-core');

  // Trigger floating visual effect
  createFloatingText(e);

  // Trigger juicy particle explosion
  createParticleBurst(e);
});

// Chat Send Form Logic
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text && myUsername) {
    socket.emit('chatMessage', text);
    chatInput.value = '';
    chatInput.focus();
  }
});

// UI Render Helpers
function updateLeaderboardUI(list) {
  leaderboardList.innerHTML = '';
  list.forEach((item, index) => {
    const rank = index + 1;
    const li = document.createElement('li');
    li.id = `leaderboard-user-${item.username}`;
    
    if (rank <= 3) {
      li.className = `rank-${rank}`;
    }

    // Rank change highlights
    const prevRank = lastRanks[item.username];
    if (prevRank !== undefined && index < prevRank) {
      li.classList.add(rank <= 3 ? 'rank-up-gold' : 'rank-up-cyan');
    }

    // Admin reset button
    let adminDeleteHtml = '';
    if (isAdmin) {
      adminDeleteHtml = `
        <button class="admin-delete-btn" onclick="deletePlayer('${item.username}')" title="Reset Player Data">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;
    }

    li.innerHTML = `
      <div class="player-info">
        <div class="rank-badge">${rank}</div>
        <span class="player-name">${escapeHTML(item.username)}</span>
        ${adminDeleteHtml}
      </div>
      <span class="player-score-val">${item.score}</span>
    `;
    leaderboardList.appendChild(li);
  });

  // Re-cache ranks
  lastRanks = {};
  list.forEach((item, index) => {
    lastRanks[item.username] = index;
  });
}

function updateHallOfFameUI(winner) {
  if (winner) {
    hofWinnerName.textContent = winner.username;
    hofWinnerScore.textContent = `${winner.score} Clicks (60s)`;
  } else {
    hofWinnerName.textContent = 'Belum Ada Juara';
    hofWinnerScore.textContent = 'Mulai turnamen untuk bersaing!';
  }
}

function appendChatMessage(msg) {
  const msgEl = document.createElement('div');
  msgEl.id = msg.id;
  
  if (msg.isSystem) {
    msgEl.className = 'chat-msg system';
    msgEl.innerHTML = `<span class="msg-content">${escapeHTML(msg.message)}</span>`;
  } else {
    const isSelf = msg.username === myUsername;
    msgEl.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
    
    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Self unsend message action
    let unsendBtnHtml = '';
    if (isSelf) {
      unsendBtnHtml = `
        <button class="msg-unsend-btn" onclick="unsendMessage('${msg.id}')" title="Unsend Message">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;
    }

    // Admin override delete message action
    let adminDeleteHtml = '';
    if (isAdmin && !isSelf) {
      adminDeleteHtml = `
        <button class="msg-unsend-btn" onclick="adminDeleteMessage('${msg.id}')" title="Admin Delete Message">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;
    }

    msgEl.innerHTML = `
      <span class="msg-sender">${escapeHTML(msg.username)}</span>
      <span class="msg-content">${escapeHTML(msg.message)}</span>
      <span class="msg-time">${formattedTime}</span>
      ${unsendBtnHtml}
      ${adminDeleteHtml}
    `;
  }
  
  chatMessages.appendChild(msgEl);
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createFloatingText(e) {
  const floating = document.createElement('span');
  floating.className = 'floating-text';
  floating.textContent = '+1';

  // Get Click Coordinates relative to the Clicker Core
  const rect = quantumCore.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  floating.style.left = `${x}px`;
  floating.style.top = `${y}px`;

  quantumCore.appendChild(floating);

  // Remove element after CSS float-up animation completes
  setTimeout(() => {
    floating.remove();
  }, 800);
}

function createParticleBurst(e) {
  const particleCount = 8;
  const colors = ['#00f2fe', '#7f56f3', '#f35588'];
  const rect = quantumCore.getBoundingClientRect();
  
  // Coordinates relative to core
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle-dot';
    
    // Setup random launch offsets
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 60;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    particle.style.color = color;
    particle.style.backgroundColor = color;
    
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;

    quantumCore.appendChild(particle);

    // Auto cleanup
    setTimeout(() => {
      particle.remove();
    }, 800);
  }
}

// Global action binding
window.unsendMessage = (messageId) => {
  socket.emit('unsendMessage', messageId);
};

window.adminDeleteMessage = (messageId) => {
  socket.emit('adminDeleteMessage', { messageId, password: adminPassword });
};

window.deletePlayer = (username) => {
  if (confirm(`Hapus seluruh data pemain "${username}" dari leaderboard?`)) {
    socket.emit('adminDeletePlayer', { targetUsername: username, password: adminPassword });
  }
};

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

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

// Admin DOM Elements
const adminModal = document.getElementById('admin-modal');
const adminForm = document.getElementById('admin-form');
const adminPasswordInput = document.getElementById('admin-password-input');
const adminCloseBtn = document.getElementById('admin-close-btn');
const adminTrigger = document.getElementById('admin-trigger');

// State
let myUsername = localStorage.getItem('quantum_username') || '';
let localClicks = 0;
let isAdmin = false;
let adminPassword = '';
let lastRanks = {}; // username -> rank index (0-based) for animations

// Admin Session Check
adminPassword = localStorage.getItem('admin_password') || '';
if (adminPassword) {
  isAdmin = true;
  adminTrigger.classList.add('active');
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

// Admin Panel Toggle
adminTrigger.addEventListener('click', () => {
  if (isAdmin) {
    // Log out admin
    isAdmin = false;
    adminPassword = '';
    localStorage.removeItem('admin_password');
    adminTrigger.classList.remove('active');
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
  adminModal.classList.add('hidden');
  adminPasswordInput.value = '';
  location.reload(); // Reload to redraw interface with delete buttons
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
  location.reload();
});

// Core Tap/Click Logic
quantumCore.addEventListener('click', (e) => {
  if (!myUsername) return;

  // Instant local visual feedback
  localClicks++;
  playerScore.textContent = localClicks;

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

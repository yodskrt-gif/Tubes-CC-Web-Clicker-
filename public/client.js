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

let myUsername = localStorage.getItem('quantum_username') || '';
let localClicks = 0;

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

// Socket Events
socket.on('init', (data) => {
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

// Core Tap/Click Logic
quantumCore.addEventListener('click', (e) => {
  if (!myUsername) return;

  // Instant local visual feedback
  localClicks++;
  playerScore.textContent = localClicks;

  // Emit event to Node.js backend container
  socket.emit('click');

  // Trigger floating visual effect
  createFloatingText(e);
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
    
    if (rank <= 3) {
      li.className = `rank-${rank}`;
    }

    li.innerHTML = `
      <div class="player-info">
        <div class="rank-badge">${rank}</div>
        <span class="player-name">${escapeHTML(item.username)}</span>
      </div>
      <span class="player-score-val">${item.score}</span>
    `;
    leaderboardList.appendChild(li);
  });
}

function appendChatMessage(msg) {
  const msgEl = document.createElement('div');
  
  if (msg.isSystem) {
    msgEl.className = 'chat-msg system';
    msgEl.innerHTML = `<span class="msg-content">${escapeHTML(msg.message)}</span>`;
  } else {
    const isSelf = msg.username === myUsername;
    msgEl.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
    
    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    msgEl.innerHTML = `
      <span class="msg-sender">${escapeHTML(msg.username)}</span>
      <span class="msg-content">${escapeHTML(msg.message)}</span>
      <span class="msg-time">${formattedTime}</span>
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

  // Get Click Coordinates relative to the Quantum Core element
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

// --- Global State Variables ---
let chats = []; 
let activeChat = null; 
let currentRenderIndex = 0;
const CHUNK_SIZE = 50; 

// --- DOM Elements ---
const fileInput = document.getElementById('file-input');
const loadingText = document.getElementById('loading');
const chatListContainer = document.getElementById('chat-list');
const welcomeScreen = document.getElementById('welcome-screen');
const activeChatScreen = document.getElementById('active-chat');
const chatContainer = document.getElementById('chat-container');
const scrollAnchor = document.getElementById('scroll-anchor');
const chatTitle = document.getElementById('chat-title');
const headerAvatar = document.getElementById('header-avatar');
const userSelector = document.getElementById('user-selector');
const dragOverlay = document.getElementById('drag-overlay');
const themeToggleBtn = document.getElementById('theme-toggle');

// --- Helper: Group Chat Colors ---
const senderColors = [
    '#ff7a85', '#35cd96', '#6bcbef', '#e542a3', '#91ab01', 
    '#ffa97a', '#1f7aec', '#dfb610', '#029d00', '#8b7add', 
    '#ba33dc', '#59d368', '#b04632', '#fd85d4', '#8393ca', 
    '#ff8f2c', '#a3e047', '#549a8f', '#53bdeb', '#ff665c'
];

function getColorForSender(senderName) {
    let hash = 0;
    for (let i = 0; i < senderName.length; i++) {
        hash = senderName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % senderColors.length;
    return senderColors[index];
}

// --- Helper: URL Formatter ---
function formatMessageWithLinks(text) {
    if (!text) return document.createTextNode("");
    const fragment = document.createDocumentFragment();
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const parts = text.split(urlRegex);

    parts.forEach(part => {
        if (/^(https?:\/\/|www\.)/i.test(part)) {
            const link = document.createElement('a');
            link.href = part.toLowerCase().startsWith('www.') ? 'https://' + part : part;
            link.textContent = part;
            link.target = '_blank'; 
            link.rel = 'noopener noreferrer'; 
            link.className = 'chat-link';
            fragment.appendChild(link);
        } else if (part) {
            fragment.appendChild(document.createTextNode(part));
        }
    });
    return fragment;
}
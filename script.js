// --- Theme Handling ---
const themeToggleBtn = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
}
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// --- Group Chat Colors ---
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

// --- URL Formatter ---
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

// --- State Variables ---
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

// --- Event Listeners ---
// 1. Button Upload
fileInput.addEventListener('change', (e) => {
    processFiles(e.target.files);
    e.target.value = ''; // Reset so same file can be uploaded again
});

// 2. User Selector
userSelector.addEventListener('change', (e) => {
    if(activeChat) {
        activeChat.myUsername = e.target.value;
        resetAndRenderChat();
    }
});

// 3. Drag and Drop Logic
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dragOverlay.classList.remove('hidden');
});
window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dragOverlay.classList.add('hidden');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.add('hidden');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
    }
});

// --- Core Logic ---
async function processFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    loadingText.classList.remove('hidden');

    for (const file of files) {
        let displayName = file.name.replace('WhatsApp Chat with ', '').replace('.txt', '').replace('.zip', '');
        
        let chatObj = {
            id: Date.now() + Math.random(),
            name: displayName,
            messages: [],
            mediaMap: {},
            senders: new Set(),
            myUsername: "" 
        };

        try {
            if (file.name.endsWith('.txt')) {
                const text = await file.text();
                parseChatText(text, chatObj);
            } else if (file.name.endsWith('.zip')) {
                await handleZipFile(file, chatObj);
            }
            
            // Smart guess 1
            if (chatObj.senders.size === 1) {
                chatObj.myUsername = Array.from(chatObj.senders)[0];
            } else if (chatObj.senders.size === 2) {
                for (let sender of chatObj.senders) {
                    if (!chatObj.name.toLowerCase().includes(sender.toLowerCase())) {
                        chatObj.myUsername = sender;
                        break;
                    }
                }
            }
            
            if (chatObj.messages.length === 0) {
                chatObj.messages.push({ type: 'system', date: 'N/A', time: '', message: '⚠️ Could not read messages. Format not recognized.' });
            }
            
            chats.push(chatObj);
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
        }
    }

    // Smart guess 2: Majority Rule
    if (chats.length > 1) {
        let senderCounts = {};
        chats.forEach(chat => {
            chat.senders.forEach(sender => {
                senderCounts[sender] = (senderCounts[sender] || 0) + 1;
            });
        });

        let globalMe = "";
        let max = 0;
        for (let sender in senderCounts) {
            if (senderCounts[sender] > max) {
                max = senderCounts[sender];
                globalMe = sender;
            }
        }

        chats.forEach(chat => {
            if (chat.senders.has(globalMe)) chat.myUsername = globalMe;
        });
    }

    loadingText.classList.add('hidden');
    renderChatList();
}

async function handleZipFile(file, chatObj) {
    const zip = await JSZip.loadAsync(file);
    let chatText = "";

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (filename.endsWith('.txt')) {
            chatText = await zipEntry.async("string");
        } else if (!zipEntry.dir) {
            const rawBlob = await zipEntry.async("blob");
            let mimeType = "";
            const ext = filename.split('.').pop().toLowerCase();
            
            if (ext === 'pdf') mimeType = 'application/pdf';
            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'mp4') mimeType = 'video/mp4';
            else if (ext === 'mp3' || ext === 'm4a' || ext === 'opus') mimeType = 'audio/mpeg';

            const typedBlob = mimeType ? new Blob([rawBlob], { type: mimeType }) : rawBlob;
            chatObj.mediaMap[filename] = URL.createObjectURL(typedBlob);
        }
    }
    if (chatText) parseChatText(chatText, chatObj);
}

function parseChatText(text, chatObj) {
    // Destroy invisible characters (Left-to-Right marks, etc)
    text = text.replace(/[\u200E\u200F\u202A-\u202E\uFEFF]/g, '');

    // Much simpler, bulletproof Regex. 
    // Matches: Date, Time, and everything after the dash.
    const lineRegex = /^\[?(\d{1,4}[-/.]\d{1,4}[-/.]\d{1,4})[,\s]+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[a-zA-Z]{0,4})?)\]?[\s\-–—]*(.*)$/i;

    const lines = text.split('\n');
    let currentMsg = null;

    lines.forEach(line => {
        line = line.replace('\r', '').trim(); 
        if (!line) return; 

        const match = line.match(lineRegex);
        
        if (match) {
            // Save previous message
            if (currentMsg) chatObj.messages.push(currentMsg);
            
            const date = match[1].trim();
            const time = match[2].trim();
            const content = match[3].trim(); // Everything after the time and dash

            // Check if it's a User Message or System Message
            const colonIndex = content.indexOf(':');
            
            // If there's a colon early in the sentence, it's definitely "Sender Name:"
            if (colonIndex !== -1 && colonIndex < 40) {
                const sender = content.substring(0, colonIndex).trim();
                const messageText = content.substring(colonIndex + 1).trim();
                
                chatObj.senders.add(sender);
                currentMsg = { type: 'user', date: date, time: time, sender: sender, message: messageText };
            } else {
                // No early colon? It's a System Message (like "Messages are end-to-end encrypted")
                currentMsg = { type: 'system', date: date, time: time, message: content };
            }
        } else if (currentMsg) {
            // If it doesn't match a date/time, it is a multi-line message continuation!
            currentMsg.message += '\n' + line;
        }
    });
    
    if (currentMsg) chatObj.messages.push(currentMsg);
}

// --- UI Logic: Sidebar List ---
function renderChatList() {
    chatListContainer.innerHTML = ''; 

    if (chats.length === 0) {
        chatListContainer.innerHTML = '<div class="empty-state">No chats loaded yet.</div>';
        return;
    }

    chats.forEach(chat => {
        const row = document.createElement('div');
        row.className = 'chat-item';
        if (activeChat && activeChat.id === chat.id) row.classList.add('active');
        
        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
        let previewText = lastMsg ? (lastMsg.type === 'user' ? `${lastMsg.sender}: ${lastMsg.message}` : lastMsg.message) : '';
        if (previewText.length > 40) previewText = previewText.substring(0, 40) + '...';

        const avatarLetter = chat.name.charAt(0).toUpperCase();

        // Checkmarks removed as requested
        row.innerHTML = `
            <div class="avatar">${avatarLetter}</div>
            <div class="chat-details">
                <div class="chat-item-main">
                    <div class="chat-item-name">${chat.name}</div>
                    <div class="chat-item-date">${lastMsg ? lastMsg.date : ''}</div>
                </div>
                <div class="chat-item-lastmsg">
                    ${previewText}
                </div>
            </div>
        `;
        
        row.addEventListener('click', () => openChat(chat));
        chatListContainer.appendChild(row);
    });
}

// --- UI Logic: Active Chat View ---
function openChat(chat) {
    activeChat = chat;
    welcomeScreen.classList.add('hidden');
    activeChatScreen.classList.remove('hidden');
    
    chatTitle.textContent = chat.name;
    headerAvatar.textContent = chat.name.charAt(0).toUpperCase();

    renderChatList(); 

    userSelector.innerHTML = '<option value="">Who are you?</option>';
    chat.senders.forEach(sender => {
        const option = document.createElement('option');
        option.value = sender;
        option.textContent = sender;
        userSelector.appendChild(option);
    });

    if (chat.myUsername) userSelector.value = chat.myUsername;

    resetAndRenderChat();
}

function resetAndRenderChat() {
    document.querySelectorAll('.message-bubble, .sys-message, .date-separator').forEach(el => el.remove());
    currentRenderIndex = 0;
    renderNextChunk();
}

function renderNextChunk() {
    if (!activeChat || currentRenderIndex >= activeChat.messages.length) return;

    const myUsername = activeChat.myUsername;
    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(currentRenderIndex + CHUNK_SIZE, activeChat.messages.length);
    
    for (let i = currentRenderIndex; i < endIndex; i++) {
        const msg = activeChat.messages[i];
        
        const prevMsg = i > 0 ? activeChat.messages[i - 1] : null;
        if (!prevMsg || prevMsg.date !== msg.date) {
            if (msg.date) {
                const dateDiv = document.createElement('div');
                dateDiv.className = 'date-separator';
                dateDiv.textContent = msg.date;
                fragment.appendChild(dateDiv);
            }
        }
        
        if (msg.type === 'system') {
            const sysDiv = document.createElement('div');
            sysDiv.className = 'sys-message';
            sysDiv.appendChild(formatMessageWithLinks(msg.message));
            fragment.appendChild(sysDiv);
            continue;
        }

        const isMe = msg.sender === myUsername;
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isMe ? 'message-out' : 'message-in'}`;

        if (!isMe && activeChat.senders.size > 2) {
            const senderSpan = document.createElement('div');
            senderSpan.className = 'sender-name';
            senderSpan.textContent = msg.sender;
            senderSpan.style.color = getColorForSender(msg.sender);
            bubble.appendChild(senderSpan);
        }

        let textContent = msg.message;
        for (const [filename, blobUrl] of Object.entries(activeChat.mediaMap)) {
            if (msg.message.includes(filename)) {
                const mediaExt = filename.split('.').pop().toLowerCase();
                let mediaTag;
                
                if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(mediaExt)) {
                    mediaTag = document.createElement('img');
                    mediaTag.src = blobUrl;
                    mediaTag.className = 'media-attachment';
                } else if (['mp4', 'mov'].includes(mediaExt)) {
                    mediaTag = document.createElement('video');
                    mediaTag.src = blobUrl;
                    mediaTag.controls = true;
                    mediaTag.className = 'media-attachment';
                } else if (['opus', 'mp3', 'm4a'].includes(mediaExt)) {
                    mediaTag = document.createElement('audio');
                    mediaTag.src = blobUrl;
                    mediaTag.controls = true;
                    mediaTag.className = 'media-attachment';
                } else if (mediaExt === 'pdf') {
                    mediaTag = document.createElement('a');
                    mediaTag.href = blobUrl;
                    mediaTag.target = '_blank'; 
                    mediaTag.className = 'pdf-attachment';
                    mediaTag.innerHTML = `<span class="pdf-icon">📄</span> <span class="pdf-name">${filename}</span>`;
                }

                if (mediaTag) {
                    bubble.appendChild(mediaTag);
                    textContent = textContent.split(filename).join('');
                    textContent = textContent.replace(/\(file attached\)/gi, '')
                                             .replace(/<attached:/gi, '')
                                             .replace(/>/g, '')
                                             .replace(/• \d+ pages?/gi, '')
                                             .trim();
                }
            }
        }

        if (textContent && textContent.length > 0 && textContent !== '•') {
            const textSpan = document.createElement('div');
            textSpan.className = 'message-text';
            textSpan.appendChild(formatMessageWithLinks(textContent));
            bubble.appendChild(textSpan);
        }
        
        const timeSpan = document.createElement('div');
        timeSpan.className = 'message-time';
        timeSpan.textContent = msg.time;
        bubble.appendChild(timeSpan);
        
        fragment.appendChild(bubble);
    }

    chatContainer.insertBefore(fragment, scrollAnchor);
    currentRenderIndex = endIndex;
}

const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        renderNextChunk();
    }
}, { root: chatContainer, rootMargin: '100px' });

observer.observe(scrollAnchor);
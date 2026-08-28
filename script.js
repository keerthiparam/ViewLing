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
    
    // Safer, simpler regex to prevent browser crashes
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

// --- Event Listeners ---
fileInput.addEventListener('change', handleFileUpload);
userSelector.addEventListener('change', (e) => {
    if(activeChat) {
        activeChat.myUsername = e.target.value;
        resetAndRenderChat();
    }
});

// --- Core Logic ---
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
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
            
            // Smart guess 1: By File Name
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
            
            // Show error in chat if completely unreadable
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
            // Get the raw binary data
            const rawBlob = await zipEntry.async("blob");
            
            // Figure out what type of file this is so the browser doesn't get confused
            let mimeType = "";
            const ext = filename.split('.').pop().toLowerCase();
            
            if (ext === 'pdf') mimeType = 'application/pdf';
            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'mp4') mimeType = 'video/mp4';
            else if (ext === 'mp3' || ext === 'm4a' || ext === 'opus') mimeType = 'audio/mpeg';

            // Create a new Blob that explicitly tells the browser exactly what it is
            const typedBlob = mimeType ? new Blob([rawBlob], { type: mimeType }) : rawBlob;
            
            chatObj.mediaMap[filename] = URL.createObjectURL(typedBlob);
        }
    }
    if (chatText) parseChatText(chatText, chatObj);
}

function parseChatText(text, chatObj) {
    // Destroy invisible characters
    text = text.replace(/[\u200E\u200F\uFEFF]/g, '');

    const messageRegex = /^\[?(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})[, ]+(\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp]?[Mm]?)\]?[\s\-–—]+([^:]+):\s*([\s\S]*)$/;
    const systemRegex = /^\[?(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})[, ]+(\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp]?[Mm]?)\]?[\s\-–—]+([\s\S]*)$/;

    const lines = text.split('\n');
    let currentMsg = null;

    lines.forEach(line => {
        line = line.replace('\r', '').trim(); 
        if (!line) return; 

        const msgMatch = line.match(messageRegex);
        if (msgMatch) {
            if (currentMsg) chatObj.messages.push(currentMsg);
            const sender = msgMatch[3].trim();
            chatObj.senders.add(sender);
            currentMsg = { type: 'user', date: msgMatch[1], time: msgMatch[2], sender: sender, message: msgMatch[4].trim() };
        } else {
            const sysMatch = line.match(systemRegex);
            if (sysMatch) {
                if (currentMsg) chatObj.messages.push(currentMsg);
                currentMsg = { type: 'system', date: sysMatch[1], time: sysMatch[2], message: sysMatch[3].trim() };
            } else if (currentMsg) {
                currentMsg.message += '\n' + line;
            }
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
            // Also apply links to system messages (like Learn More links)
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
            senderSpan.style.color = getColorForSender(msg.sender); // DYNAMIC COLOR
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
                    
                    // --- NEW AGGRESSIVE CLEANUP ---
                    // split().join() forces the code to remove ALL occurrences of the filename, not just the first one
                    textContent = textContent.split(filename).join('');
                    
                    // Remove all other WhatsApp attachment artifacts globally
                    textContent = textContent.replace(/\(file attached\)/gi, '')
                                             .replace(/<attached:/gi, '')
                                             .replace(/>/g, '')
                                             .replace(/• \d+ pages?/gi, '') // Removes stray PDF page counts
                                             .trim();
                }
            }
        }

        // Only add the text bubble if there is actual text left over!
        // (Also ignores stray bullet points if WhatsApp left one behind)
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
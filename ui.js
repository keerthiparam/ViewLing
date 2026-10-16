// --- Initial Setup & Event Listeners ---

// 1. Theme Initialization
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

// 2. Button Upload
fileInput.addEventListener('change', (e) => {
    processFiles(e.target.files);
    e.target.value = ''; // Reset so the same file can be uploaded again if needed
});

// 3. User Selector (Top Right)
userSelector.addEventListener('change', (e) => {
    if(activeChat) {
        activeChat.myUsername = e.target.value;
        resetAndRenderChat();
    }
});

// 4. Drag and Drop Logic
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
window.addEventListener('dragover', (e) => {
    e.preventDefault();
});
window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.add('hidden');
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
    }
});

// 5. Escape Key to Close Chat
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        closeChat();
    }
});

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

function closeChat() {
    if (!activeChat) return; // If no chat is open, do nothing

    activeChat = null; // Clear the active chat state
    
    // Hide the chat area and show the welcome screen
    activeChatScreen.classList.add('hidden');
    welcomeScreen.classList.remove('hidden');
    
    // Re-render the sidebar to remove the active highlight color
    renderChatList(); 
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
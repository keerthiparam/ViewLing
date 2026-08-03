// --- State Variables ---
let parsedMessages = [];
let uniqueSenders = new Set();
let mediaMap = {}; // Maps filenames to Blob URLs
let currentRenderIndex = 0;
const CHUNK_SIZE = 50; // How many messages to load per scroll

// --- DOM Elements ---
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const setupScreen = document.getElementById('setup-screen');
const loadingText = document.getElementById('loading');
const userSelectionDiv = document.getElementById('user-selection');
const userSelector = document.getElementById('user-selector');
const renderBtn = document.getElementById('render-btn');
const chatScreen = document.getElementById('chat-screen');
const chatContainer = document.getElementById('chat-container');
const scrollAnchor = document.getElementById('scroll-anchor');
const backBtn = document.getElementById('back-btn');

// --- Event Listeners ---
fileInput.addEventListener('change', handleFileUpload);
renderBtn.addEventListener('click', startRenderingChat);
backBtn.addEventListener('click', () => location.reload());

// --- Core Logic ---

async function handleFileUpload(event) {
    // Convert to array so we can sort them
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    fileNameDisplay.textContent = `Selected: ${files.length} file(s)`;
    loadingText.classList.remove('hidden');
    userSelectionDiv.classList.add('hidden');

    parsedMessages = [];
    uniqueSenders.clear();
    mediaMap = {};

    // Sort files alphabetically so "Chat (1).zip" comes after "Chat.zip"
    files.sort((a, b) => a.name.localeCompare(b.name));

    try {
        // Loop through and process all selected files
        for (const file of files) {
            if (file.name.endsWith('.txt')) {
                const text = await file.text();
                parseChatText(text);
            } else if (file.name.endsWith('.zip')) {
                await handleZipFile(file);
            }
        }
    } catch (error) {
        console.error(error);
        alert("Error processing files. See console for details.");
    }

    loadingText.classList.add('hidden');
    
    userSelector.innerHTML = '<option value="">(None / System Messages Only)</option>';
    uniqueSenders.forEach(sender => {
        const option = document.createElement('option');
        option.value = sender;
        option.textContent = sender;
        userSelector.appendChild(option);
    });

    userSelectionDiv.classList.remove('hidden');
}

async function handleZipFile(file) {
    const zip = await JSZip.loadAsync(file);
    let chatText = "";

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (filename.endsWith('.txt')) {
            chatText = await zipEntry.async("string");
        } else if (!zipEntry.dir) {
            // It's a media file (image, video, audio)
            const blob = await zipEntry.async("blob");
            mediaMap[filename] = URL.createObjectURL(blob);
        }
    }

    if (!chatText) throw new Error("No .txt file found in the zip.");
    parseChatText(chatText);
}

function parseChatText(text) {
    // Regex that catches iOS, Android, 12h, and 24h formats.
    // Group 1: Date, Group 2: Time, Group 3: Sender, Group 4: Message text
    const messageRegex = /^\[?(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})[, ]+(\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp]?[Mm]?)\]?[\s-]+([^:]+):\s([\s\S]*)$/;
    
    // Fallback regex for system messages (e.g., "Messages are end-to-end encrypted")
    const systemRegex = /^\[?(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})[, ]+(\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp]?[Mm]?)\]?[\s-]+([\s\S]*)$/;

    const lines = text.split('\n');
    let currentMsg = null;

    lines.forEach(line => {
        const msgMatch = line.match(messageRegex);
        
        if (msgMatch) {
            if (currentMsg) parsedMessages.push(currentMsg); // Save previous message
            
            const sender = msgMatch[3].trim();
            uniqueSenders.add(sender);
            
            currentMsg = {
                type: 'user',
                date: msgMatch[1],
                time: msgMatch[2],
                sender: sender,
                message: msgMatch[4].trim()
            };
        } else {
            const sysMatch = line.match(systemRegex);
            if (sysMatch && !line.includes(':')) {
                if (currentMsg) parsedMessages.push(currentMsg);
                currentMsg = {
                    type: 'system',
                    date: sysMatch[1],
                    time: sysMatch[2],
                    message: sysMatch[3].trim()
                };
            } else if (currentMsg) {
                // If no date matches, this line is a continuation of the previous message
                currentMsg.message += '\n' + line;
            }
        }
    });
    
    if (currentMsg) parsedMessages.push(currentMsg); // Push the very last message
}

// --- Rendering Logic ---

function startRenderingChat() {
    setupScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    
    // Clear chat container (except for the scroll anchor)
    const bubbles = document.querySelectorAll('.message-bubble, .sys-message');
    bubbles.forEach(b => b.remove());
    
    currentRenderIndex = 0;
    renderNextChunk();
}

function renderNextChunk() {
    if (currentRenderIndex >= parsedMessages.length) return; 

    const myUsername = userSelector.value;
    const fragment = document.createDocumentFragment();
    
    const endIndex = Math.min(currentRenderIndex + CHUNK_SIZE, parsedMessages.length);
    
    for (let i = currentRenderIndex; i < endIndex; i++) {
        const msg = parsedMessages[i];
        
        // --- NEW: DATE SEPARATOR LOGIC ---
        // Check the previous message. If the date is different (or it's the first message), show the Date Pill
        const prevMsg = i > 0 ? parsedMessages[i - 1] : null;
        if (!prevMsg || prevMsg.date !== msg.date) {
            if (msg.date) { // Ensure it actually has a date
                const dateDiv = document.createElement('div');
                dateDiv.className = 'date-separator';
                dateDiv.textContent = msg.date;
                fragment.appendChild(dateDiv);
            }
        }
        // ---------------------------------
        
        if (msg.type === 'system') {
            const sysDiv = document.createElement('div');
            sysDiv.className = 'sys-message';
            sysDiv.textContent = msg.message;
            fragment.appendChild(sysDiv);
            continue;
        }

        const isMe = msg.sender === myUsername;
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isMe ? 'message-out' : 'message-in'}`;

        if (!isMe) {
            const senderSpan = document.createElement('div');
            senderSpan.className = 'sender-name';
            senderSpan.textContent = msg.sender;
            bubble.appendChild(senderSpan);
        }

        let textContent = msg.message;
        for (const [filename, blobUrl] of Object.entries(mediaMap)) {
            if (msg.message.includes(filename)) {
                const mediaExt = filename.split('.').pop().toLowerCase();
                let mediaTag;
                
                if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(mediaExt)) {
                    mediaTag = document.createElement('img');
                    mediaTag.src = blobUrl;
                } else if (['mp4', 'mov'].includes(mediaExt)) {
                    mediaTag = document.createElement('video');
                    mediaTag.src = blobUrl;
                    mediaTag.controls = true;
                } else if (['opus', 'mp3', 'm4a'].includes(mediaExt)) {
                    mediaTag = document.createElement('audio');
                    mediaTag.src = blobUrl;
                    mediaTag.controls = true;
                }

                if (mediaTag) {
                    mediaTag.className = 'media-attachment';
                    bubble.appendChild(mediaTag);
                    textContent = textContent.replace(filename, '').replace('(file attached)', '').replace('<attached:', '').replace('>', '').trim();
                }
            }
        }

        if (textContent) {
            const textSpan = document.createElement('div');
            textSpan.className = 'message-text';
            textSpan.textContent = textContent;
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

// --- Infinite Scroll Setup (Intersection Observer) ---
// This watches the bottom of the chat. When it comes into view, it loads the next chunk.
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !setupScreen.classList.contains('hidden') === false) {
        renderNextChunk();
    }
}, { root: chatContainer, rootMargin: '100px' });

observer.observe(scrollAnchor);
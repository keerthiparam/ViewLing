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
    renderChatList(); // Defined in ui.js
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

// THE ULTIMATE PARSER - Fixes the Paramanathan Colon Bug!
function parseChatText(text, chatObj) {
    text = text.replace(/[\u200E\u200F\u202A-\u202E\uFEFF]/g, '');

    const lineRegex = /^\[?(\d{1,4}[-/.]\d{1,4}[-/.]\d{1,4})[,\s]+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[a-zA-Z]{0,4})?)\]?[\s\-–—]*(.*)$/i;

    const lines = text.split('\n');
    let currentMsg = null;

    lines.forEach(line => {
        line = line.replace('\r', '').trim(); 
        if (!line) return; 

        const match = line.match(lineRegex);
        
        if (match) {
            if (currentMsg) chatObj.messages.push(currentMsg);
            
            const date = match[1].trim();
            const time = match[2].trim();
            const content = match[3].trim(); 

            const colonIndex = content.indexOf(':');
            
            if (colonIndex !== -1 && colonIndex < 40) {
                const sender = content.substring(0, colonIndex).trim();
                const messageText = content.substring(colonIndex + 1).trim();
                
                chatObj.senders.add(sender);
                currentMsg = { type: 'user', date: date, time: time, sender: sender, message: messageText };
            } else {
                currentMsg = { type: 'system', date: date, time: time, message: content };
            }
        } else if (currentMsg) {
            currentMsg.message += '\n' + line;
        }
    });
    
    if (currentMsg) chatObj.messages.push(currentMsg);
}
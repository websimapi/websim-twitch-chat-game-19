import tmi from 'tmi.js';

const ENERGY_COOLDOWN = 10 * 60 * 1000; // 10 minutes in milliseconds
const recentChatters = new Map();

export function initTwitch(channel, onChatter, onCommand) {
    const client = new tmi.Client({
        options: { debug: false },
        connection: {
            secure: true,
            reconnect: true
        },
        channels: [channel]
    });

    client.connect().catch(console.error);

    client.on('message', (channel, tags, message, self) => {
        if (self) return;

        const userId = tags['user-id'];
        const username = tags['display-name'];
        const now = Date.now();
        
        // Log message first (as requested by user), providing a fallback display name
        console.log(`[${username || userId || 'System'}]: ${message}`);

        // Critical check: Ensure we have a user ID for tracking player state.
        // If userId is missing, it prevents the creation of a chatter object 
        // with an undefined ID, which might cause downstream issues in Game.addOrUpdatePlayer.
        if (!userId) {
            return;
        }

        const lastChatter = recentChatters.get(userId);

        if (!lastChatter || now - lastChatter.lastMessageTimestamp > ENERGY_COOLDOWN) {
            const chatterData = {
                id: userId,
                username: username,
                color: tags['color'] || '#FFFFFF',
                lastMessageTimestamp: now,
            };
            recentChatters.set(userId, chatterData);
            onChatter(chatterData);
        }

        // Handle commands on every message
        const command = message.trim().toLowerCase();
        if (command === '!chop') {
            if (onCommand) {
                onCommand(userId, 'chop');
            }
        } else if (command === '!gather') {
            if (onCommand) {
                onCommand(userId, 'gather');
            }
        } else if (command.startsWith('!follow')) {
            if (onCommand) {
                const parts = message.trim().split(/\s+/);
                const targetUsername = parts.length > 1 ? parts[1].replace('@', '') : null;
                onCommand(userId, 'follow', { targetUsername });
            }
        }
    });
}
import { initTwitch } from './twitch.js';
import { Game } from './game.js';
import { AudioManager } from './audio-manager.js';

const connectContainer = document.getElementById('connect-container');
const worldSelectContainer = document.getElementById('world-select-container');
const worldList = document.getElementById('world-list');
const gameContainer = document.getElementById('game-container');
const channelInput = document.getElementById('channel-input');
const connectBtn = document.getElementById('connect-btn');
const canvas = document.getElementById('game-canvas');
const createWorldBtn = document.getElementById('create-world-btn');
const importWorldBtn = document.getElementById('import-world-btn');


const STORAGE_KEY = 'twitch_channel_name';
const PLAYERS_STORAGE_PREFIX = 'twitch_game_players_';
const MAP_STORAGE_PREFIX = 'twitch_game_map_';

function showGame() {
    worldSelectContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
}

function showWorldSelect(channel) {
    connectContainer.classList.add('hidden');
    worldSelectContainer.classList.remove('hidden');
    document.getElementById('world-select-title').textContent = `Worlds for #${channel}`;
    populateWorldList(channel);
}

function populateWorldList(channel) {
    worldList.innerHTML = '';
    const worlds = findWorldsForChannel(channel);

    if (worlds.length === 0) {
        // Handle case for a new channel with no worlds. We can treat the 'default' world as the first one.
        worlds.push('default'); 
    }

    worlds.forEach(worldName => {
        const worldEl = document.createElement('div');
        worldEl.className = 'world-item';
        
        const playerDataKey = worldName === 'default' 
            ? `${PLAYERS_STORAGE_PREFIX}${channel}`
            : `${PLAYERS_STORAGE_PREFIX}${channel}_${worldName}`;
            
        const playersData = localStorage.getItem(playerDataKey);
        const playerCount = playersData ? Object.keys(JSON.parse(playersData)).length : 0;

        worldEl.innerHTML = `
            <h3>${worldName}</h3>
            <p>${playerCount} players</p>
            <button class="export-btn">Export Data</button>
        `;

        worldEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('export-btn')) return;
            startGame(channel, worldName);
        });
        
        const exportBtn = worldEl.querySelector('.export-btn');
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportWorldData(channel, worldName);
        });

        worldList.appendChild(worldEl);
    });
}

function findWorldsForChannel(channel) {
    const worlds = new Set();
    const prefix = `${PLAYERS_STORAGE_PREFIX}${channel}_`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(prefix)) {
            const worldName = key.substring(prefix.length);
            worlds.add(worldName);
        }
    }
     // Support legacy single-world format
    if (localStorage.getItem(`${PLAYERS_STORAGE_PREFIX}${channel}`)) {
        worlds.add('default');
    }

    return Array.from(worlds);
}

function exportWorldData(channel, worldName) {
    const playerDataKey = worldName === 'default' 
        ? `${PLAYERS_STORAGE_PREFIX}${channel}` 
        : `${PLAYERS_STORAGE_PREFIX}${channel}_${worldName}`;

    const mapDataKey = worldName === 'default' 
        ? `${MAP_STORAGE_PREFIX}${channel}` 
        : `${MAP_STORAGE_PREFIX}${channel}_${worldName}`;

    const players = JSON.parse(localStorage.getItem(playerDataKey) || '{}');
    const map = JSON.parse(localStorage.getItem(mapDataKey) || '{}');

    const worldData = {
        channel,
        worldName,
        timestamp: new Date().toISOString(),
        data: {
            players,
            map
        }
    };

    const dataStr = JSON.stringify(worldData, null, 2);
    const dataBlob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel}_${worldName}_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleWorldImport() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const worldData = JSON.parse(e.target.result);
                processImportedWorld(worldData);
            } catch (error) {
                alert('Error: Could not parse the JSON file. Please ensure it is a valid world export file.');
                console.error('JSON parsing error:', error);
            }
        };
        reader.readAsText(file);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

function findAvailableWorldName(baseName, existingWorlds) {
    if (!existingWorlds.includes(baseName)) {
        return baseName;
    }
    let i = 1;
    while (true) {
        const newName = `${baseName} (${i})`;
        if (!existingWorlds.includes(newName)) {
            return newName;
        }
        i++;
    }
}

function saveImportedWorld(channel, worldName, data) {
    const playerDataKey = `${PLAYERS_STORAGE_PREFIX}${channel}_${worldName}`;
    const mapDataKey = `${MAP_STORAGE_PREFIX}${channel}_${worldName}`;

    try {
        localStorage.setItem(playerDataKey, JSON.stringify(data.players || {}));
        localStorage.setItem(mapDataKey, JSON.stringify(data.map || {}));
        console.log(`Successfully imported and saved world "${worldName}" for channel "${channel}".`);
        alert(`Successfully imported world: ${worldName}`);
    } catch (e) {
        alert('An error occurred while saving the imported world data. The browser storage might be full.');
        console.error('Error saving imported world:', e);
    }
}

function processImportedWorld(worldData) {
    if (!worldData.worldName || !worldData.data || !worldData.data.players || !worldData.data.map) {
        alert('Invalid world file format.');
        return;
    }

    const channel = localStorage.getItem(STORAGE_KEY);
    let importedWorldName = worldData.worldName;

    if (importedWorldName.toLowerCase() === 'default') {
        const newName = prompt("Importing a world named 'default' is not allowed as it cannot be overwritten. Please provide a new name for this world.", "default_imported");
        if (newName && newName.trim() !== '') {
            importedWorldName = newName.trim();
        } else {
            alert('Import cancelled: A valid name is required.');
            return; // User cancelled or entered empty name
        }
    }
    
    const existingWorlds = findWorldsForChannel(channel);
    
    if (existingWorlds.includes(importedWorldName)) {
        const choice = prompt(`A world named "${importedWorldName}" already exists.\n\nType 'overwrite' to replace it.\nType 'copy' to save it as a new world.\n\nAnything else will cancel.`, 'copy');

        if (choice && choice.toLowerCase() === 'overwrite') {
            // Name remains the same, will overwrite existing data.
        } else if (choice && choice.toLowerCase() === 'copy') {
            importedWorldName = findAvailableWorldName(importedWorldName, existingWorlds);
            alert(`The world will be imported as "${importedWorldName}".`);
        } else {
            alert('Import cancelled.');
            return; // User cancelled or entered invalid input
        }
    }

    saveImportedWorld(channel, importedWorldName, worldData.data);
    populateWorldList(channel);
}

function startGame(channel, worldName) {
    console.log(`Connecting to #${channel}, world: ${worldName}...`);
    showGame();

    AudioManager.init();

    const game = new Game(canvas, channel, worldName);
    
    initTwitch(
        channel, 
        (chatter) => { // onChatter for energy
            game.addOrUpdatePlayer(chatter);
        },
        (userId, command, args) => { // onCommand
            game.handlePlayerCommand(userId, command, args);
        }
    );

    game.start();
}

connectBtn.addEventListener('click', () => {
    const channel = channelInput.value.trim().toLowerCase();
    if (channel) {
        localStorage.setItem(STORAGE_KEY, channel);
        showWorldSelect(channel);
    }
});

importWorldBtn.addEventListener('click', () => {
    handleWorldImport();
});

channelInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectBtn.click();
    }
});

// Load channel from localStorage on startup
const savedChannel = localStorage.getItem(STORAGE_KEY);
if (savedChannel) {
    channelInput.value = savedChannel;
}
import { PLAYER_STATE } from '../player-state.js';
import { TILE_TYPE } from '../map-tile-types.js';
import { findPath } from '../pathfinding.js';
import { findAndMoveToTree } from './chopping.js';

function startSharedAction(player, allPlayers, state) {
    const target = player.actionTarget;
    let sharedAction = null;

    // Check if another player is already on this target
    for (const p of allPlayers.values()) {
        if (p.id !== player.id && p.state === state && p.actionTarget?.x === target.x && p.actionTarget?.y === target.y) {
            if (p.sharedAction) {
                sharedAction = p.sharedAction;
                break;
            }
        }
    }

    if (sharedAction) {
        sharedAction.participants[player.id] = Date.now();
        player.sharedAction = sharedAction;
    } else {
        player.sharedAction = {
            target,
            participants: { [player.id]: Date.now() }
        };
    }

    // Propagate shared action to others who might have just started
    for (const p of allPlayers.values()) {
         if (p.state === state && p.actionTarget?.x === target.x && p.actionTarget?.y === target.y) {
            p.sharedAction = player.sharedAction;
         }
    }
}

export function startGatheringCycle(player, gameMap) {
    player.state = PLAYER_STATE.SEARCHING_FOR_GATHERABLE;
    console.log(`[${player.username}] Starting gathering cycle, searching for resources.`);

    const gatherableTypes = [TILE_TYPE.LOGS, TILE_TYPE.BUSHES];
    const allGatherables = gameMap.findAll(gatherableTypes);

    if (allGatherables.length === 0) {
        console.log(`[${player.username}] No gatherables found on the map. Wandering...`);
        player.state = PLAYER_STATE.WANDERING_TO_GATHER;
        player.lastSearchPosition = { x: player.pixelX, y: player.pixelY };
        return;
    }

    allGatherables.sort((a, b) => {
        const distA = (a.x - player.pixelX)**2 + (a.y - player.pixelY)**2;
        const distB = (b.x - player.pixelX)**2 + (b.y - player.pixelY)**2;
        return distA - distB;
    });

    const MAX_GATHERABLES_TO_CHECK = 10;
    let pathFound = false;

    for (let i = 0; i < allGatherables.length && i < MAX_GATHERABLES_TO_CHECK; i++) {
        const target = allGatherables[i];

        const startX = Math.round(player.pixelX);
        const startY = Math.round(player.pixelY);
        const endX = target.x;
        const endY = target.y;

        const path = findPath(startX, startY, endX, endY, gameMap);

        if (path) {
            player.actionTarget = target;
            player.path = path;
            if (target.type === TILE_TYPE.LOGS) {
                player.state = PLAYER_STATE.MOVING_TO_LOGS;
            } else if (target.type === TILE_TYPE.BUSHES) {
                player.state = PLAYER_STATE.MOVING_TO_BUSHES;
            }
            console.log(`[${player.username}] Found pathable gatherable at (${target.x}, ${target.y}). Moving to harvest.`);
            pathFound = true;
            break;
        }
    }

    if (!pathFound) {
        console.log(`[${player.username}] No reachable gatherables found. Wandering...`);
        player.state = PLAYER_STATE.WANDERING_TO_GATHER;
        player.lastSearchPosition = { x: player.pixelX, y: player.pixelY };
    }
}

export function beginHarvestingLogs(player, allPlayers) {
    player.state = PLAYER_STATE.HARVESTING_LOGS;
    player.actionTimer = 6;
    console.log(`[${player.username}] Began harvesting logs. Timestamp: ${Date.now()}`);
    startSharedAction(player, allPlayers, PLAYER_STATE.HARVESTING_LOGS);
}

export function finishHarvestingLogs(player, gameMap, allPlayers) {
    const numLogs = Math.floor(Math.random() * 3) + 1;
    const sharedAction = player.sharedAction;
    const participants = [];

    if (sharedAction) {
        for (const p of allPlayers.values()) {
            if (sharedAction.participants[p.id]) {
                participants.push(p);
            }
        }
    } else {
        participants.push(player);
    }

    const now = Date.now();
    let totalWorkTime = 0;
    const workTimes = new Map();
    
    participants.sort((a,b) => (sharedAction.participants[a.id] || now) - (sharedAction.participants[b.id] || now));

    for (const p of participants) {
        const startTime = sharedAction ? sharedAction.participants[p.id] : now - (6 - p.actionTimer) * 1000;
        const workTime = now - startTime;
        totalWorkTime += workTime;
        workTimes.set(p.id, workTime);
    }
    
    // Distribute logs
    if (numLogs === 1) {
        const firstPlayer = participants[0];
        firstPlayer.inventory.logs.push({ timestamp: Date.now() });
        console.log(`[${firstPlayer.username}] Harvested 1 log (was first to start). Total: ${firstPlayer.inventory.logs.length}.`);
    } else if (numLogs > 1) {
        for (const p of participants) {
            const workTime = workTimes.get(p.id);
            const percentage = workTime / totalWorkTime;
            if (percentage >= 0.4 / participants.length) { // Adjusted threshold for fairness
                 p.inventory.logs.push({ timestamp: Date.now() });
                 console.log(`[${p.username}] Harvested 1 log (shared). Total: ${p.inventory.logs.length}.`);
            } else {
                 console.log(`[${p.username}] Did not get a log from shared harvest.`);
            }
        }
    }


    // Award XP and transition all participants
    for (const p of participants) {
        p.addExperience('woodcutting', numLogs); // As per instructions, same base XP
        p.addExperience('gathering', 2);
        
        console.log(`[${p.username}] Finished harvesting logs. Total logs: ${p.inventory.logs.length}. Timestamp: ${Date.now()}`);

        if (p.id !== player.id) { // Interrupt others
            console.log(`[${p.username}]'s gathering was completed by ${player.username}.`);
        }
        
        p.sharedAction = null;
        harvestNextBush(p, gameMap);
    }

    gameMap.grid[player.actionTarget.y][player.actionTarget.x] = TILE_TYPE.GRASS;
}

export function harvestNextBush(player, gameMap) {
    if(player.pendingHarvest.length > 0) {
        player.actionTarget = player.pendingHarvest.shift();

        const startX = Math.round(player.pixelX);
        const startY = Math.round(player.pixelY);
        const path = findPath(startX, startY, player.actionTarget.x, player.actionTarget.y, gameMap);

        if (path) {
            player.path = path;
            player.state = PLAYER_STATE.MOVING_TO_BUSHES;
        } else {
            console.warn(`[${player.username}] No path found to bush at (${player.actionTarget.x}, ${player.actionTarget.y}). Skipping.`);
            harvestNextBush(player, gameMap); // Try next bush
        }
    } else {
        // No more bushes from the tree chop. Now, decide what to do next.
        if (player.activeCommand === 'follow') {
            player.state = PLAYER_STATE.FOLLOWING;
        } else if (player.activeCommand === 'gather') {
            startGatheringCycle(player, gameMap);
        } else {
            // Default behavior (e.g., after !chop command is complete) is to find another tree.
            findAndMoveToTree(player, gameMap);
        }
    }
}

export function beginHarvestingBushes(player, allPlayers) {
    player.state = PLAYER_STATE.HARVESTING_BUSHES;
    player.actionTimer = 2 + Math.random();
    console.log(`[${player.username}] Began harvesting bushes. Timestamp: ${Date.now()}`);
    startSharedAction(player, allPlayers, PLAYER_STATE.HARVESTING_BUSHES);
}

export function finishHarvestingBushes(player, gameMap, allPlayers) {
    const totalLeavesDrop = Math.floor(200 + Math.random() * 801);
    const sharedAction = player.sharedAction;
    const participants = [];

    if (sharedAction) {
        for (const p of allPlayers.values()) {
            if (sharedAction.participants[p.id]) {
                participants.push(p);
            }
        }
    } else {
        participants.push(player);
    }

    const now = Date.now();
    let totalWorkTime = 0;
    const workTimes = new Map();

    for (const p of participants) {
        const startTime = sharedAction ? sharedAction.participants[p.id] : now - (3 - p.actionTimer) * 1000;
        const workTime = now - startTime;
        totalWorkTime += workTime;
        workTimes.set(p.id, workTime);
    }
    
    // Distribute leaves and award XP
    for (const p of participants) {
        let numLeaves = 0;
        if (totalWorkTime > 0) {
            const workTime = workTimes.get(p.id) || 0;
            const percentage = workTime / totalWorkTime;
            numLeaves = Math.floor(totalLeavesDrop * percentage);
        } else if (participants.length === 1) {
            numLeaves = totalLeavesDrop;
        }

        if (numLeaves > 0) {
            p.inventory.leaves.push({ amount: numLeaves, timestamp: Date.now() });
        }
        const totalLeaves = p.inventory.leaves.reduce((sum, item) => sum + item.amount, 0);
        console.log(`[${p.username}] Harvested ${numLeaves} leaves. Total: ${totalLeaves}. Timestamp: ${Date.now()}`);
        
        p.addExperience('gathering', 1);
        
        if (p.id !== player.id) {
             console.log(`[${p.username}]'s gathering was completed by ${player.username}.`);
        }
        
        p.sharedAction = null;

        if (p.activeCommand === 'gather') {
            startGatheringCycle(p, gameMap);
        } else {
            harvestNextBush(p, gameMap);
        }
    }

    gameMap.grid[player.actionTarget.y][player.actionTarget.x] = TILE_TYPE.GRASS;
}
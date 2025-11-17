import { PLAYER_STATE } from '../player-state.js';
import { TILE_TYPE } from '../map-tile-types.js';
import { findPath } from '../pathfinding.js';
import { findAndMoveToTree } from './chopping.js';

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

export function beginHarvestingLogs(player) {
    player.state = PLAYER_STATE.HARVESTING_LOGS;
    player.actionTimer = 6;
    console.log(`[${player.username}] Began harvesting logs. Timestamp: ${Date.now()}`);
}

export function finishHarvestingLogs(player, gameMap) {
    const numLogs = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numLogs; i++) {
        player.inventory.logs.push({ timestamp: Date.now() });
    }
    console.log(`[${player.username}] Harvested ${numLogs} logs. Total: ${player.inventory.logs.length}. Timestamp: ${Date.now()}`);
    player.addExperience('woodcutting', numLogs);
    player.addExperience('gathering', 2);
    gameMap.grid[player.actionTarget.y][player.actionTarget.x] = TILE_TYPE.GRASS;

    // After harvesting logs, always check for bushes before deciding the next major action.
    harvestNextBush(player, gameMap);
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

export function beginHarvestingBushes(player) {
    player.state = PLAYER_STATE.HARVESTING_BUSHES;
    player.actionTimer = 2 + Math.random();
    console.log(`[${player.username}] Began harvesting bushes. Timestamp: ${Date.now()}`);
}

export function finishHarvestingBushes(player, gameMap) {
    const numLeaves = Math.floor(200 + Math.random() * 801); 
    player.inventory.leaves.push({ amount: numLeaves, timestamp: Date.now() });
    const totalLeaves = player.inventory.leaves.reduce((sum, item) => sum + item.amount, 0);
    console.log(`[${player.username}] Harvested ${numLeaves} leaves. Total: ${totalLeaves}. Timestamp: ${Date.now()}`);
    player.addExperience('gathering', 1);
    gameMap.grid[player.actionTarget.y][player.actionTarget.x] = TILE_TYPE.GRASS;

    if (player.activeCommand === 'gather') {
        startGatheringCycle(player, gameMap);
    } else {
        // For both 'follow' and default commands, continue harvesting pending bushes.
        harvestNextBush(player, gameMap);
    }
}
import { PLAYER_STATE } from '../player-state.js';
import { TILE_TYPE } from '../map-tile-types.js';
import { AudioManager } from '../audio-manager.js';
import { findPath } from '../pathfinding.js';
import { beginHarvestingBushes, beginHarvestingLogs, harvestNextBush } from './gathering.js';

export function findAndMoveToTree(player, gameMap) {
    const allTrees = gameMap.findAll([TILE_TYPE.TREE]);
    if (allTrees.length === 0) {
        console.log(`[${player.username}] No trees found.`);
        player.state = PLAYER_STATE.IDLE;
        return;
    }

    // Sort trees by distance from player
    allTrees.sort((a, b) => {
        const distA = (a.x - player.pixelX)**2 + (a.y - player.pixelY)**2;
        const distB = (b.x - player.pixelX)**2 + (b.y - player.pixelY)**2;
        return distA - distB;
    });

    const MAX_TREES_TO_CHECK = 10;
    let pathFound = false;

    for (let i = 0; i < allTrees.length && i < MAX_TREES_TO_CHECK; i++) {
        const treeCoords = allTrees[i];
        
        let bestSpot = null;
        let minDistance = Infinity;
        // Find best spot to stand next to the tree
        for(let dx = -1; dx <= 1; dx++) {
            for(let dy = -1; dy <= 1; dy++) {
                if(dx === 0 && dy === 0) continue;
                const spotX = treeCoords.x + dx;
                const spotY = treeCoords.y + dy;
                if(!gameMap.isColliding(spotX, spotY)) {
                    const dist = (spotX - player.pixelX)**2 + (spotY - player.pixelY)**2;
                    if(dist < minDistance) {
                       minDistance = dist;
                       bestSpot = {x: spotX, y: spotY};
                    }
                }
            }
        }
        
        if(bestSpot) {
           const startX = Math.round(player.pixelX);
           const startY = Math.round(player.pixelY);
           const path = findPath(startX, startY, bestSpot.x, bestSpot.y, gameMap);
           
           if (path) {
               player.actionTarget = treeCoords;
               player.path = path;
               player.state = PLAYER_STATE.MOVING_TO_TREE;
               console.log(`[${player.username}] Found pathable tree at (${treeCoords.x}, ${treeCoords.y}). Moving to chop.`);
               pathFound = true;
               break; // Exit the loop since we found a valid tree and path
           }
        }
    }

    if (!pathFound) {
        console.warn(`[${player.username}] Checked ${Math.min(allTrees.length, MAX_TREES_TO_CHECK)} nearest trees, but none are reachable. Wandering to find a new spot.`);
        player.lastSearchPosition = { x: player.pixelX, y: player.pixelY };
        player.state = PLAYER_STATE.SEARCHING_FOR_TREE; // Stay in searching state to wander
    }
}

export function startChoppingCycle(player, gameMap) {
    player.state = PLAYER_STATE.SEARCHING_FOR_TREE;
    console.log(`[${player.username}] Starting chopping cycle, searching for a tree. Timestamp: ${Date.now()}`);
    findAndMoveToTree(player, gameMap);
}

export function beginChopping(player) {
    player.state = PLAYER_STATE.CHOPPING;
    player.actionTimer = 11; // 11 seconds to chop
    console.log(`[${player.username}] Began chopping tree at (${player.actionTarget.x}, ${player.actionTarget.y}). Timestamp: ${Date.now()}`);
}

export function finishChopping(player, gameMap) {
    const chopSound = AudioManager.getBuffer('./tree_fall.mp3');
    AudioManager.play(chopSound, player.actionTarget.x, player.actionTarget.y);

    const treeX = player.actionTarget.x;
    const treeY = player.actionTarget.y;

    gameMap.cutTree(treeX, treeY);
    player.actionTarget = { x: treeX, y: treeY };

    console.log(`[${player.username}] Finished chopping tree. Timestamp: ${Date.now()}`);
    player.addExperience('woodcutting', 3);

    player.pendingHarvest = [];
    let spawnedBushes = 0;
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [dx, dy] of directions) {
        const bushX = treeX + dx;
        const bushY = treeY + dy;
        if (bushX >= 0 && bushX < gameMap.width && bushY >= 0 && bushY < gameMap.height && 
            gameMap.grid[bushY][bushX] === TILE_TYPE.GRASS && Math.random() < 1/8) {
            gameMap.grid[bushY][bushX] = TILE_TYPE.BUSHES;
            player.pendingHarvest.push({ x: bushX, y: bushY, type: TILE_TYPE.BUSHES });
            spawnedBushes++;
        }
    }
    if (spawnedBushes === 0) {
        const validSpots = directions.filter(([dx, dy]) => {
            const bushX = treeX + dx;
            const bushY = treeY + dy;
            return bushX >= 0 && bushX < gameMap.width && bushY >= 0 && bushY < gameMap.height && gameMap.grid[bushY][bushX] === TILE_TYPE.GRASS;
        });
        if (validSpots.length > 0) {
            const [dx, dy] = validSpots[Math.floor(Math.random() * validSpots.length)];
            const bushX = treeX + dx;
            const bushY = treeY + dy;
            gameMap.grid[bushY][bushX] = TILE_TYPE.BUSHES;
            player.pendingHarvest.push({ x: bushX, y: bushY, type: TILE_TYPE.BUSHES });
        }
    }

    if (player.activeCommand === 'follow') {
        player.state = PLAYER_STATE.FOLLOWING;
        return;
    }

    player.state = PLAYER_STATE.IDLE; // Reset state before pathfinding
    const startX = Math.round(player.pixelX);
    const startY = Math.round(player.pixelY);
    const path = findPath(startX, startY, player.actionTarget.x, player.actionTarget.y, gameMap);

    if(path) {
        player.path = path;
        player.state = PLAYER_STATE.MOVING_TO_LOGS;
    } else {
        console.warn(`[${player.username}] No path found to logs at (${player.actionTarget.x}, ${player.actionTarget.y}).`);
        // The logs from the tree are unreachable. Harvest pending bushes instead.
        harvestNextBush(player, gameMap);
    }
}
import { PLAYER_STATE } from './player-state.js';
import { updateAction } from './behaviors/player-behavior-updater.js';
import { startChoppingCycle } from './behaviors/chopping.js';
import { startGatheringCycle } from './behaviors/gathering.js';
import { renderPlayer } from './player-renderer.js';
import { TILE_TYPE } from './map-tile-types.js';
import { findPath } from './pathfinding.js';

export const ENERGY_DURATION_MS = 3600 * 1000; // 1 hour (3600 seconds)

const MAX_ENERGY_SLOTS = 12;

export class Player {
    constructor(id, username, color) {
        this.id = id;
        this.username = username;
        this.color = color;
        this.energyTimestamps = []; // Use timestamps for cell tracking

        // Position in grid coordinates
        this.x = 0;
        this.y = 0;

        // For smooth movement
        this.pixelX = 0;
        this.pixelY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.path = []; // Path for A* movement
        
        this.isPositioned = false; // Flag to track initialization

        this.speed = 1; // tiles per second
        this.moveCooldown = 2 + Math.random() * 5; // time to wait before picking new target
        this.lastEnergyLogTime = 0; // Initialize log throttle
        this.currentCellDrainRatio = 0; // 0 (full) to 1 (empty)
        this.flashState = 0; // For subtle flashing effect

        // Chopping state
        this.state = PLAYER_STATE.IDLE;
        this.actionTarget = null; // {x, y} of the tree, logs, etc.
        this.actionTimer = 0;
        this.inventory = { logs: [], leaves: [] };
        this.pendingHarvest = []; // {x, y, type} for bushes
        this.activeCommand = null;
        this.followTargetId = null;
        this.lastSearchPosition = null; // For gathering wander logic
        this.skills = {
            woodcutting: [],
            gathering: []
        };
    }

    addExperience(skill, amount) {
        if (this.skills[skill]) {
            const timestamp = Date.now();
            this.skills[skill].push({ amount, timestamp });
            const totalExp = this.skills[skill].reduce((sum, entry) => sum + entry.amount, 0);
            console.log(`[${this.username}] Gained +${amount} XP in ${skill}. Total: ${totalExp}. Timestamp: ${timestamp}`);
        } else {
            console.warn(`[${this.username}] Attempted to add XP to non-existent skill: ${skill}`);
        }
    }

    setInitialPosition(gameMap) {
        if (this.isPositioned) return;
        
        const mapWidth = gameMap.width;
        const mapHeight = gameMap.height;

        let attempts = 0;
        let foundSpot = false;
        let newX, newY;

        while (attempts < 100 && !foundSpot) {
            newX = Math.floor(Math.random() * mapWidth);
            newY = Math.floor(Math.random() * mapHeight);
            
            if (!gameMap.isColliding(newX, newY)) {
                foundSpot = true;
                this.x = newX;
                this.y = newY;
                this.pixelX = newX;
                this.pixelY = newY;
                this.targetX = newX;
                this.targetY = newY;
                this.isPositioned = true;
                break;
            }
            attempts++;
        }
        
        if (!foundSpot) {
            console.warn(`Could not find a safe initial spawn point for ${this.username}. Placing at (0, 0).`);
            // Fallback: If map is full of trees, still mark as positioned
            this.isPositioned = true;
        }
    }

    addEnergy() {
        if (this.energyTimestamps.length < MAX_ENERGY_SLOTS) {
            // Add current timestamp for a new energy cell
            this.energyTimestamps.push(Date.now());
        }
    }

    isPowered() {
        return this.energyTimestamps.length > 0;
    }

    getState() {
        return {
            id: this.id,
            username: this.username,
            color: this.color,
            energyTimestamps: this.energyTimestamps, // Store timestamps
            pixelX: this.pixelX,
            pixelY: this.pixelY,
            path: this.path,
            inventory: this.inventory,
            state: this.state,
            actionTarget: this.actionTarget, // Save the action target
            pendingHarvest: this.pendingHarvest,
            activeCommand: this.activeCommand,
            followTargetId: this.followTargetId,
            lastSearchPosition: this.lastSearchPosition,
            skills: this.skills,
        };
    }

    loadState(state) {
        if (state.pixelX !== undefined && state.pixelY !== undefined) {
            this.pixelX = state.pixelX;
            this.pixelY = state.pixelY;
            // Set target position to the loaded smooth position so movement continues from there
            this.targetX = state.pixelX;
            this.targetY = state.pixelY;
            
            this.x = Math.round(state.pixelX);
            this.y = Math.round(state.pixelY);
            this.isPositioned = true; // Loaded state implies positioned
        }
        
        this.path = state.path || [];

        // Load energyTimestamps
        if (state.energyTimestamps && Array.isArray(state.energyTimestamps)) {
            this.energyTimestamps = state.energyTimestamps;
            // Ensure oldest is first for draining
            this.energyTimestamps.sort((a, b) => a - b);
        } else if (state.energy !== undefined && state.energy > 0) {
            // Handle conversion from legacy 'energy' count to timestamps.
            this.energyTimestamps = [];
            for (let i = 0; i < state.energy; i++) {
                // Assume legacy energy starts draining immediately upon load
                this.energyTimestamps.push(Date.now());
            }
        }
        
        this.username = state.username || this.username;
        this.color = state.color || this.color;
        this.inventory = state.inventory || { logs: [], leaves: [] };
        this.pendingHarvest = state.pendingHarvest || [];
        this.skills = state.skills || { woodcutting: [], gathering: [] };
        this.activeCommand = state.activeCommand || null;
        this.followTargetId = state.followTargetId || null;
        this.lastSearchPosition = state.lastSearchPosition || null;

        this.actionTarget = state.actionTarget || null; // Restore the action target
        this.state = state.state || PLAYER_STATE.IDLE;
        
        // If restoring a chopping state, ensure the action target is valid.
        if (this.state === PLAYER_STATE.CHOPPING && !this.actionTarget) {
            console.warn(`[${this.username}] Restored to CHOPPING state without a valid actionTarget. Resetting to IDLE.`);
            this.state = PLAYER_STATE.IDLE;
        }

        if (this.state === PLAYER_STATE.FOLLOWING && !this.followTargetId) {
            console.warn(`[${this.username}] Restored to FOLLOWING state without a valid followTargetId. Resetting to IDLE.`);
            this.state = PLAYER_STATE.IDLE;
        }
    }

    // New method to validate state after map is loaded
    validateState(gameMap) {
        // Validate player position first
        const currentGridX = Math.round(this.pixelX);
        const currentGridY = Math.round(this.pixelY);

        if (
            currentGridX < 0 || currentGridX >= gameMap.width ||
            currentGridY < 0 || currentGridY >= gameMap.height ||
            gameMap.isColliding(currentGridX, currentGridY)
        ) {
            console.warn(`[${this.username}] Invalid or occupied position on load (${this.pixelX.toFixed(2)}, ${this.pixelY.toFixed(2)}). Finding a new spot.`);
            this.isPositioned = false; // Reset positioned flag
            this.setInitialPosition(gameMap);
            console.log(`[${this.username}] Relocated to (${this.pixelX.toFixed(2)}, ${this.pixelY.toFixed(2)}).`);
            // After repositioning, reset state to avoid conflicts with old invalid targets
            this.state = PLAYER_STATE.IDLE;
            this.actionTarget = null;
            this.path = [];
            return; // Exit validation early as state has been reset
        }

        const stateToTileType = {
            [PLAYER_STATE.MOVING_TO_TREE]: TILE_TYPE.TREE,
            [PLAYER_STATE.CHOPPING]: TILE_TYPE.TREE,
            [PLAYER_STATE.MOVING_TO_LOGS]: TILE_TYPE.LOGS,
            [PLAYER_STATE.HARVESTING_LOGS]: TILE_TYPE.LOGS,
            [PLAYER_STATE.MOVING_TO_BUSHES]: TILE_TYPE.BUSHES,
            [PLAYER_STATE.HARVESTING_BUSHES]: TILE_TYPE.BUSHES,
        };

        const requiredTileType = stateToTileType[this.state];
        
        if (requiredTileType !== undefined) {
            const target = this.actionTarget;
            const isTargetInvalid = !target || 
                                    !gameMap.grid[target.y] || 
                                    gameMap.grid[target.y][target.x] !== requiredTileType;

            if (isTargetInvalid) {
                console.warn(`[${this.username}] Invalid target for state ${this.state}. Target tile at (${target?.x}, ${target?.y}) is missing or incorrect. Resetting to IDLE.`);
                this.state = PLAYER_STATE.IDLE;
                this.actionTarget = null;
                this.path = []; // Clear the path as well
            } else {
                // Target is valid, re-initialize movement if needed
                if (this.state === PLAYER_STATE.MOVING_TO_TREE) {
                    console.log(`[${this.username}] Re-initializing move target for state ${this.state}.`);
                    // The setChopTarget function was complex and mostly duplicated findPath logic.
                    // The path is already loaded, so we trust it or let it be recalculated by the behavior.
                    // For now, we let the existing path be used by updateAction.
                    // If issues arise, we can explicitly re-call findAndMoveToTree.
                } else if (this.state === PLAYER_STATE.MOVING_TO_LOGS || this.state === PLAYER_STATE.MOVING_TO_BUSHES) {
                    console.log(`[${this.username}] Re-calculating path for state ${this.state}.`);
                    const startX = Math.round(this.pixelX);
                    const startY = Math.round(this.pixelY);
                    const path = findPath(startX, startY, this.actionTarget.x, this.actionTarget.y, gameMap);
                    if (path) {
                        this.path = path;
                    } else {
                        console.warn(`[${this.username}] Path to valid target for ${this.state} is blocked. Resetting.`);
                        this.state = PLAYER_STATE.IDLE;
                        this.actionTarget = null;
                        this.path = [];
                    }
                }
            }
        }
    }

    update(deltaTime, gameMap, allPlayers) {
        
        if (this.isPowered()) {
            // 1. Energy Draining Logic
            const now = Date.now();
            const oldestTimestamp = this.energyTimestamps[0];
            
            // Calculate drain status
            const timeElapsed = now - oldestTimestamp;
            this.currentCellDrainRatio = Math.min(1, timeElapsed / ENERGY_DURATION_MS);
            
            const expirationTime = oldestTimestamp + ENERGY_DURATION_MS;
            
            const remainingMS = expirationTime - now;

            // Update flash state for visualization
            // Use a quick oscillation based on time
            // Reduced frequency (750) for a slower, smoother pulse effect
            this.flashState = (Math.sin(now / 750) + 1) / 2; // Value between 0 and 1

            // Console log remaining time for the current draining energy cell (as requested)
            if (remainingMS > 0) {
                // Throttle logging to once per minute (60,000 ms)
                const LOG_INTERVAL = 60000;
                
                if (now - this.lastEnergyLogTime > LOG_INTERVAL) {
                    const remainingSeconds = Math.ceil(remainingMS / 1000);
                    // Logging energy info with timer info
                    console.log(`[Energy Drain Status] Player ${this.username}: Time left on current cell: ${remainingSeconds}s. Total cells: ${this.energyTimestamps.length}`);
                    this.lastEnergyLogTime = now;
                }
            }

            if (remainingMS <= 0) {
                // Energy cell expired
                this.energyTimestamps.shift();
                console.log(`[Energy Drain] Player ${this.username} consumed one energy cell. Remaining cells: ${this.energyTimestamps.length}`);
                
                // If this was the last cell, stop movement logic execution for this frame
                if (!this.isPowered()) {
                    this.currentCellDrainRatio = 0; // Reset ratio if no power
                    this.flashState = 0;
                    this.state = PLAYER_STATE.IDLE; // Stop chopping if power runs out
                    return; 
                }
            }

            // If player is idle but has an active command, restart the task.
            if (this.state === PLAYER_STATE.IDLE && this.activeCommand) {
                if (this.activeCommand === 'chop') {
                    startChoppingCycle(this, gameMap);
                } else if (this.activeCommand === 'gather') {
                    startGatheringCycle(this, gameMap);
                } else if (this.activeCommand === 'follow') {
                    this.state = PLAYER_STATE.FOLLOWING;
                }
            }

            // State Machine for actions
            updateAction(this, deltaTime, gameMap, allPlayers);

        }
    }

    startChoppingCycle(gameMap) {
        startChoppingCycle(this, gameMap);
    }

    startGatheringCycle(gameMap) {
        startGatheringCycle(this, gameMap);
    }

    render(ctx, tileSize, cameraX, cameraY) {
        renderPlayer(ctx, this, tileSize, cameraX, cameraY);
    }
}
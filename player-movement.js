export function updateWander(player, deltaTime, gameMap) {
    player.moveCooldown -= deltaTime;
    if (player.moveCooldown <= 0) {
        pickNewTarget(player, gameMap);
        player.moveCooldown = 2 + Math.random() * 5; // reset cooldown
    }
    updateMoveToTarget(player, deltaTime, gameMap);
}

export function updateFollowPath(player, deltaTime, gameMap) {
    if (player.path.length === 0) {
        // Snap to grid if movement is complete to avoid slight offsets
        const finalTarget = player.actionTarget || { x: player.targetX, y: player.targetY };
        const dx = finalTarget.x - player.pixelX;
        const dy = finalTarget.y - player.pixelY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.01 && dist < 1) { // Only snap if close to final destination
             const moveAmount = player.speed * deltaTime;
             const nextPixelX = player.pixelX + (dx / dist) * moveAmount;
             const nextPixelY = player.pixelY + (dy / dist) * moveAmount;
             player.pixelX = nextPixelX;
             player.pixelY = nextPixelY;
        } else if (dist <= 0.01) {
            player.pixelX = Math.round(player.pixelX);
            player.pixelY = Math.round(player.pixelY);
        }
        return;
    }

    // Set the current target to the next waypoint in the path
    const nextWaypoint = player.path[0];
    player.targetX = nextWaypoint.x;
    player.targetY = nextWaypoint.y;

    // Move towards the waypoint
    updateMoveToTarget(player, deltaTime, gameMap);

    // Check if we've reached the waypoint
    const dx = player.targetX - player.pixelX;
    const dy = player.targetY - player.pixelY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) {
        // Reached the waypoint, remove it from the path
        player.path.shift();
    }
}

export function updateMoveToTarget(player, deltaTime, gameMap) {
    const dx = player.targetX - player.pixelX;
    const dy = player.targetY - player.pixelY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.01) {
        const moveAmount = player.speed * deltaTime;
        
        const nextPixelX = player.pixelX + (dx / dist) * moveAmount;
        const nextPixelY = player.pixelY + (dy / dist) * moveAmount;
        
        const nextGridX = Math.round(nextPixelX);
        const nextGridY = Math.round(nextPixelY);
        
        if (!gameMap.isColliding(nextGridX, nextGridY) || (nextGridX === player.targetX && nextGridY === player.targetY)) {
            player.pixelX = nextPixelX;
            player.pixelY = nextPixelY;
        } else {
            player.pixelX = Math.round(player.pixelX); // Snap to grid
            player.pixelY = Math.round(player.pixelY);
        }
    } else {
        player.pixelX = player.targetX;
        player.pixelY = player.targetY;
    }
}

export function pickNewTarget(player, gameMap) {
    let attempts = 0;
    let validTarget = false;
    
    const mapWidth = gameMap.width;
    const mapHeight = gameMap.height;

    while (attempts < 8 && !validTarget) {
        let currentGridX = Math.round(player.pixelX); 
        let currentGridY = Math.round(player.pixelY);

        let newX = currentGridX;
        let newY = currentGridY;

        const dir = Math.floor(Math.random() * 4);

        switch (dir) {
            case 0: newY--; break; // Up
            case 1: newY++; break; // Down
            case 2: newX--; break; // Left
            case 3: newX++; break; // Right
        }

        if (newX < 0 || newX >= mapWidth || newY < 0 || newY >= mapHeight) {
            attempts++;
            continue;
        }
        
        if (!gameMap.isColliding(newX, newY)) {
            validTarget = true;
            player.targetX = newX;
            player.targetY = newY;
        }
        attempts++;
    }
    
    if (!validTarget) {
        player.targetX = player.pixelX;
        player.targetY = player.pixelY;
    }
}


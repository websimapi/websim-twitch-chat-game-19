const MAX_ENERGY_SLOTS = 12;
const PARTIAL_BLOCKS = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const FILLED_BLOCK = '█';
const EMPTY_BLOCK_VISUAL = '▒';
const BASE_COLOR_RGB = '173, 216, 230';
const FILLED_COLOR = `rgb(${BASE_COLOR_RGB})`;
const EMPTY_COLOR_ALPHA = `rgba(${BASE_COLOR_RGB}, 0.4)`;

function drawEnergyBar(ctx, player, screenX, usernameTagY, usernameFontSize) {
    if (player.energyTimestamps.length === 0) return;

    const barFontSize = usernameFontSize * 0.7; 
    ctx.font = `${barFontSize}px monospace`; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const verticalOffset = 2;
    const barY = usernameTagY + verticalOffset;

    const blockWidth = ctx.measureText(FILLED_BLOCK).width;
    const totalBarWidth = blockWidth * MAX_ENERGY_SLOTS;
    const startX = screenX - totalBarWidth / 2;

    const totalEnergyCells = player.energyTimestamps.length;
    
    const remainingRatio = 1 - player.currentCellDrainRatio;
    const partialBlockIndex = Math.max(0, Math.min(PARTIAL_BLOCKS.length - 1, Math.floor(remainingRatio * PARTIAL_BLOCKS.length)));

    for (let i = 0; i < MAX_ENERGY_SLOTS; i++) {
        let block = EMPTY_BLOCK_VISUAL;
        let isDrainingCell = false;

        if (i < totalEnergyCells) {
            const cellIndex = totalEnergyCells - 1 - i; 

            if (cellIndex === 0) {
                block = PARTIAL_BLOCKS[partialBlockIndex];
                isDrainingCell = true;
            } else if (cellIndex > 0) {
                block = FILLED_BLOCK;
            }
        } 

        const currentBlockCenterX = startX + (i * blockWidth) + (blockWidth / 2);

        ctx.save(); 

        if (i < totalEnergyCells) {
            if (isDrainingCell) {
                const alpha = 0.6 + player.flashState * 0.4; 
                ctx.fillStyle = `rgba(${BASE_COLOR_RGB}, ${alpha})`;
            } else {
                ctx.fillStyle = FILLED_COLOR;
            }
        } else {
            ctx.fillStyle = EMPTY_COLOR_ALPHA;
        }

        ctx.fillText(block, currentBlockCenterX, barY);
        ctx.restore(); 
    }
}

export function renderPlayer(ctx, player, tileSize, cameraX, cameraY) {
    const radius = tileSize / 2.5;
    const screenX = (player.pixelX * tileSize + tileSize / 2) - cameraX;
    const screenY = (player.pixelY * tileSize + tileSize / 2) - cameraY;

    ctx.save();	

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();

    const baseFontSize = Math.max(12, tileSize * 0.6); 
    const fontSize = Math.max(10, baseFontSize * (2/3));
    ctx.font = `${fontSize}px Arial, sans-serif`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;

    const tagY = screenY - radius - 18;

    ctx.strokeText(player.username, screenX, tagY);
    ctx.fillText(player.username, screenX, tagY);

    if (player.isPowered()) {
        drawEnergyBar(ctx, player, screenX, tagY, fontSize);
    }

    ctx.restore();
}
// Development utilities for Minecraft Clone
// Add these to enhance the game during development

// Chunk manager utility
class ChunkManager {
  constructor(socket) {
    this.socket = socket;
    this.loadedChunks = new Set();
    this.chunkQueue = [];
  }

  addChunkToQueue(chunkKey) {
    if (!this.loadedChunks.has(chunkKey)) {
      this.chunkQueue.push(chunkKey);
    }
  }

  unloadChunk(chunkKey) {
    this.loadedChunks.delete(chunkKey);
  }

  getLoadedChunksCount() {
    return this.loadedChunks.size;
  }
}

// Debug overlay
class DebugOverlay {
  constructor() {
    this.enabled = false;
    this.createPanel();
    this.bindKeys();
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'debug-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #0f0;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border: 2px solid #0f0;
      max-width: 300px;
      display: none;
      z-index: 999;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    document.body.appendChild(this.panel);
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    this.panel.style.display = this.enabled ? 'block' : 'none';
  }

  update(data) {
    if (this.enabled) {
      this.panel.textContent = JSON.stringify(data, null, 2);
    }
  }
}

// Block place/break manager
class BlockActionManager {
  constructor(socket) {
    this.socket = socket;
    this.reachDistance = 4;
    this.blockBreakTime = {
      stone: 1.15,
      dirt: 0.75,
      grass: 0.6,
      wood: 1.5
    };
  }

  canBreakBlock(playerPos, blockPos) {
    const distance = playerPos.distanceTo(blockPos);
    return distance <= this.reachDistance;
  }

  breakBlock(blockPos) {
    this.socket.emit('blockBreak', { position: blockPos });
  }

  placeBlock(blockPos, blockType) {
    this.socket.emit('blockPlace', { position: blockPos, blockType });
  }
}

// Performance monitor
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      fps: 0,
      memoryUsage: 0,
      drawCalls: 0,
      triangles: 0
    };
    this.frameTime = [];
    this.maxFrames = 60;
  }

  recordFrame(deltaTime) {
    this.frameTime.push(deltaTime);
    if (this.frameTime.length > this.maxFrames) {
      this.frameTime.shift();
    }
  }

  getFPS() {
    const avgTime = this.frameTime.reduce((a, b) => a + b, 0) / this.frameTime.length;
    return Math.round(1000 / avgTime);
  }

  getAverageFrameTime() {
    const avgTime = this.frameTime.reduce((a, b) => a + b, 0) / this.frameTime.length;
    return avgTime.toFixed(2);
  }

  getMemoryUsage() {
    if (performance.memory) {
      return (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB';
    }
    return 'N/A';
  }
}

// Crafting system helper
const CraftingRecipes = {
  'wooden_pickaxe': {
    name: 'Wooden Pickaxe',
    inputs: [{ type: 'wood', count: 3 }],
    output: { type: 'wooden_pickaxe', count: 1 },
    icon: '⛏️'
  },
  'stone_pickaxe': {
    name: 'Stone Pickaxe',
    inputs: [{ type: 'stone', count: 3 }],
    output: { type: 'stone_pickaxe', count: 1 },
    icon: '⛏️'
  },
  'crafting_table': {
    name: 'Crafting Table',
    inputs: [{ type: 'wood', count: 4 }],
    output: { type: 'crafting_table', count: 1 },
    icon: '🛠️'
  },
  'wooden_sword': {
    name: 'Wooden Sword',
    inputs: [{ type: 'wood', count: 2 }],
    output: { type: 'wooden_sword', count: 1 },
    icon: '⚔️'
  },
  'stone_sword': {
    name: 'Stone Sword',
    inputs: [{ type: 'stone', count: 2 }],
    output: { type: 'stone_sword', count: 1 },
    icon: '⚔️'
  }
};

// World management helper
class WorldManager {
  constructor(socket) {
    this.socket = socket;
    this.seed = null;
    this.spawnPoint = { x: 0, y: 64, z: 0 };
  }

  setSeed(seed) {
    this.seed = seed;
  }

  setSpawnPoint(x, y, z) {
    this.spawnPoint = { x, y, z };
  }

  getSpawnPoint() {
    return this.spawnPoint;
  }

  teleport(x, y, z) {
    this.socket.emit('playerMove', {
      position: { x, y, z },
      rotation: { x: 0, y: 0, z: 0 }
    });
  }
}

// Input handler for better control
class InputHandler {
  constructor() {
    this.movementSpeed = 0.15;
    this.sensitivity = 0.002;
    this.keysPressed = new Set();
    this.setupInputListeners();
  }

  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'shift') {
        this.isSneaking = true;
      }
      this.keysPressed.add(e.key.toLowerCase());
    });

    window.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() === 'shift') {
        this.isSneaking = false;
      }
      this.keysPressed.delete(e.key.toLowerCase());
    });
  }

  isMoving() {
    return this.keysPressed.has('w') || 
           this.keysPressed.has('a') || 
           this.keysPressed.has('s') || 
           this.keysPressed.has('d');
  }

  getMovementVector() {
    const vector = { x: 0, y: 0, z: 0 };

    if (this.keysPressed.has('w')) vector.z -= 1;
    if (this.keysPressed.has('s')) vector.z += 1;
    if (this.keysPressed.has('a')) vector.x -= 1;
    if (this.keysPressed.has('d')) vector.x += 1;

    const length = Math.sqrt(vector.x * vector.x + vector.z * vector.z);
    if (length > 0) {
      vector.x /= length;
      vector.z /= length;
      vector.x *= this.movementSpeed * (this.isSneaking ? 0.3 : 1);
      vector.z *= this.movementSpeed * (this.isSneaking ? 0.3 : 1);
    }

    return vector;
  }

  shouldJump() {
    return this.keysPressed.has(' ');
  }

  shouldSneak() {
    return this.isSneaking;
  }
}

// Export for use in game.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ChunkManager,
    DebugOverlay,
    BlockActionManager,
    PerformanceMonitor,
    CraftingRecipes,
    WorldManager,
    InputHandler
  };
}

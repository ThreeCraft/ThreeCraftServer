const { logMessage } = require("./errorHandler");

// Perlin-like noise generation for Minecraft terrain
class PerlinNoise {
  constructor(seed) {
    this.seed = seed;
    this.permutation = this.generatePermutation(seed);
    this.p = [...this.permutation, ...this.permutation];
  }

  generatePermutation(seed) {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(t, a, b) {
    return a + t * (b - a);
  }

  grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 8 ? y : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x, y, z) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = this.fade(xf);
    const v = this.fade(yf);
    const w = this.fade(zf);

    const aa = this.p[this.p[xi] + yi] + zi;
    const ab = this.p[this.p[xi] + this.p[yi + 1]] + zi;
    const ba = this.p[this.p[xi + 1] + yi] + zi;
    const bb = this.p[this.p[xi + 1] + this.p[yi + 1]] + zi;

    const aaa = this.p[aa];
    const aab = this.p[aa + 1];
    const aba = this.p[ab];
    const abb = this.p[ab + 1];
    const baa = this.p[ba];
    const bab = this.p[ba + 1];
    const bba = this.p[bb];
    const bbb = this.p[bb + 1];

    let x1, x2, y1, y2;
    x1 = this.lerp(u, this.grad(aaa, xf, yf, zf), this.grad(baa, xf - 1, yf, zf));
    x2 = this.lerp(u, this.grad(aba, xf, yf - 1, zf), this.grad(bba, xf - 1, yf - 1, zf));
    y1 = this.lerp(v, x1, x2);

    x1 = this.lerp(u, this.grad(aab, xf, yf, zf - 1), this.grad(bab, xf - 1, yf, zf - 1));
    x2 = this.lerp(u, this.grad(abb, xf, yf - 1, zf - 1), this.grad(bbb, xf - 1, yf - 1, zf - 1));
    y2 = this.lerp(v, x1, x2);

    return this.lerp(w, y1, y2);
  }
}

// Block type constants
const BlockTypes = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  OAK_LOG: 4,
  OAK_LEAVES: 5,
  SAND: 6,
  GRAVEL: 7,
  WATER: 8,
  LAVA: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  GOLD_ORE: 12,
  DIAMOND_ORE: 13,
  BEDROCK: 14
};

class WorldGenerator {
  constructor(seed) {
    this.seed = seed;
    this.noise = new PerlinNoise(seed);
    this.waterLevel = 62;
    this.chunkSizeY = 16; // Height sections

  }
  init() {
    logMessage(`WorldGenerator initialized with seed ${this.seed}`, 'INFO');
    logMessage(`Water Level set at Y=${this.waterLevel}`, 'INFO');
    logMessage(`Chunk vertical sections set to ${this.chunkSizeY}`, 'INFO');
    
  }
  generateChunk(chunkX, chunkZ, chunkSize, worldHeight) {
    // Initialize empty chunk
    const blocks = Array(chunkSize)
      .fill(null)
      .map(() =>
        Array(worldHeight)
          .fill(null)
          .map(() => Array(chunkSize).fill(BlockTypes.AIR))
      );

    // Generate terrain for this chunk
    for (let x = 0; x < chunkSize; x++) {
      for (let z = 0; z < chunkSize; z++) {
        const worldX = chunkX * chunkSize + x;
        const worldZ = chunkZ * chunkSize + z;

        // Generate terrain height at this location
        const height = this.getTerrainHeight(worldX, worldZ, worldHeight);

        // Fill blocks
        for (let y = 0; y < worldHeight; y++) {
          if (y === 0) {
            // Bedrock at bottom
            blocks[x][y][z] = BlockTypes.BEDROCK;
          } else if (y < height - 4) {
            // Stone
            blocks[x][y][z] = BlockTypes.STONE;
            
            // Add ores
            if (Math.random() < 0.01) {
              const rand = Math.random();
              if (rand < 0.5) blocks[x][y][z] = BlockTypes.COAL_ORE;
              else if (rand < 0.8) blocks[x][y][z] = BlockTypes.IRON_ORE;
              else if (rand < 0.95) blocks[x][y][z] = BlockTypes.GOLD_ORE;
              else blocks[x][y][z] = BlockTypes.DIAMOND_ORE;
            }
          } else if (y < height - 1) {
            // Dirt layer
            blocks[x][y][z] = BlockTypes.DIRT;
          } else if (y === height - 1) {
            // Grass on top
            if (y <= this.waterLevel) {
              blocks[x][y][z] = BlockTypes.SAND;
            } else {
              blocks[x][y][z] = BlockTypes.GRASS;
            }
          } else if (y <= this.waterLevel) {
            // Water above sand
            blocks[x][y][z] = BlockTypes.WATER;
          }
        }

        // Generate trees on grass
        if (height - 1 > this.waterLevel && Math.random() < 0.02) {
          this.generateTree(blocks, x, height, z, chunkSize, worldHeight);
        }
      }
    }

    return {
      x: chunkX,
      z: chunkZ,
      blocks: blocks,
      loaded: true
    };
  }

  getTerrainHeight(x, z, maxHeight) {
    // Multi-octave noise for more natural terrain
    let height = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < 4; i++) {
      height += this.noise.noise(
        (x * frequency) / 100,
        0,
        (z * frequency) / 100
      ) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    height = (height / maxAmplitude) * 0.5 + 0.5; // Normalize to 0-1
    const terrainHeight = Math.floor(height * (maxHeight * 0.6)) + 40; // Base height of 40 with variance

    return Math.max(2, Math.min(maxHeight - 1, terrainHeight));
  }

generateTree(blocks, x, groundLevel, z, chunkSize, worldHeight) {
  const variantRoll = Math.random();

  let trunkHeight = 5;
  let mega = false;

  if (variantRoll < 0.15) { 
    trunkHeight = 3 + Math.floor(Math.random() * 2); // short
  } else if (variantRoll < 0.75) {
    trunkHeight = 5 + Math.floor(Math.random() * 2); // normal
  } else if (variantRoll < 0.95) {
    trunkHeight = 7 + Math.floor(Math.random() * 2); // tall
  } else {
    mega = true; 
    trunkHeight = 7 + Math.floor(Math.random() * 3); // mega oak
  }

  const topY = groundLevel + trunkHeight;
  if (topY + 3 >= worldHeight) return;

  // === Mega trunk (2×2) ===
  const trunkRadius = mega ? 1 : 0;

  for (let y = groundLevel; y <= topY; y++) {
    for (let dx = -trunkRadius; dx <= trunkRadius; dx++) {
      for (let dz = -trunkRadius; dz <= trunkRadius; dz++) {
        const bx = x + dx;
        const bz = z + dz;

        if (
          bx >= 0 && bx < chunkSize &&
          bz >= 0 && bz < chunkSize
        ) {
          blocks[bx][y][bz] = BlockTypes.OAK_LOG;
        }
      }
    }
  }

  // === Branches ===
  const branchCount = mega ? 5 : Math.floor(Math.random() * 3) + 2;

  for (let i = 0; i < branchCount; i++) {
    const branchY = groundLevel + Math.floor(trunkHeight * (0.4 + Math.random() * 0.5));
    const dirX = Math.random() < 0.5 ? -1 : 1;
    const dirZ = Math.random() < 0.5 ? -1 : 1;

    const length = mega ? 3 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);

    let bx = x;
    let bz = z;

    for (let s = 0; s < length; s++) {
      bx += dirX;
      bz += dirZ;

      if (
        bx > 0 && bx < chunkSize &&
        bz > 0 && bz < chunkSize
      ) {
        blocks[bx][branchY][bz] = BlockTypes.OAK_LOG;

        // mini branch leaf puff
        this.addLeafBlob(blocks, bx, branchY, bz, chunkSize, worldHeight, mega ? 2 : 1);
      }
    }
  }

  // === Crown foliage ===
  const crownRadius = mega ? 3 : 2;

  this.addLeafBlob(blocks, x, topY, z, chunkSize, worldHeight, crownRadius);
  this.addLeafBlob(blocks, x, topY + 1, z, chunkSize, worldHeight, crownRadius - 1);

  // top leaf
  if (blocks[x][topY + 2][z] === BlockTypes.AIR) {
    blocks[x][topY + 2][z] = BlockTypes.OAK_LEAVES;
  }
}

// Helper to make a "puffy" random leaf blob
addLeafBlob(blocks, cx, cy, cz, chunkSize, worldHeight, radius) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dy = -1; dy <= 1; dy++) {

        const bx = cx + dx;
        const by = cy + dy;
        const bz = cz + dz;

        if (
          bx < 0 || bx >= chunkSize ||
          bz < 0 || bz >= chunkSize ||
          by < 0 || by >= worldHeight
        ) continue;

        const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 0.5;

        // Random leaf gaps for bushiness
        if (dist <= radius + (Math.random() * 0.5)) {
          if (blocks[bx][by][bz] === BlockTypes.AIR) {
            blocks[bx][by][bz] = BlockTypes.OAK_LEAVES;
          }
        }
      }
    }
  }
}


}

module.exports = { WorldGenerator, BlockTypes };

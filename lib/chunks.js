const path = require('path');
const fs = require('fs');
const { logMessage, validateCoordinates, validateChunkData, safeJsonParse, safeJsonStringify, ERROR_CODES } = require('./errorHandler');
const { log } = require('console');
async function sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

async function init(opts) {
  // Validate initialization options
  if (!opts || !opts.CHUNKS_DIR || !opts.worldGen || !opts.gameState) {
    throw new Error('Invalid initialization options for chunks module');
  }
  logMessage('--------------Frostnaut ThreeJS Chunk System--------------', 'INFO');
  await sleep(500);
  for (let i = 5; i > 0; i--) {
    logMessage(`Initializing chunk system in T-${i}s...`, 'INFO');
    await sleep(100);
  }
  
  const CHUNKS_DIR = opts.CHUNKS_DIR;
  const worldGen = opts.worldGen;
  const gameState = opts.gameState;
  logMessage('Chunk system initialized successfully', 'INFO');
logMessage('----------------------------------------------------------', 'INFO');
logMessage('Chunk Directory: ' + CHUNKS_DIR, 'INFO');
logMessage('World Seed: ' + gameState.worldSeed, 'INFO');
logMessage('Chunk Size: ' + gameState.chunkSize, 'INFO');
logMessage('World Height: ' + gameState.worldHeight, 'INFO');
logMessage('----------------------------------------------------------', 'INFO');

   const onSaveEvent = typeof opts.onSaveEvent === 'function' ? opts.onSaveEvent : null;
  
  let chunkLoadCache = new Map(); // Track failed loads to avoid repeated attempts
  const MAX_RETRIES = 2;
  // Simple rate-limited logger to avoid spamming repetitive messages
  const recentLogs = new Map();
  function rateLog(key, level, message, errorCode = null, additionalData = null, intervalMs = 5000) {
    try {
      const now = Date.now();
      const last = recentLogs.get(key) || 0;
      if (now - last < intervalMs) return; // skip
      recentLogs.set(key, now);
      //logMessage(message, level, errorCode, additionalData);
    } catch (e) {
      // swallow logging errors
    }
  }

  function ensureChunksDir() {
    try {
      if (!fs.existsSync(CHUNKS_DIR)) {
        fs.mkdirSync(CHUNKS_DIR, { recursive: true });
        //logMessage(`Created chunks directory: ${CHUNKS_DIR}`, 'INFO');
      }
    } catch (e) {
      //logMessage(`Failed to create chunks directory: ${CHUNKS_DIR}`, 'ERROR', ERROR_CODES.CHUNK_LOAD_FAILED, { error: e.message });
      throw e;
    }
  }

  function chunkFilePath(cx, cz) {
    try {
      validateCoordinates(cx, cz, 'chunk');
      return path.join(CHUNKS_DIR, `chunk_${Math.floor(cx)}_${Math.floor(cz)}.rc`);
    } catch (e) {
      //logMessage(`Invalid chunk file path request`, 'ERROR', ERROR_CODES.INVALID_COORDINATES, { cx, cz, error: e.message });
      throw e;
    }
  }

  async function saveChunkToDisk(cx, cz, chunk) {
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        // Validate inputs
        validateCoordinates(cx, cz, 'chunk');
        validateChunkData(chunk);
        
        ensureChunksDir();
        const fp = chunkFilePath(cx, cz);
        
        // Create chunk data with formatted JSON for easier diffing
        const out = { x: Math.floor(cx), z: Math.floor(cz), blocks: chunk.blocks, savedAt: Date.now() };
        const jsonData = safeJsonStringify(out, `chunk_${cx}_${cz}`);
        
        await fs.promises.writeFile(fp, jsonData, 'utf8');
        //logMessage(`Saved chunk (${cx}, ${cz}) successfully`, 'DEBUG');
        // notify listener (e.g. server) that a chunk was saved
        try { if (onSaveEvent) onSaveEvent({ type: 'save', cx: Math.floor(cx), cz: Math.floor(cz), timestamp: Date.now(), success: true }); } catch (e) {}
        return;
      } catch (e) {
        attempt++;
        if (attempt < MAX_RETRIES) {
          //logMessage(
          //  `Failed to save chunk (${cx}, ${cz}) - attempt ${attempt}/${MAX_RETRIES}`,
          //  'WARN',
          //  ERROR_CODES.CHUNK_SAVE_FAILED,
          //  { error: e.message }
          //);
          await new Promise(r => setTimeout(r, 100)); // Backoff before retry
        } else {
        //  logMessage(
        //    `Permanently failed to save chunk (${cx}, ${cz}) after ${MAX_RETRIES} attempts`,
        //    'ERROR',
       //     ERROR_CODES.CHUNK_SAVE_FAILED,
       //     { error: e.message, coordinates: `${cx},${cz}` }
       //   );
          try { if (onSaveEvent) onSaveEvent({ type: 'save_failed', cx: Math.floor(cx), cz: Math.floor(cz), timestamp: Date.now(), error: e.message }); } catch(e) {}
          throw e;
        }
      }
    }
  }

  async function loadChunkFromDisk(cx, cz) {
    try {
      // Validate inputs
      validateCoordinates(cx, cz, 'chunk');
      
      const fp = chunkFilePath(cx, cz);
      
      if (!fs.existsSync(fp)) {
        rateLog(`notfound:${cx},${cz}`, 'DEBUG', `Chunk file not found (${cx}, ${cz}) - will generate`, null, { filePath: fp }, 5000);
        return null;
      }
      
      const raw = await fs.promises.readFile(fp, 'utf8');
      
      if (!raw || raw.trim().length === 0) {
        //logMessage(
        //  `Chunk file is empty (${cx}, ${cz})`,
        //  'WARN',
        //  ERROR_CODES.CHUNK_INVALID_DATA,
        //  { filePath: fp }
        //);
        return null;
      }
      
      // Attempt to parse JSON; if it fails, quarantine the corrupted file to avoid repeated parse attempts
      let obj = null;
      try {
        obj = safeJsonParse(raw, `chunk_${cx}_${cz}`);
      } catch (parseErr) {
        try {
          const corruptPath = `${fp}.corrupt.${Date.now()}`;
          await fs.promises.rename(fp, corruptPath);
          logMessage(`Quarantined corrupted chunk file: moved to ${corruptPath}`, 'WARN', ERROR_CODES.CHUNK_PARSE_FAILED, { original: fp, movedTo: corruptPath });
        } catch (mvErr) {
          logMessage(`Failed to quarantine corrupted chunk file: ${fp}`, 'ERROR', ERROR_CODES.CHUNK_PARSE_FAILED, { error: mvErr.message });
        }
        // Return null so the server will generate a fresh chunk
        return null;
      }

      // Validate loaded chunk structure
      validateChunkData(obj);

      //logMessage(`Loaded chunk (${cx}, ${cz}) from disk`, 'DEBUG');
      return obj; // { x, z, blocks, savedAt }
    } catch (e) {
      logMessage(
        `Failed to load chunk (${cx}, ${cz}) from disk`,
        'ERROR',
        ERROR_CODES.CHUNK_LOAD_FAILED,
        { error: e.message, coordinates: `${cx},${cz}` }
      );
      return null;
    }
  }

  async function loadOrGenerateChunk(cx, cz) {
    try {
      validateCoordinates(cx, cz, 'chunk');
      
      // Check if chunk exists on disk
      const diskChunk = await loadChunkFromDisk(cx, cz);
      if (diskChunk) {
        return { x: Math.floor(cx), z: Math.floor(cz), blocks: diskChunk.blocks };
      }

      // Generate new chunk if not found
      //rateLog(`generate:${cx},${cz}`, 'DEBUG', `Generating new chunk (${cx}, ${cz})`, null, null, 2000);
      
      if (!worldGen || !worldGen.generateChunk) {
        throw new Error('World generator not available');
      }
      
      const gen = worldGen.generateChunk(cx, cz, gameState.chunkSize, gameState.worldHeight);
      
      if (!gen || !gen.blocks) {
        throw new Error('World generator produced invalid chunk data');
      }
      
      // Save newly generated chunk (fire and forget, with error handling)
      saveChunkToDisk(cx, cz, gen).catch(e => {
        logMessage(
          `Failed to persist generated chunk (${cx}, ${cz})`,
          'WARN',
          ERROR_CODES.CHUNK_SAVE_FAILED,
          { error: e.message }
        );
      });
      
      return gen;
    } catch (e) {
      logMessage(
        `Fatal error loading/generating chunk (${cx}, ${cz})`,
        'ERROR',
        ERROR_CODES.CHUNK_LOAD_FAILED,
        { error: e.message }
      );
      throw e;
    }
  }

  return {
    ensureChunksDir,
    chunkFilePath,
    saveChunkToDisk,
    loadChunkFromDisk,
    loadOrGenerateChunk
  };
}

module.exports = { init };

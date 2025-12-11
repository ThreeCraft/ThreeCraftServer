const path = require('path');
const fs = require('fs');
const { logMessage, safeJsonParse, safeJsonStringify, validateFilePath, ERROR_CODES } = require('./errorHandler');

const LEVEL_FILE = path.join(__dirname, '..', 'world', 'level.dat');
const MAX_RETRIES = 2;

function ensureWorldDir() {
  const dir = path.join(__dirname, '..', 'world');
  try {
    validateFilePath(dir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logMessage(`Created world directory: ${dir}`, 'INFO');
    }
  } catch (e) {
    logMessage(
      `Failed to create world directory: ${dir}`,
      'ERROR',
      ERROR_CODES.WORLD_LOAD_FAILED,
      { error: e.message }
    );
    throw e;
  }
}

function createDefaultLevel() {
  const defaultLevel = {
    seed: Math.floor(Math.random() * 1000000),
    created: Date.now(),
    lastSaved: Date.now(),
    version: '1.0.0',
    players: {}
  };
  logMessage(`Created default level with seed: ${defaultLevel.seed}`, 'INFO');
  return defaultLevel;
}

async function loadLevel() {
  try {
    ensureWorldDir();
    
    if (!fs.existsSync(LEVEL_FILE)) {
      logMessage(`Level file not found, creating new: ${LEVEL_FILE}`, 'INFO');
      const level = createDefaultLevel();
      await fs.promises.writeFile(LEVEL_FILE, safeJsonStringify(level, 'level.dat'), 'utf8');
      return level;
    }
    
    const raw = await fs.promises.readFile(LEVEL_FILE, 'utf8');
    
    if (!raw || raw.trim().length === 0) {
      logMessage(`Level file is empty, creating new level data`, 'WARN', ERROR_CODES.WORLD_LOAD_FAILED);
      const level = createDefaultLevel();
      await fs.promises.writeFile(LEVEL_FILE, safeJsonStringify(level, 'level.dat'), 'utf8');
      return level;
    }
    
    const obj = safeJsonParse(raw, 'level.dat');
    
    // Validate required fields
    if (typeof obj.seed !== 'number' || !Number.isFinite(obj.seed)) {
      logMessage(`Invalid seed in level.dat, regenerating`, 'WARN', ERROR_CODES.WORLD_LOAD_FAILED);
      obj.seed = Math.floor(Math.random() * 1000000);
    }
    
    if (!obj.created || typeof obj.created !== 'number') {
      obj.created = Date.now();
    }
    
    if (!obj.players) {
      obj.players = {};
    }
    
    obj.lastLoaded = Date.now();
    logMessage(`Loaded level with seed: ${obj.seed}`, 'INFO');
    return obj;
  } catch (e) {
    logMessage(
      `Failed to load level.dat - creating fallback`,
      'ERROR',
      ERROR_CODES.WORLD_LOAD_FAILED,
      { error: e.message }
    );
    
    // Create fallback level
    const fallback = createDefaultLevel();
    try {
      await fs.promises.writeFile(LEVEL_FILE, safeJsonStringify(fallback, 'level.dat'), 'utf8');
      logMessage(`Created fallback level file`, 'INFO');
    } catch (writeErr) {
      logMessage(
        `Failed to write fallback level file`,
        'ERROR',
        ERROR_CODES.WORLD_SAVE_FAILED,
        { error: writeErr.message }
      );
    }
    return fallback;
  }
}

async function saveLevel(obj) {
  if (!obj || typeof obj !== 'object') {
    logMessage(
      `Invalid level object provided to saveLevel`,
      'ERROR',
      ERROR_CODES.INVALID_DATA_TYPE,
      { receivedType: typeof obj }
    );
    throw new Error('Level must be an object');
  }

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      ensureWorldDir();
      
      // Ensure required fields
      if (!obj.seed) obj.seed = Math.floor(Math.random() * 1000000);
      if (!obj.created) obj.created = Date.now();
      
      obj.lastSaved = Date.now();
      obj.version = obj.version || '1.0.0';
      
      const jsonData = safeJsonStringify(obj, 'level.dat');
      await fs.promises.writeFile(LEVEL_FILE, jsonData, 'utf8');
      logMessage(`Saved level to disk`, 'DEBUG', null, { seed: obj.seed });
      return;
    } catch (e) {
      attempt++;
      if (attempt < MAX_RETRIES) {
        logMessage(
          `Failed to save level (attempt ${attempt}/${MAX_RETRIES})`,
          'WARN',
          ERROR_CODES.WORLD_SAVE_FAILED,
          { error: e.message }
        );
        await new Promise(r => setTimeout(r, 100));
      } else {
        logMessage(
          `Permanently failed to save level after ${MAX_RETRIES} attempts`,
          'ERROR',
          ERROR_CODES.WORLD_SAVE_FAILED,
          { error: e.message, filePath: LEVEL_FILE }
        );
        throw e;
      }
    }
  }
}

module.exports = { loadLevel, saveLevel };

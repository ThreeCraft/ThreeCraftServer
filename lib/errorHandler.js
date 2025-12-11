/**
 * Centralized error handling and logging utility
 * Provides consistent error codes, logging, and validation across the server
 */

const ERROR_CODES = {
  // Chunk errors
  CHUNK_LOAD_FAILED: 'CHUNK_LOAD_FAILED',
  CHUNK_SAVE_FAILED: 'CHUNK_SAVE_FAILED',
  CHUNK_PARSE_FAILED: 'CHUNK_PARSE_FAILED',
  CHUNK_INVALID_DATA: 'CHUNK_INVALID_DATA',
  
  // Storage errors
  STORAGE_READ_FAILED: 'STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
  STORAGE_PARSE_FAILED: 'STORAGE_PARSE_FAILED',
  
  // World errors
  WORLD_LOAD_FAILED: 'WORLD_LOAD_FAILED',
  WORLD_SAVE_FAILED: 'WORLD_SAVE_FAILED',
  
  // Validation errors
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  INVALID_CHUNK_SIZE: 'INVALID_CHUNK_SIZE',
  INVALID_DATA_TYPE: 'INVALID_DATA_TYPE',
  
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',

  //Anti Cheat
  ANTI_CHEAT_VIOLATION: 'ANTI_CHEAT_VIOLATION',
  ANTI_CHEAT_GRAVITY_HACK_DETECTED: 'ANTI_CHEAT_GRAVITY_HACK',
  ANTI_CHEAT_SPEED_HACK_DETECTED: 'ANTI_CHEAT_SPEED_HACK',
  ANTI_CHEAT_TELEPORT_DETECTED: 'ANTI_CHEAT_TELEPORT_HACK',
  
  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

const LOG_LEVELS = {
  DEBUG: { level: 0, prefix: '[DEBUG]', color: '\x1b[36m' },
  INFO: { level: 1, prefix: '[INFO]', color: '\x1b[90m' },
  WARN: { level: 2, prefix: '[WARN]', color: '\x1b[33m' },
  ERROR: { level: 3, prefix: '[ERROR]', color: '\x1b[31m' },
  CRITICAL: { level: 4, prefix: '[CRITICAL]', color: '\x1b[35m' },
  FALIURE: { level: 5, prefix: '[FALIURE]', color: '\x1b[31m\x1b[5m' },
  SUCCESS: { level: 6, prefix: '[SUCCESS]', color: '\x1b[32m' },
  CHEAT: { level: 7, prefix: '[ANTI CHEAT]', color: '\x1b[43m\x1b[31m\x1b[5m\x1b[4m' }
};

// In-memory log buffer to allow saving logs on critical shutdowns
const LOG_BUFFER = [];
const MAX_LOG_BUFFER = 20000;
let ErrorHandlerSocket = null; // Socket.IO instance for emitting logs if needed
function _recordLogToBuffer(message, level = 'INFO', errorCode = null, additionalData = null) {
  try {
    const entry = { timestamp: new Date().toISOString(), level, message, code: errorCode || null, data: additionalData || null };
    LOG_BUFFER.push(entry);
    if (LOG_BUFFER.length > MAX_LOG_BUFFER) LOG_BUFFER.shift();
  } catch (e) {}
}


function SetSocket(ioInstance) {
  ErrorHandlerSocket = ioInstance;
}
/**
 * Structured logging with timestamps and error codes
 */
function logMessage(message, level = 'INFO', errorCode = null, additionalData = null) {
  const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  const timestamp = new Date().toISOString();
  const reset = '\x1b[0m';
  
  let logOutput = `${logLevel.color}[${timestamp}] ${logLevel.prefix} ${message}${reset}`;
  if (errorCode) {
    logOutput += ` | CODE: ${errorCode}`;
  }
  if (additionalData) {
    logOutput += ` | ${JSON.stringify(additionalData)}`;
  }
  
  console.log(logOutput);
  if (ErrorHandlerSocket) {
    ErrorHandlerSocket.emit('consoleOutput', logOutput);
  }
  _recordLogToBuffer(message, level, errorCode, additionalData);
}

const fs = require('fs');

/**
 * Save current in-memory log buffer to a file (JSON lines)
 */
function saveLogsToFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const out = LOG_BUFFER.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFile(filePath, out, 'utf8', (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Save a compacted, human-readable version of the in-memory log buffer.
 * Consecutive identical messages (ignoring timestamp) are collapsed and annotated with X[count].
 */
function saveCompactedLogsToFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Build compacted lines: compare level+message+code+data (ignore timestamp)
      const makeKey = (e) => {
        try {
          return `${e.level || 'INFO'}|${e.message || ''}|${e.code || ''}|${JSON.stringify(e.data || null)}`;
        } catch (ex) {
          return `${e.level || 'INFO'}|${e.message || ''}|${e.code || ''}|[unserializable]`;
        }
      };

      const lines = [];
      let lastKey = null;
      let lastEntry = null;
      let count = 0;

      for (const e of LOG_BUFFER) {
        const key = makeKey(e);
        if (key === lastKey) {
          count++;
        } else {
          if (lastEntry !== null) {
            // produce a human-readable line for lastEntry
            const ts = lastEntry.timestamp || new Date().toISOString();
            const lvl = lastEntry.level || 'INFO';
            let line = `[${ts}] ${lvl} ${lastEntry.message || ''}`;
            if (lastEntry.code) line += ` | CODE: ${lastEntry.code}`;
            if (lastEntry.data) {
              try { line += ` | ${JSON.stringify(lastEntry.data)}`; } catch (ee) { line += ` | [data]`; }
            }
            if (count > 1) line += ` X[${count}]`;
            lines.push(line);
          }
          // reset
          lastKey = key;
          lastEntry = e;
          count = 1;
        }
      }
      // flush tail
      if (lastEntry !== null) {
        const ts = lastEntry.timestamp || new Date().toISOString();
        const lvl = lastEntry.level || 'INFO';
        let line = `[${ts}] ${lvl} ${lastEntry.message || ''}`;
        if (lastEntry.code) line += ` | CODE: ${lastEntry.code}`;
        if (lastEntry.data) {
          try { line += ` | ${JSON.stringify(lastEntry.data)}`; } catch (ee) { line += ` | [data]`; }
        }
        if (count > 1) line += ` X[${count}]`;
        lines.push(line);
      }

      const out = lines.join('\n') + '\n';
      fs.writeFile(filePath, out, 'utf8', (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Validate coordinate values
 */
function validateCoordinates(cx, cz, fieldName = 'chunk') {
  if (typeof cx !== 'number' || typeof cz !== 'number' || !Number.isFinite(cx) || !Number.isFinite(cz)) {
    throw new Error(`Invalid ${fieldName} coordinates: (${cx}, ${cz}) - must be finite numbers`);
  }
  return true;
}

/**
 * Validate block data structure
 */
function validateChunkData(chunk) {
  if (!chunk || typeof chunk !== 'object') {
    throw new Error('Chunk data must be an object');
  }
  
  if (!Array.isArray(chunk.blocks)) {
    throw new Error('Chunk data must contain blocks array');
  }
  
  if (typeof chunk.x !== 'number' || typeof chunk.z !== 'number') {
    throw new Error('Chunk must have valid x and z coordinates');
  }
  
  return true;
}

/**
 * Safely parse JSON with error information
 */
function safeJsonParse(jsonString, context = 'unknown') {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      throw new Error(`Invalid input: expected string, got ${typeof jsonString}`);
    }
    return JSON.parse(jsonString);
  } catch (e) {
    logMessage(
      `Failed to parse JSON in ${context}`,
      'ERROR',
      ERROR_CODES.CHUNK_PARSE_FAILED,
      { error: e.message, stringLength: jsonString ? jsonString.length : 0 }
    );
    throw new Error(`JSON Parse Error (${context}): ${e.message}`);
  }
}

/**
 * Safely stringify JSON with error handling
 */
function safeJsonStringify(obj, context = 'unknown') {
  try {
    if (obj === null || obj === undefined) {
      throw new Error('Cannot stringify null or undefined');
    }
    return JSON.stringify(obj);
  } catch (e) {
    logMessage(
      `Failed to stringify object in ${context}`,
      'ERROR',
      ERROR_CODES.INVALID_DATA_TYPE,
      { error: e.message, objectType: typeof obj }
    );
    throw new Error(`JSON Stringify Error (${context}): ${e.message}`);
  }
}

/**
 * Validate file path exists and is accessible
 */
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }
  return true;
}

/**
 * Create detailed error object for error responses
 */
function createErrorResponse(errorCode, message, details = {}) {
  return {
    success: false,
    error: {
      code: errorCode,
      message: message,
      timestamp: Date.now(),
      ...details
    }
  };
}

/**
 * Create success response object
 */
function createSuccessResponse(data = {}) {
  return {
    success: true,
    data,
    timestamp: Date.now()
  };
}

/**
 * Wrap async function with error handling
 */
function withErrorHandling(asyncFn, context = 'operation') {
  return async function(...args) {
    try {
      return await asyncFn(...args);
    } catch (error) {
      logMessage(
        `Unexpected error in ${context}`,
        'ERROR',
        ERROR_CODES.UNKNOWN_ERROR,
        { 
          error: error.message,
          stack: error.stack
        }
      );
      throw error;
    }
  };
}

module.exports = {
  ERROR_CODES,
  LOG_LEVELS,
  logMessage,
  saveLogsToFile,
  saveCompactedLogsToFile,
  validateCoordinates,
  validateChunkData,
  validateFilePath,
  safeJsonParse,
  safeJsonStringify,
  createErrorResponse,
  createSuccessResponse,
  withErrorHandling,
  SetSocket,
  ErrorHandlerSocket
};

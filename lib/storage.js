const path = require('path');
const fs = require('fs');
const { logMessage, safeJsonParse, safeJsonStringify, validateFilePath, ERROR_CODES } = require('./errorHandler');

const USERS_FILE = path.join(__dirname, '..', 'saves', 'users.json');
const MAX_RETRIES = 3;

function ensureSavesDir() {
  const dir = path.join(__dirname, '..', 'saves');
  try {
    validateFilePath(dir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logMessage(`Created saves directory: ${dir}`, 'INFO');
    }
  } catch (e) {
    logMessage(
      `Failed to create saves directory: ${dir}`,
      'ERROR',
      ERROR_CODES.STORAGE_READ_FAILED,
      { error: e.message }
    );
    throw e;
  }
}

async function readUsers() {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      ensureSavesDir();
      
      if (!fs.existsSync(USERS_FILE)) {
        logMessage(`Users file not found, creating new: ${USERS_FILE}`, 'INFO');
        await fs.promises.writeFile(USERS_FILE, '{}', 'utf8');
        return {};
      }
      
      const raw = await fs.promises.readFile(USERS_FILE, 'utf8');
      
      if (!raw || raw.trim().length === 0) {
        logMessage(`Users file is empty, treating as empty object`, 'WARN');
        return {};
      }
      
      const users = safeJsonParse(raw, 'users.json');
      
      // Validate it's an object
      if (typeof users !== 'object' || users === null || Array.isArray(users)) {
        throw new Error('Users data must be an object');
      }
      
      logMessage(`Loaded ${Object.keys(users).length} users from storage`, 'DEBUG');
      return users;
    } catch (e) {
      attempt++;
      if (attempt < MAX_RETRIES) {
        logMessage(
          `Failed to read users (attempt ${attempt}/${MAX_RETRIES})`,
          'WARN',
          ERROR_CODES.STORAGE_READ_FAILED,
          { error: e.message }
        );
        await new Promise(r => setTimeout(r, 100));
      } else {
        logMessage(
          `Permanently failed to read users after ${MAX_RETRIES} attempts - returning empty object`,
          'ERROR',
          ERROR_CODES.STORAGE_READ_FAILED,
          { error: e.message, filePath: USERS_FILE }
        );
        return {};
      }
    }
  }
}

async function writeUsers(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    logMessage(
      `Invalid users object provided to writeUsers`,
      'ERROR',
      ERROR_CODES.INVALID_DATA_TYPE,
      { receivedType: typeof obj }
    );
    throw new Error('Users must be an object');
  }

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      ensureSavesDir();
      const jsonData = safeJsonStringify(obj, 'users.json');
      await fs.promises.writeFile(USERS_FILE, jsonData, 'utf8');
      logMessage(`Saved ${Object.keys(obj).length} users to storage`, 'DEBUG');
      return;
    } catch (e) {
      attempt++;
      if (attempt < MAX_RETRIES) {
        logMessage(
          `Failed to write users (attempt ${attempt}/${MAX_RETRIES})`,
          'WARN',
          ERROR_CODES.STORAGE_WRITE_FAILED,
          { error: e.message }
        );
        await new Promise(r => setTimeout(r, 100));
      } else {
        logMessage(
          `Permanently failed to write users after ${MAX_RETRIES} attempts`,
          'ERROR',
          ERROR_CODES.STORAGE_WRITE_FAILED,
          { error: e.message, filePath: USERS_FILE }
        );
        throw e;
      }
    }
  }
}

async function saveUser(clientId, username) {
  try {
    if (!clientId || typeof clientId !== 'string') {
      logMessage(
        `Invalid clientId for saveUser`,
        'WARN',
        ERROR_CODES.INVALID_DATA_TYPE,
        { clientId, username }
      );
      return;
    }
    
    if (!username || typeof username !== 'string') {
      logMessage(
        `Invalid username for saveUser`,
        'WARN',
        ERROR_CODES.INVALID_DATA_TYPE,
        { clientId, username }
      );
      return;
    }
    
    const users = await readUsers();
    users[clientId] = users[clientId] || {};
    users[clientId].username = username.slice(0, 32); // Limit username length
    users[clientId].lastSeen = Date.now();
    users[clientId].joined = users[clientId].joined || Date.now();
    
    await writeUsers(users);
    logMessage(`Saved user: ${clientId}`, 'DEBUG', null, { username });
  } catch (e) {
    logMessage(
      `Failed to save user`,
      'ERROR',
      ERROR_CODES.STORAGE_WRITE_FAILED,
      { clientId, username, error: e.message }
    );
  }
}

async function getUser(clientId) {
  try {
    if (!clientId || typeof clientId !== 'string') {
      logMessage(
        `Invalid clientId for getUser`,
        'WARN',
        ERROR_CODES.INVALID_DATA_TYPE,
        { clientId }
      );
      return null;
    }
    
    const users = await readUsers();
    const user = users[clientId] || null;
    
    if (user) {
      logMessage(`Retrieved user: ${clientId}`, 'DEBUG');
    }
    
    return user;
  } catch (e) {
    logMessage(
      `Failed to get user`,
      'ERROR',
      ERROR_CODES.STORAGE_READ_FAILED,
      { clientId, error: e.message }
    );
    return null;
  }
}

module.exports = {
  saveUser,
  getUser,
  readUsers,
  writeUsers
};

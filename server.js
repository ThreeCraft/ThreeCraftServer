const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});


// ... (folders and files objects defined as in your snippet) ...
const folders = {
  "lib": path.join(__dirname, "lib"),
  "routes": path.join(__dirname, "routes"),
  "gui": path.join(__dirname, "gui"),
  "world": path.join(__dirname, "world"),
  "world_chunks": path.join(__dirname, "world", "chunks"),
  "saves": path.join(__dirname, "saves"),
  "logs": path.join(__dirname, "logs"),
  "resources": path.join(__dirname, "resources"),
  "bin": path.join(__dirname, "bin"),
  "plugins": path.join(__dirname, "plugins"),
};

const files = {
  "compactLogs": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/bin/compactLogs.js", path.join(__dirname, "bin", "compactLogs.js")],
  "chunks": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/chunks.js", path.join(__dirname, "lib", "chunks.js")],
  "errorHandler": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/errorHandler.js", path.join(__dirname, "lib", "errorHandler.js")],
  "storage": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/storage.js", path.join(__dirname, "lib", "storage.js")],
  "world": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/world.js", path.join(__dirname, "lib", "world.js")],
  "worldgen": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/worldgen.js", path.join(__dirname, "lib", "worldgen.js")],
  "users": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/routes/users.js", path.join(__dirname, "routes", "users.js")],
  "dashboard": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/gui/dashboard.js", path.join(__dirname, "gui", "dashboard.js")],
  "index": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/gui/index.html", path.join(__dirname, "gui", "index.html")],
  "style": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/gui/style.css", path.join(__dirname, "gui", "style.css")],
  "utils": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/gui/utils.js", path.join(__dirname, "lib", "utils.js")],
  "server": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/server.properties", path.join(__dirname, "server.properties")],
    "plugins": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/plugins.js", path.join(__dirname,"lib", "plugins.js")],
      "pythonBridge": ["https://cdn.jsdelivr.net/gh/ThreeCraft/ThreeCraftServer/lib/pythonBridge.js", path.join(__dirname,"lib", "pythonBridge.js")]
};


// --- Helper Functions (Promisified for Async/Await) ---

function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
    console.log(`Created directory: ${dirname}`);
  }
}

// Function that returns a Promise, allowing us to 'await' a single download
function downloadFileAsync(remoteUrl, localPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(localPath)) {
      //console.log(`File already exists: ${localPath}`);
      return resolve(true); // Already present, resolve immediately
    }
    
    ensureDirectoryExists(localPath);
    const fileWriteStream = fs.createWriteStream(localPath);

    https.get(remoteUrl, (response) => {
      console.log(`Status ${response.statusCode} for ${remoteUrl}`); // This should now appear!

      if (response.statusCode === 200) {
        response.pipe(fileWriteStream);
        fileWriteStream.on("finish", () => {
          fileWriteStream.close();
          console.log(`Successfully downloaded: ${localPath}`);
          resolve(true); // Success
        });
      } else {
        fs.unlink(localPath, () => {}); // Clean up partial file
        reject(new Error(`Failed to download ${remoteUrl}. Status: ${response.statusCode}`));
      }
    }).on("error", (err) => {
      fs.unlink(localPath, () => {}); // Clean up on network error
      reject(err); // Network level error
    });
  });
}

// --- Main Execution Logic using async/await ---

async function initializeAndStartServer() {
  const ServerPort = 25565;
  console.log("Starting Initialization...");

  //Creating Batch Starter
  const batchContents = `
  @echo off
REM ThreeCraft
Title ThreeCraft Server
 for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
echo.
echo %ESC%[93m ========================================
echo    ThreeCraft Server
echo ======================================== %ESC%[0m
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo %ESC%[91mDependencies not found.%ESC%[0m
    echo %ESC%[92mInstalling dependencies...%ESC%[0m
    call npm install
    echo.
)

echo %ESC%[92mStarting server...%ESC%[0m
echo.
echo %ESC%[93mServer will run on: http://localhost:25565%ESC%[0m
echo %ESC%[95mOpen this URL in your browser to play!%ESC%[0m
echo.
echo %ESC%[91mPress Ctrl+C to stop the server%ESC%[0m
echo.

call node server.js
pause
  `

  const batchPath = path.join(__dirname, "start_server.bat");
  if (!fs.existsSync(batchPath)) {
    fs.writeFileSync(batchPath, batchContents, "utf8");
    console.log("Created start_server.bat");
  }



  // 1. Create base folders synchronously (this part of your script was correct)
  for (const key in folders) {
    if (!fs.existsSync(folders[key])) {
      fs.mkdirSync(folders[key], { recursive: true });
      console.log(`Created missing folder: ${folders[key]}`);
    }
  }

  // 2. Download files asynchronously, WAITING for all to finish
  console.log("Starting file downloads");
  
  const downloadPromises = Object.keys(files).map(key => 
    downloadFileAsync(files[key][0], files[key][1])
  );

  try {
    await Promise.all(downloadPromises);
    console.log("✅ All files downloaded successfully!");

    // 3. NOW it is safe to require local modules and start the server
    const { WorldGenerator } = require("./lib/worldgen");
    const chunksLib = require("./lib/chunks");
    const storage = require("./lib/storage");
    const usersRouter = require("./routes/users");
    const worldLib = require("./lib/world");
    const { logMessage, ERROR_CODES, SetSocket, ErrorHandlerSocket } = require("./lib/errorHandler");
const PluginManager = require("./lib/plugins");
const { PythonBridge, PythonPluginHelper } = require("./lib/pythonBridge");

    console.log("Required all local modules successfully. Server ready to boot.");
    
SetSocket(io); // Assign Socket.IO instance to error handler for log emission
// Directory for persistent chunk files
const CHUNKS_DIR = path.join(__dirname, "world", "chunks");

// We'll use a small chunks helper to encapsulate disk IO and generation logic
// `chunks` is initialized after `worldGen` and `gameState` are defined below.

// Server state

const ServerInfo = {
  name: "ThreeCraft Integrated Server",
  consoleName: "IntegratedServer",
  version: "1.1.5",
  SupportedGameVersion: "1.0.0",
  ThirdPartyClientsAllowed: true,
};

const gameState = {
  players: {},
  chunks: {},
  drops: {},
  worldSeed: null,
  chunkSize: 16,
  worldHeight: 256,
  startTime: Date.now(),
  totalPacketsSent: 0,
  totalPacketsReceived: 0,
  totalDataSent: 0,
  totalDataReceived: 0,
};

// Plugin and Python Bridge systems initialization
let pluginManager = null;
let pythonBridge = null;

// Mapping from block id to item type name for drops/inventory
const BLOCK_ID_TO_ITEM = {
  1: "stone",
  2: "dirt",
  3: "grass",
  4: "oak_log",
  5: "oak_leaves",
  6: "sand",
  7: "gravel",
  8: "water",
  9: "lava",
  10: "coal_ore",
  11: "iron_ore",
  12: "gold_ore",
  13: "diamond_ore",
  14: "bedrock",
};

const ITEM_TO_BLOCK_ID = Object.fromEntries(
  Object.entries(BLOCK_ID_TO_ITEM).map(([k, v]) => [v, Number(k)]),
);

let nextDropId = 1;
function generateDropId() {
  return `d${nextDropId++}`;
}

// World generator and chunk helper will be initialized during startup
let worldGen = null;
let chunks = null;
function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}
// Middleware
app.use(express.static(path.join(__dirname, "gui")));
// Parse JSON bodies for API endpoints
app.use(express.json());

// User API (register / query)
app.use("/api/users", usersRouter);

// Expose level data for dashboard inspection
app.get("/api/world", async (req, res) => {
  try {
    const lvl = await worldLib.loadLevel();
    if (!lvl) {
      return res
        .status(500)
        .json({
          error: "Failed to load world data",
          code: ERROR_CODES.WORLD_LOAD_FAILED,
        });
    }
    return res.json(lvl);
  } catch (e) {
    logMessage(
      "Failed to read level data for API",
      "ERROR",
      ERROR_CODES.WORLD_LOAD_FAILED,
      { error: e.message },
    );
    return res
      .status(500)
      .json({
        error: "Failed to read level data",
        code: ERROR_CODES.WORLD_LOAD_FAILED,
      });
  }
});

// Provide block type table to clients (id -> name and name -> id)
app.get("/api/blockTypes", (req, res) => {
  try {
    return res.json({ idToName: BLOCK_ID_TO_ITEM, nameToId: ITEM_TO_BLOCK_ID });
  } catch (e) {
    logMessage(
      "Failed to serve block types",
      "ERROR",
      ERROR_CODES.UNKNOWN_ERROR,
      { error: e.message },
    );
    return res.status(500).json({ error: "failed" });
  }
});

// Routes
// Dashboard route
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "gui", "index.html"));
});


// Serve resource files via an endpoint (safe, prevents directory traversal)
app.get("/api/resource", (req, res) => {
  try {
    const rel = req.query.path;
    if (!rel || typeof rel !== "string")
      return res.status(400).json({ error: "missing path" });

    // Normalize and sanitize path
    const safePath = path.normalize(rel).replace(/^\/+/, "");
    if (safePath.includes(".."))
      return res.status(400).json({ error: "invalid path" });

    // Prefer server-side resources directory; fall back to Client/resources if present
    const candidateBases = [
      path.join(__dirname, "resources")
    ];
    let base = null;
    for (const b of candidateBases) {
      if (fs.existsSync(b)) {
        base = b;
        break;
      }
    }
    if (!base) {
      // No resources directory found on server
      return res.status(404).json({ error: "not found" });
    }
    const fp = path.join(base, safePath);

    if (!fp.startsWith(base))
      return res.status(400).json({ error: "invalid path" });
    if (!fs.existsSync(fp)) return res.status(404).json({ error: "not found" });

    // Simple mime type mapping
    const ext = path.extname(fp).toLowerCase();
    const mimeMap = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".json": "application/json",
      ".txt": "text/plain",
      ".svg": "image/svg+xml",
    };

    const ct = mimeMap[ext] || "application/octet-stream";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const stream = fs.createReadStream(fp);
    stream.on("error", (e) => {
      logMessage(
        "Failed to stream resource file",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { path: safePath, error: e.message },
      );
      res.status(500).end();
    });
    stream.pipe(res);
    logMessage(
      `Served resource file ${safePath} from base ${base} to ${req.ip}`,
      "DEBUG",
    );
  } catch (e) {
    logMessage("Error in /api/resource", "ERROR", ERROR_CODES.UNKNOWN_ERROR, {
      error: e.message,
    });
    res.status(500).json({ error: "failed" });
  }
});



async function sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
function getRandomNumber(min, max) {
  // Ensure min and max are integers
  min = Math.ceil(min);
  max = Math.floor(max);
  // Generate a random integer between min (inclusive) and max (inclusive)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


async function initServer() {
  try {
    // Load or create level data (seed + metadata)
    const level = await worldLib.loadLevel();
    if (!level) {
      throw new Error("Failed to initialize level data");
    }
    gameState.worldSeed = level.seed;
    // Logging and startup info
    logMessage("-----------------------------------------------------","INFO");
    await sleep(getRandomNumber(30,1000));
    logMessage("ThreeCraft Integrated Server Worker","INFO");
     await sleep(getRandomNumber(30,1000));
    logMessage("Version: 1.0.0","INFO");
     await sleep(getRandomNumber(30,1000));
    logMessage(`Node.js Version: ${process.version}`,"INFO");
     await sleep(getRandomNumber(30,1000));
    logMessage(`Platform: ${process.platform} ${process.arch}`,"INFO");
     await sleep(getRandomNumber(30,1000));
    logMessage("-----------------------------------------------------","INFO");
       await sleep(getRandomNumber(30,1000));
    // initialize world generator and chunks helper
    logMessage("Initializing world generator and chunk system", "INFO");
    worldGen = new WorldGenerator(gameState.worldSeed);
    chunks = await chunksLib.init({ CHUNKS_DIR, worldGen, gameState });

    // Initialize plugin system
    logMessage("Initializing plugin system...", "INFO");
    pluginManager = new PluginManager({
      pluginsDir: folders.plugins,
      logger: { 
        info: (msg) => logMessage(msg, "INFO"),
        warn: (msg) => logMessage(msg, "WARN"),
        error: (msg) => logMessage(msg, "ERROR"),
        debug: (msg) => logMessage(msg, "DEBUG"),
      },
      config: {},
    });
    
    // Initialize Python bridge
    pythonBridge = new PythonBridge({
      logger: {
        info: (msg) => logMessage(msg, "INFO"),
        warn: (msg) => logMessage(msg, "WARN"),
        error: (msg) => logMessage(msg, "ERROR"),
        debug: (msg) => logMessage(msg, "DEBUG"),
      },
    });

    // Inject dependencies for plugins
    gameState.pluginManager = pluginManager;
    gameState.pythonBridge = pythonBridge;
    gameState.io = io;

    // Load plugins
    await pluginManager.loadPlugins();
    await pluginManager.callHook("server:init", { gameState, io });

    logMessage("Checking for existing world saves...","INFO");
    chunks.ensureChunksDir();
    const saveDir = path.join(__dirname, "saves");
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir);
      logMessage("No existing saves found. Created new saves directory.","INFO");
    } else {
      const saves = fs.readdirSync(saveDir);
      if (saves.length === 0) {
        logMessage("No existing saves found.","INFO");
      } else {
        logMessage(`Found ${saves.length} existing save(s):`,"INFO");
        saves.forEach((save) => logMessage(`- ${save}`,"INFO"));
      }
    }

    logMessage("Starting ThreeCraft integrated server worker...","INFO");
    logMessage("Checking For EULA Acceptance...","INFO");
    const eulaPath = path.join(__dirname, "eula.txt");
    if (fs.existsSync(eulaPath)) {
      const eulaContent = fs.readFileSync(eulaPath, "utf8");
      if (eulaContent.includes("eula=true")) {
        logMessage("EULA accepted. Continuing server startup...","INFO");
      } else {
        logMessage("EULA not accepted. Please read eula.txt and accept the EULA to run the server.","CRITICAL");
        process.exit(1);
      }
    } else {
      //Create EULA file
      const eulaText = `
      You are Prohibitted from using Offical Minecraft Game Resources like Textures and sounds
      This is a project for personal intrest on making multiplayer games and learning about networking
      Minecraft belongs to Mojang AB and Microsoft
      And They have a right to DMCA You if you use their resources without permission.


      If you use minecraft textures or resources in your own ThreeCraft Server. I take no responsibility on what happens to you.

      Please Respect Microsoft and Mojang Intelectual Rights to Minecraft Resources
      
      You can use your own textures and sounds in ThreeCraft. or use other Texturepacks that are free to use.
      This is a Minecraft Parody and is not affiliated with Mojang AB or Microsoft.
      By changing the setting below to true you are agreeing to These rules
      1. You will not use Offical Minecraft Resources
      2. You will not host a public server using Offical Minecraft Resources
      3. You understand that Mojang AB and Microsoft own Minecraft and its Resources
      4. You agree to take down your server if Mojang AB, Microsoft request you to do so.
      5. You agree that this is a Parody project and is not affiliated with Mojang AB or Microsoft in any way.
      6. You agree to Remove resources if you use Other peoples Texturepacks that are not given permission to use. and they request you to do so.
      7. You agree that ThreeCraft is a non profit project and is not making any money from this project.
      8. You agree that if you break any of these rules Microsoft and Mojang AB have the right to DMCA you and your server.

      # You must accept the EULA to run the ThreeCraft Integrated Server.
      eula=false
`;      fs.writeFileSync(eulaPath, eulaText, "utf8");
      logMessage("EULA file created. Please read eula.txt and accept the EULA to run the server.","CRITICAL");
      process.exit(1);
    }

    logMessage("-------------------------Frostnaut AntiCheat-------------------------","INFO");
    logMessage("[Frostnaut Anti Cheat Service] Starting Frostnaut Anti Cheat Service....","INFO");
  
  for (let i = 0; i <= 100; i++) {
      logMessage(`[Frostnaut Anti Cheat Service] Loading... ${i}%`,"INFO");
       await sleep(getRandomNumber(30,100));
  }
    logMessage("[Frostnaut Anti Cheat Service] Frostnaut Anti Cheat Service Started Successfully!","SUCCESS");
         await sleep(getRandomNumber(30,1000));

    logMessage("Loading world generator with seed " + gameState.worldSeed,"INFO");
           await sleep(getRandomNumber(30,1000));

    const metrics = getSystemMetrics();
    logMessage("System metrics initialized","INFO");
    logMessage(
      "Allocated Memory: " + (metrics.memoryMax / 1048576).toFixed(2) + " MB",
      1,
    );
           await sleep(getRandomNumber(30,1000));
    logMessage("CPU Cores: " + metrics.cpuCores,"INFO");
           await sleep(getRandomNumber(30,1000));

    logMessage("Integrated server signaled a successful boot","SUCCESS");        
   await sleep(getRandomNumber(30,1000));
    logMessage("Preparing spawn area chunks...","INFO");

    // Create spawn area chunks and logMessages with Percentages
    let chunkCount = 0;
    const spawnChunks = [];
    for (let x = -1; x <= 1; x++) {
     for (let z = -1; z <= 1; z++) {
        spawnChunks.push(
          chunks
            .loadOrGenerateChunk(x, z)
            .then(async (c) => {
              gameState.chunks[`${x},${z}`] = c;
              chunkCount++;
              logMessage(`Loaded/Generated chunk ${chunkCount}/9`,"INFO");
             await sleep(getRandomNumber(30,1000));
            })
            .catch((err) => {
              logMessage(
                `Failed to load spawn chunk (${x}, ${z})`,
                "FALIURE",
                ERROR_CODES.CHUNK_LOAD_FAILED,
                { error: err.message },
              );
            }),
        );
      }
    }

    await Promise.all(spawnChunks);

    http.listen(ServerPort, async () => {
      logMessage(`Server Now Running at port ${ServerPort} with protocol 5`,"INFO");
      logMessage(`Admin Dashboard: http://localhost:${ServerPort}/dashboard`, 2);
      logMessage(`Local Game Client: http://localhost:${ServerPort}/game`, 2);
      logMessage(`World Seed: ${gameState.worldSeed}`, 2);

      // Call plugin hook for server start
      await pluginManager.callHook("server:start", { gameState, io });
    });
  } catch (e) {
    logMessage(
      "Fatal error initializing server",
      "CRITICAL",
      ERROR_CODES.UNKNOWN_ERROR,
      { error: e.message, stack: e.stack },
    );
    process.exit(1);
  }
}

// Start initialization
initServer().catch((e) => {
  logMessage(
    "Failed to initialize server",
    "CRITICAL",
    ERROR_CODES.UNKNOWN_ERROR,
    { error: e.message },
  );
  process.exit(1);
});

// Allow serving client JS files

// Root redirects to dashboard
app.get("/", (req, res) => {
  //check if ip is localhost
  if (req.ip === "::1" || req.ip === "127.0.0.1") {
    res.redirect("/dashboard");
  } else {
    res.redirect("/game");
  }
});

//Anti Cheat

let ViolationStrikes = {};


function ViolationMistakeDetect(playerId) {
  // Mistakes that may happen and cause a strike to the player
  // Ex: Spawning Underground when connecting and getting 4 strikes right away (5 if user is unlucky and falls into the void)
  // This function will check for such mistakes and not count them as strikes

  // Automatically Tag it as a mistake when player had joined less than 30 seconds ago
  const player = gameState.players[playerId];
  if (!player) return false;
  const timeSinceJoin = Date.now() - player.joinTime;
  if (timeSinceJoin < 30000) {
    logMessage(
      `Player ${playerId} mistake detected: Joined less than 30 seconds ago.`,
      "CHEAT",
      ERROR_CODES.ANTI_CHEAT_VIOLATION,
      { playerId, timeSinceJoin },
    );
    return true;
  }
  
  return false;
}


function AntiCheat_Violation_Strike(playerId, violationType) {
  if (!ViolationStrikes[playerId]) {
    ViolationStrikes[playerId] = 0;
  }
if (ViolationMistakeDetect(playerId)) {
    // Detected mistake, do not count as strike
    return;
  }
  ViolationStrikes[playerId]++;
  logMessage(
    `Player ${playerId} has ${ViolationStrikes[playerId]} anti-cheat violations.`,
    "CHEAT",
    ERROR_CODES.ANTI_CHEAT_VIOLATION,
    { playerId, violationType, strikes: ViolationStrikes[playerId] },
  );
}

function CheckViolationStrikesReachesMax(playerId) {
  if (ViolationStrikes[playerId] >= 5) {
    return true;
  } else {
    return false;
  }
}

function AntiCheat_DetectTeleport(playerId, originalPosition, newPosition) {
  // Calculate distance moved
  const dx = newPosition.x - originalPosition.x;
  const dy = newPosition.y - originalPosition.y;
  const dz = newPosition.z - originalPosition.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Define a maximum allowed distance (e.g., 10 blocks per move)
  const MAX_ALLOWED_DISTANCE = 10;
 if (ViolationMistakeDetect(playerId)) {
    // Detected mistake, do not count as violation
    return false;
  }
  else {
     if (distance > MAX_ALLOWED_DISTANCE) {
    logMessage(
      `AntiCheat: Detected potential teleport for player ${playerId}. Moved ${distance.toFixed(2)} blocks.`,
      "CHEAT",
      ERROR_CODES.ANTI_CHEAT_TELEPORT_DETECTED,
      { playerId, originalPosition, newPosition, distance },
    );
    return true; // Teleport detected
  }
  }
  
}

// Handle Console Output
function handleConsoleOutput(line) {
  io.emit('consoleOutput', line);
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  logMessage(`Player connected: ${socket.id}`);

  // Support socket-based resource requests: block types and texture metadata
  socket.on("requestBlockTypes", (data, cb) => {
    try {
      const payload = {
        idToName: BLOCK_ID_TO_ITEM,
        nameToId: ITEM_TO_BLOCK_ID,
      };
      if (typeof cb === "function") cb(payload);
    } catch (e) {
      logMessage(
        "Failed to respond to requestBlockTypes",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: e.message },
      );
      if (typeof cb === "function") cb({ error: "failed" });
    }
  });

  socket.on("requestBlockMetadata", async (data, cb) => {
    try {
      const texDir = path.join(
        __dirname,
        "..",
        "Client",
        "resources",
        "textures",
        "blocks",
      );
      let files = [];
      try {
        files = fs.existsSync(texDir) ? fs.readdirSync(texDir) : [];
      } catch (fsErr) {
        files = [];
      }
      // build set of available keys (strip extensions)
      const available = new Set(
        files
          .filter((f) => typeof f === "string")
          .map((f) => f.replace(/\.png$/i, "")),
      );

      const metadata = {};
      Object.values(BLOCK_ID_TO_ITEM).forEach((name) => {
        if (!name) return;
        const topKey = available.has(`${name}_top`)
          ? `${name}_top`
          : available.has(name)
            ? name
            : null;
        const bottomKey = available.has(`${name}_bottom`)
          ? `${name}_bottom`
          : available.has(name)
            ? name
            : null;
        const sideKey = available.has(`${name}_side`)
          ? `${name}_side`
          : available.has(name)
            ? name
            : null;
        metadata[name] = {
          keys: {
            top: topKey,
            bottom: bottomKey,
            side: sideKey,
            generic: available.has(name) ? name : null,
          },
          hasTexture: topKey || bottomKey || sideKey || available.has(name),
        };
      });
      if (typeof cb === "function") cb({ metadata, files });
    } catch (e) {
      logMessage(
        "Failed to respond to requestBlockMetadata",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: e.message },
      );
      if (typeof cb === "function") cb({ error: "failed" });
    }
  });

  // Register player
  socket.on("playerJoin", async (data) => {
    try {
      // Validate input data
      if (!data || typeof data !== "object") {
        logMessage(
          "Invalid playerJoin data received",
          "WARN",
          ERROR_CODES.INVALID_DATA_TYPE,
        );
        socket.emit("joinFailed", { reason: "Invalid join data" });
        return;
      }

      // Persist client username if clientId provided
      if (data && data.clientId && data.username) {
        try {
          await storage.saveUser(data.clientId, data.username);
        } catch (e) {
          logMessage(
            "Failed to persist user on join",
            "WARN",
            ERROR_CODES.STORAGE_WRITE_FAILED,
            { error: e.message },
          );
        }
      }

      // Validate clientInfo
      if (!data.clientInfo || typeof data.clientInfo !== "object") {
        data.clientInfo = {
          ClientVersion: "unknown",
          GameVersion: "unknown",
          ClientName: "unknown",
          ClientBuildDate: "unknown",
        };
      }

      const playerData = {
        id: socket.id,
        username: (
          data.username || `Player${Math.floor(Math.random() * 1000)}`
        ).slice(0, 32),
        clientId: (data && data.clientId) || null,
        position: (data && data.position) || { x: 0, y: 64, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        health: 20,
        hunger: 20,
        inventory: { items: [], selectedSlot: 0 },
        chunksSent: [],
        joinTime: Date.now(),
        renderDistance: Math.max(
          1,
          Math.min((data && data.renderDistance) || 8, 32),
        ), // Clamp to valid range
        ClientVersion: data.clientInfo.ClientVersion || "unknown",
        GameVersion: data.clientInfo.GameVersion || "unknown",
        ClientName: data.clientInfo.ClientName || "unknown",
        BuildDate: data.clientInfo.ClientBuildDate || "unknown",
      };

      gameState.players[socket.id] = playerData;

      logMessage(`${playerData.username} joined the game`);
      logMessage(`Player joined: ${playerData.username}`, "INFO", null, {
        clientVersion: playerData.ClientVersion,
        gameVersion: playerData.GameVersion,
      });

      // Call plugin hook for player join
      await pluginManager.callHook("player:join", { 
        player: playerData, 
        socket,
        gameState
      });

      // Determine spawn chunk and ensure it's generated/loaded
      const playerChunk = getChunkCoords(playerData.position);
      const cx = playerChunk.x;
      const cz = playerChunk.z;

      if (!gameState.chunks[`${cx},${cz}`]) {
        try {
          const c = await chunks.loadOrGenerateChunk(cx, cz);
          gameState.chunks[`${cx},${cz}`] = c;
        } catch (e) {
          logMessage(
            "Error loading/generating spawn chunk",
            "ERROR",
            ERROR_CODES.CHUNK_LOAD_FAILED,
            { cx, cz, error: e.message },
          );
          socket.emit("joinFailed", { reason: "Failed to load spawn chunk" });
          return;
        }
      }

      // Calculate a safe spawn position at surface
      const worldX =
        cx * gameState.chunkSize + Math.floor(gameState.chunkSize / 2);
      const worldZ =
        cz * gameState.chunkSize + Math.floor(gameState.chunkSize / 2);
      const surfaceY = getSurfaceYAtWorldCoords(worldX, worldZ);
      const spawnPos = { x: worldX + 0.5, y: surfaceY + 1, z: worldZ + 0.5 };
      gameState.players[socket.id].position = spawnPos;

      // Make sure player isn't inside ground before sending spawn
      try {
        await ensurePlayerNotInGround(socket.id);
      } catch (e) {
        logMessage(
          "Error ensuring player not in ground on join",
          "ERROR",
          ERROR_CODES.UNKNOWN_ERROR,
          { error: e.message },
        );
      }

      // Send player their own data
      socket.emit("playerSpawn", gameState.players[socket.id]);

      // Ensure client has inventory and health sync
      try {
        socket.emit(
          "inventoryUpdate",
          gameState.players[socket.id].inventory || {
            items: [],
            selectedSlot: 0,
          },
        );
        socket.emit("playerDamaged", {
          health: gameState.players[socket.id].health || 20,
        });
      } catch (e) {
        logMessage(
          "Failed to send inventory/health update",
          "WARN",
          ERROR_CODES.NETWORK_ERROR,
          { error: e.message },
        );
      }

      // Notify other players
      socket.broadcast.emit("playerJoined", {
        id: socket.id,
        username: gameState.players[socket.id].username,
        position: gameState.players[socket.id].position,
        health: gameState.players[socket.id].health || 20,
      });

      // Send list of existing players
      socket.emit(
        "existingPlayers",
        Object.values(gameState.players).filter((p) => p.id !== socket.id),
      );

      // Send spawn chunk and load surrounding chunks
      try {
        await loadChunksForPlayer(socket.id);
        await checkAndLoadChunks(socket.id);
      } catch (e) {
        logMessage(
          "Error sending chunks after join",
          "ERROR",
          ERROR_CODES.CHUNK_LOAD_FAILED,
          { error: e.message },
        );
      }

      // Check if Client Version is supported
      if (
        gameState.players[socket.id].GameVersion !==
        ServerInfo.SupportedGameVersion
      ) {
        socket.emit("serverKick", {
          reason: `Unsupported game version: ${gameState.players[socket.id].GameVersion}. Supported version is ${ServerInfo.SupportedGameVersion}.`,
        });
      }
      process.on("beforeExit", (code) => {
        socket.emit("serverKick", { reason: "Server Closed" });
      });
    }
    catch (err) {
      logMessage(
        "Unhandled error in playerJoin handler",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: err.message, stack: err.stack },
      );
      socket.emit("joinFailed", { reason: "Server error during join" });
    }
  });

  // Handle player movement
  socket.on("playerMove", (data) => {
    try {
      if (!gameState.players[socket.id]) {
        logMessage(
          "Player move from non-existent player",
          "WARN",
          ERROR_CODES.PLAYER_NOT_FOUND,
        );
        return;
      }

      // Validate input data
      if (!data || !data.position || typeof data.position !== "object") {
        logMessage(
          "Invalid playerMove data",
          "WARN",
          ERROR_CODES.INVALID_DATA_TYPE,
          { playerId: socket.id },
        );
        return;
      }

      const player = gameState.players[socket.id];
      const prevPos = player.position;

      // Validate position coordinates
      if (
        typeof data.position.x !== "number" ||
        typeof data.position.y !== "number" ||
        typeof data.position.z !== "number"
      ) {
        logMessage(
          "Invalid position coordinates in playerMove",
          "WARN",
          ERROR_CODES.INVALID_COORDINATES,
          { playerId: socket.id },
        );
        return;
      }

      player.position = data.position;
      player.rotation = data.rotation || { x: 0, y: 0, z: 0 };

      // Update renderDistance if provided (with validation)
      if (data.renderDistance !== undefined) {
        player.renderDistance = Math.max(1, Math.min(data.renderDistance, 32));
      }

      // Broadcast to other players
      socket.broadcast.emit("playerMoved", {
        id: socket.id,
        position: data.position,
        rotation: player.rotation,
      });

      // Check if player entered new chunks (async)

      //Anti Cheat Gravity and Movement Cheat Detection
      if (data.AntiCheatClientRequestedProperties) {
        const reportedSpeed =
          data.AntiCheatClientRequestedProperties.PlayerSpeed;
        const reportedGrav = data.AntiCheatClientRequestedProperties.Grav;
        // Check for speed hack
        const MAX_WALKING_SPEED = 5; // blocks per second
        if (reportedSpeed > MAX_WALKING_SPEED) {
          logMessage(
            `AntiCheat: Detected potential speed hack for player ${socket.id}. Reported speed: ${reportedSpeed}`,
            "CHEAT",
            ERROR_CODES.ANTI_CHEAT_SPEED_HACK_DETECTED,
            { playerId: socket.id, reportedSpeed },
          );
          socket.emit("AntiCheatHandle", { type: 1 }); // Notify client of speed hack
          AntiCheat_Violation_Strike(socket.id, "SPEEDHACK");
          if (CheckViolationStrikesReachesMax(socket.id)) {
            socket.emit("serverKick", {
              reason: "Kicked for repeated anti-cheat violations.",
            });
          }
        }
        // Check for gravity hack
        const NORMAL_GRAVITY = 30.0;
        if (reportedGrav < NORMAL_GRAVITY) {
          logMessage(
            `AntiCheat: Detected potential gravity hack for player ${socket.id}. Reported gravity: ${reportedGrav}`,
            "CHEAT",
            ERROR_CODES.ANTI_CHEAT_GRAVITY_HACK_DETECTED,
            { playerId: socket.id, reportedGrav },
          );
          socket.emit("AntiCheatHandle", { type: 3 }); // Notify client of gravity hack
          AntiCheat_Violation_Strike(socket.id, "GRAVITYHACK");
          if (CheckViolationStrikesReachesMax(socket.id)) {
            socket.emit("serverKick", {
              reason: "Kicked for repeated anti-cheat violations.",
            });
          }
        }
      }
      //Anti Cheat Teleport Detection
      if (AntiCheat_DetectTeleport(socket.id, prevPos, data.position)) {
        // Teleport detected, revert player position
        player.position = prevPos;
        socket.emit("AntiCheatHandle", { type: 2, newPosition: prevPos });
        AntiCheat_Violation_Strike(socket.id, "TELEPORT");
        if (CheckViolationStrikesReachesMax(socket.id)) {
          socket.emit("serverKick", {
            reason: "Kicked for repeated anti-cheat violations.",
          });
        }
        return;
      }

      checkAndLoadChunks(socket.id).catch((err) =>
        logMessage(
          "Error in checkAndLoadChunks",
          "ERROR",
          ERROR_CODES.CHUNK_LOAD_FAILED,
          { error: err.message },
        ),
      );

      // Ensure player not in ground
      ensurePlayerNotInGround(socket.id).catch((err) =>
        logMessage(
          "Error ensuring player not in ground",
          "ERROR",
          ERROR_CODES.UNKNOWN_ERROR,
          { error: err.message },
        ),
      );

      // Pickup nearby drops
      pickupNearbyDropsForPlayer(socket.id).catch((err) =>
        logMessage(
          "Error picking up drops",
          "WARN",
          ERROR_CODES.UNKNOWN_ERROR,
          { error: err.message },
        ),
      );

      // Falling damage detection
      handleFallingForPlayer(socket.id).catch((err) =>
        logMessage(
          "Error handling fall damage",
          "WARN",
          ERROR_CODES.UNKNOWN_ERROR,
          { error: err.message },
        ),
      );
    } catch (err) {
      logMessage(
        "Unhandled error in playerMove handler",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: err.message },
      );
    }
  });

  // Handle block placement
  socket.on("blockPlace", async (data) => {
    try {
      if (!data || !data.position || typeof data.position !== "object") {
        logMessage(
          "Invalid blockPlace data",
          "WARN",
          ERROR_CODES.INVALID_DATA_TYPE,
        );
        socket.emit("placeFailed", { message: "Invalid placement data" });
        return;
      }

      const { position, blockType } = data;
      const player = gameState.players[socket.id];

      if (!player) {
        logMessage(
          "blockPlace from non-existent player",
          "WARN",
          ERROR_CODES.PLAYER_NOT_FOUND,
        );
        return;
      }

      // Validate coordinates
      if (
        typeof position.x !== "number" ||
        typeof position.y !== "number" ||
        typeof position.z !== "number"
      ) {
        socket.emit("placeFailed", { message: "Invalid block coordinates" });
        return;
      }

      const chunkPos = getChunkCoords(position);
      const localPos = getLocalBlockCoords(position);
      const chunkKey = `${chunkPos.x},${chunkPos.z}`;

      if (!gameState.chunks[chunkKey]) {
        gameState.chunks[chunkKey] = await chunks.loadOrGenerateChunk(
          chunkPos.x,
          chunkPos.z,
        );
      }

      // Ensure placement is within reach (4.5 blocks)
      const dx = position.x - player.position.x;
      const dy = position.y - player.position.y;
      const dz = position.z - player.position.z;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 > 4.5 * 4.5) {
        socket.emit("placeFailed", { message: "Out of reach" });
        return;
      }

      // Validate block type
      let requestedType = null;
      let blockId = null;
      if (typeof blockType === "number") {
        blockId = blockType;
        requestedType = BLOCK_ID_TO_ITEM[blockId];
      } else if (typeof blockType === "string") {
        requestedType = blockType;
        blockId = ITEM_TO_BLOCK_ID[requestedType];
      }

      if (!requestedType || !blockId) {
        socket.emit("placeFailed", { message: "Unknown block type" });
        return;
      }

      // Check inventory
      const inv = player.inventory || { items: [], selectedSlot: 0 };
      const slotIndex = inv.items.findIndex(
        (s) => s && s.type === requestedType && s.count > 0,
      );
      if (slotIndex === -1) {
        socket.emit("placeFailed", { message: "No block in inventory" });
        return;
      }

      // Consume block
      inv.items[slotIndex].count -= 1;
      if (inv.items[slotIndex].count <= 0) inv.items.splice(slotIndex, 1);
      player.inventory = inv;

      // Call plugin hook for block place
      const placeContext = { position, blockType: blockId, player, gameState };
      await pluginManager.callHook("block:place", placeContext);

      // Place block
      gameState.chunks[chunkKey].blocks[localPos.x][localPos.y][localPos.z] =
        blockId;
      chunks
        .saveChunkToDisk(chunkPos.x, chunkPos.z, gameState.chunks[chunkKey])
        .catch((e) =>
          logMessage(
            "Failed to persist block placement",
            "WARN",
            ERROR_CODES.CHUNK_SAVE_FAILED,
            { error: e.message },
          ),
        );

      // Broadcast placement
      io.emit("blockPlaced", { position, blockType: blockId });
      socket.emit("inventoryUpdate", player.inventory);
    } catch (err) {
      logMessage(
        "Unhandled error in blockPlace handler",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: err.message },
      );
      socket.emit("placeFailed", { message: "Server error" });
    }
  });

  // Handle block breaking
  socket.on("blockBreak", async (data) => {
    try {
      if (!data || !data.position || typeof data.position !== "object") {
        logMessage(
          "Invalid blockBreak data",
          "WARN",
          ERROR_CODES.INVALID_DATA_TYPE,
        );
        return;
      }

      const { position } = data;

      if (
        typeof position.x !== "number" ||
        typeof position.y !== "number" ||
        typeof position.z !== "number"
      ) {
        logMessage(
          "Invalid break position coordinates",
          "WARN",
          ERROR_CODES.INVALID_COORDINATES,
        );
        return;
      }

      const chunkPos = getChunkCoords(position);
      const localPos = getLocalBlockCoords(position);
      const chunkKey = `${chunkPos.x},${chunkPos.z}`;

      if (!gameState.chunks[chunkKey]) {
        gameState.chunks[chunkKey] = await chunks.loadOrGenerateChunk(
          chunkPos.x,
          chunkPos.z,
        );
      }

      if (gameState.chunks[chunkKey]) {
        const blockType = gameState.chunks[chunkKey].blocks[localPos.x][localPos.y][localPos.z];
        
        // Call plugin hook for block break
        const breakContext = { position, blockType, gameState };
        await pluginManager.callHook("block:break", breakContext);

        gameState.chunks[chunkKey].blocks[localPos.x][localPos.y][localPos.z] =
          0;
        chunks
          .saveChunkToDisk(chunkPos.x, chunkPos.z, gameState.chunks[chunkKey])
          .catch((e) =>
            logMessage(
              "Failed to persist block break",
              "WARN",
              ERROR_CODES.CHUNK_SAVE_FAILED,
              { error: e.message },
            ),
          );
        io.emit("blockBroken", { position });
      }
    } catch (err) {
      logMessage(
        "Unhandled error in blockBreak handler",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: err.message },
      );
    }
  });

  // Start mining (takes 1 second server-side)
  socket.on("startMine", async (data) => {
    try {
      const { position } = data;
      const player = gameState.players[socket.id];
      if (!player) return;
      // check reach (simple distance)
      const dx = position.x - player.position.x;
      const dy = position.y - player.position.y;
      const dz = position.z - player.position.z;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 > 4.5 * 4.5) return; // >4.5 units away

      const chunkPos = getChunkCoords(position);
      const chunkKey = `${chunkPos.x},${chunkPos.z}`;
      if (!gameState.chunks[chunkKey]) {
        gameState.chunks[chunkKey] = await chunks.loadOrGenerateChunk(
          chunkPos.x,
          chunkPos.z,
        );
      }
      const localPos = getLocalBlockCoords(position);
      const blockId =
        gameState.chunks[chunkKey].blocks[localPos.x][localPos.y][localPos.z];
      if (!blockId || blockId === 0) return; // nothing to mine

      // start server-side mining timer
      if (player.mining && player.mining.timer) return; // already mining
      player.mining = { position, startedAt: Date.now() };
      player.mining.timer = setTimeout(async () => {
        try {
          // re-check block still present
          const latestChunk =
            gameState.chunks[chunkKey] ||
            (await chunks.loadOrGenerateChunk(chunkPos.x, chunkPos.z));
          const currentId =
            latestChunk.blocks[localPos.x][localPos.y][localPos.z];
          if (!currentId || currentId === 0) {
            // nothing to break
            delete player.mining;
            return;
          }
          // remove block
          latestChunk.blocks[localPos.x][localPos.y][localPos.z] = 0;
          await chunks.saveChunkToDisk(chunkPos.x, chunkPos.z, latestChunk);

          io.emit("blockBroken", { position });

          // spawn drop entity for pickup
          const dropType = BLOCK_ID_TO_ITEM[currentId] || "unknown";
          const dropId = generateDropId();
          const drop = {
            id: dropId,
            type: dropType,
            count: 1,
            position: {
              x: position.x + 0.5,
              y: position.y + 0.5,
              z: position.z + 0.5,
            },
            vel: { x: 0, y: 0, z: 0 },
            createdAt: Date.now(),
          };
          gameState.drops[dropId] = drop;
          io.emit("dropSpawn", drop);
        } catch (err) {
          console.error("Mining completion error", err);
        } finally {
          if (player && player.mining) {
            clearTimeout(player.mining.timer);
            delete player.mining;
          }
        }
      }, 1000);
      // notify client mining started
      socket.emit("miningStarted", { position, duration: 1000 });
    } catch (err) {
      console.error("startMine error", err);
    }
  });

  socket.on("cancelMine", (data) => {
    const player = gameState.players[socket.id];
    if (!player || !player.mining) return;
    if (player.mining.timer) clearTimeout(player.mining.timer);
    delete player.mining;
    socket.emit("miningCanceled");
  });

  // Handle crafting
  socket.on("craft", (data) => {
    const { recipe, playerInventory } = data;
    const craftingResult = processCraftingRecipe(recipe, playerInventory);

    if (craftingResult.success) {
      socket.emit("craftingResult", craftingResult);
      gameState.players[socket.id].inventory = craftingResult.newInventory;
    } else {
      socket.emit("craftingError", { message: "Not enough materials" });
    }
  });

  // Handle chat messages
  socket.on("chatMessage", (msg) => {
    try {
      if (!msg || typeof msg !== "string") {
        logMessage(
          "Invalid chat message received",
          "WARN",
          ERROR_CODES.INVALID_DATA_TYPE,
        );
        return;
      }

      const text = msg.trim().slice(0, 300); // Limit length to prevent spam/abuse
      if (text.length === 0) return;

      const player = gameState.players[socket.id];
      const username = player ? player.username : `Unknown`;

      const payload = {
        id: socket.id,
        username,
        message: text,
        time: Date.now(),
      };

      logMessage(`Chat from ${username}: ${text}`, "DEBUG");
      io.emit("chatMessage", payload);
    } catch (e) {
      logMessage(
        "Error in chatMessage handler",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: e.message },
      );
    }
  });

  // Handle dashboard stats request
  socket.on("requestStats", () => {
    const metrics = getSystemMetrics();
    socket.emit("systemMetrics", metrics);

    socket.emit("serverStats", {
      playerCount: Object.keys(gameState.players).length,
      chunkCount: Object.keys(gameState.chunks).length,
      worldSeed: gameState.worldSeed,
      fps: 60,
    });

    socket.emit(
      "playerList",
      Object.values(gameState.players).map((p) => ({
        id: p.id,
        username: p.username,
        position: p.position,
        health: p.health,
        hunger: p.hunger,
      })),
    );
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    try {
      if (gameState.players[socket.id]) {
        const player = gameState.players[socket.id];
        const username = player.username;
        const clientId = player.clientId;

        logMessage(`${username} disconnected`);

        // Call plugin hook for player leave
        (async () => {
          await pluginManager.callHook("player:leave", { 
            player, 
            gameState
          });
        })();

        // Persist last seen
        if (clientId) {
          storage
            .saveUser(clientId, username)
            .catch((e) =>
              logMessage(
                "Failed to save user on disconnect",
                "WARN",
                ERROR_CODES.STORAGE_WRITE_FAILED,
                { error: e.message },
              ),
            );

          // Persist last position to level.dat
          (async () => {
            try {
              const lvl = await worldLib.loadLevel();
              lvl.players = lvl.players || {};
              lvl.players[clientId] = lvl.players[clientId] || {};
              lvl.players[clientId].username = username;
              lvl.players[clientId].lastPosition = player.position || {
                x: 0,
                y: 0,
                z: 0,
              };
              lvl.players[clientId].lastSeen = Date.now();
              await worldLib.saveLevel(lvl);
            } catch (err) {
              logMessage(
                "Failed to persist player position to level.dat",
                "WARN",
                ERROR_CODES.WORLD_SAVE_FAILED,
                { error: err.message },
              );
            }
          })();
        }

        delete gameState.players[socket.id];
        io.emit("playerLeft", { id: socket.id });
      }
    } catch (err) {
      logMessage(
        "Error in disconnect handler",
        "ERROR",
        ERROR_CODES.UNKNOWN_ERROR,
        { error: err.message },
      );
    }
  });
});

// Utility functions
function getChunkCoords(blockPos) {
  return {
    x: Math.floor(blockPos.x / gameState.chunkSize),
    z: Math.floor(blockPos.z / gameState.chunkSize),
  };
}

function getLocalBlockCoords(blockPos) {
  return {
    x:
      ((blockPos.x % gameState.chunkSize) + gameState.chunkSize) %
      gameState.chunkSize,
    y: Math.min(Math.max(Math.floor(blockPos.y), 0), gameState.worldHeight - 1),
    z:
      ((blockPos.z % gameState.chunkSize) + gameState.chunkSize) %
      gameState.chunkSize,
  };
}

function generateChunk(chunkX, chunkZ) {
  return worldGen.generateChunk(
    chunkX,
    chunkZ,
    gameState.chunkSize,
    gameState.worldHeight,
  );
}

function getSurfaceYAtWorldCoords(wx, wz) {
  const cx = Math.floor(wx / gameState.chunkSize);
  const cz = Math.floor(wz / gameState.chunkSize);
  const key = `${cx},${cz}`;
  const chunk = gameState.chunks[key];
  if (!chunk || !chunk.blocks) {
    return 0; // unknown treated as sea level
  }
  const localX =
    ((Math.floor(wx) % gameState.chunkSize) + gameState.chunkSize) %
    gameState.chunkSize;
  const localZ =
    ((Math.floor(wz) % gameState.chunkSize) + gameState.chunkSize) %
    gameState.chunkSize;
  // y dimension length (height)
  const maxY = chunk.blocks[0].length - 1;
  for (let y = maxY; y >= 0; y--) {
    try {
      const b = chunk.blocks[localX][y][localZ];
      if (b && b !== 0) return y;
    } catch (e) {
      continue;
    }
  }
  return 0;
}

async function loadChunksForPlayer(playerId) {
  if (!gameState.players[playerId]) return;

  const player = gameState.players[playerId];
  // defensive: ensure chunksSent array exists
  player.chunksSent = player.chunksSent || [];
  const playerChunk = getChunkCoords(player.position);

  // Load only the player's spawn chunk initially for fast join
  const initialChunkX = playerChunk.x;
  const initialChunkZ = playerChunk.z;
  const key = `${initialChunkX},${initialChunkZ}`;

  if (!gameState.chunks[key]) {
    const c = await chunks.loadOrGenerateChunk(initialChunkX, initialChunkZ);
    gameState.chunks[key] = c;
  }

  if (!player.chunksSent.includes(key)) player.chunksSent.push(key);

  // Notify client about 1 chunk
  io.to(playerId).emit("initialChunksStart", { total: 1 });

  // Send the spawn chunk
  io.to(playerId).emit("chunkData", {
    x: initialChunkX,
    z: initialChunkZ,
    blocks: gameState.chunks[key].blocks,
  });
}

async function checkAndLoadChunks(playerId) {
  if (!gameState.players[playerId]) return;

  const player = gameState.players[playerId];
  // defensive
  player.chunksSent = player.chunksSent || [];
  const playerChunk = getChunkCoords(player.position);
  const renderDistance = (player && player.renderDistance) || 8;

  // Calculate which chunks should be loaded based on player render distance
  const chunksInRange = [];
  for (
    let x = playerChunk.x - renderDistance;
    x <= playerChunk.x + renderDistance;
    x++
  ) {
    for (
      let z = playerChunk.z - renderDistance;
      z <= playerChunk.z + renderDistance;
      z++
    ) {
      chunksInRange.push(`${x},${z}`);
    }
  }

  // Load new chunks that entered render distance
  for (const chunkKey of chunksInRange) {
    if (!player.chunksSent.includes(chunkKey)) {
      const [cx, cz] = chunkKey.split(",").map(Number);
      if (!gameState.chunks[chunkKey]) {
        // load from disk or generate
        gameState.chunks[chunkKey] = await chunks.loadOrGenerateChunk(cx, cz);
      }
      player.chunksSent.push(chunkKey);
      io.to(playerId).emit("chunkData", {
        x: cx,
        z: cz,
        blocks: gameState.chunks[chunkKey].blocks,
      });
    }
  }

  // Unload chunks that left render distance (save server memory)
  const newChunksSent = player.chunksSent.filter((chunkKey) => {
    return chunksInRange.includes(chunkKey);
  });

  // Notify client of chunks to unload (they're now outside render distance)
  const chunksToUnload = player.chunksSent.filter(
    (chunkKey) => !chunksInRange.includes(chunkKey),
  );
  if (chunksToUnload.length > 0) {
    io.to(playerId).emit("unloadChunks", { chunks: chunksToUnload });

    // Clean up server-side chunks if no players need them
    for (const chunkKey of chunksToUnload) {
      const isNeededByOtherPlayers = Object.values(gameState.players).some(
        (p) => p.chunksSent.includes(chunkKey),
      );
      if (!isNeededByOtherPlayers) {
        // save chunk to disk before deleting
        const [cx, cz] = chunkKey.split(",").map(Number);
        if (gameState.chunks[chunkKey]) {
          await chunks.saveChunkToDisk(cx, cz, gameState.chunks[chunkKey]);
        }
        delete gameState.chunks[chunkKey];
      }
    }
  }

  player.chunksSent = newChunksSent;
}

function getDefaultInventory() {
  return {
    items: [
      { type: "stone", count: 64 },
      { type: "wood", count: 32 },
      { type: "dirt", count: 64 },
      { type: "crafting_table", count: 1 },
    ],
    selectedSlot: 0,
  };
}

function processCraftingRecipe(recipe, inventory) {
  // Simple crafting system
  const recipes = {
    wooden_pickaxe: {
      inputs: [{ type: "wood", count: 3 }],
      output: { type: "wooden_pickaxe", count: 1 },
    },
    stone_pickaxe: {
      inputs: [{ type: "stone", count: 3 }],
      output: { type: "stone_pickaxe", count: 1 },
    },
    crafting_table: {
      inputs: [{ type: "wood", count: 4 }],
      output: { type: "crafting_table", count: 1 },
    },
  };

  const selectedRecipe = recipes[recipe];
  if (!selectedRecipe) {
    return { success: false, message: "Unknown recipe" };
  }

  // Check if player has required items
  let hasAllItems = true;
  const newInventory = JSON.parse(JSON.stringify(inventory));

  for (const req of selectedRecipe.inputs) {
    const item = newInventory.items.find((i) => i.type === req.type);
    if (!item || item.count < req.count) {
      hasAllItems = false;
      break;
    }
    item.count -= req.count;
  }

  if (!hasAllItems) {
    return { success: false, message: "Not enough materials" };
  }

  // Add crafted item
  const output = selectedRecipe.output;
  const existingItem = newInventory.items.find((i) => i.type === output.type);
  if (existingItem) {
    existingItem.count += output.count;
  } else {
    newInventory.items.push(output);
  }

  return { success: true, newInventory, craftedItem: output };
}

// System metrics function
function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  const uptime = Date.now() - gameState.startTime;

  return {
    memoryUsage: memUsage.heapUsed,
    memoryMax: memUsage.heapTotal,
    cpuUsage: process.cpuUsage().user / 1000000,
    networkSpeed: Math.random() * 100 * 1024,
    incomingData: Math.random() * 50 * 1024,
    outgoingData: Math.random() * 50 * 1024,
    avgLatency: Math.random() * 50 + 10,
    packetLoss: Math.random() * 0.5,
    fps: 60,
    uptime: uptime,
  };
}

function logMsg(msg, level) {
  const timestamp = new Date().toISOString();
  if (level === 1) {
    console.log(
      `> \x1b[36m[${timestamp}] %s\x1b[0m`,
      `[${ServerInfo.consoleName}/INFO][Server]: ${msg}`,
    );
  } else if (level === 2) {
    console.log(
      `> \x1b[33m[${timestamp}] %s\x1b[0m`,
      `[${ServerInfo.consoleName}/WARN][Server]: ${msg}`,
    );
  } else if (level === 3) {
    console.log(
      `> \x1b[31m[${timestamp}] %s\x1b[0m`,
      `[${ServerInfo.consoleName}/ERROR][Server]: ${msg}`,
    );
  } else {
    console.log(
      `> [${timestamp}] [${ServerInfo.consoleName}/DEBUG][Server]: ${msg}`,
    );
  }
}

// Get block id at world coords (ensures chunk is loaded)
async function getBlockAtWorld(wx, wy, wz) {
  try {
    if (
      typeof wx !== "number" ||
      typeof wy !== "number" ||
      typeof wz !== "number"
    ) {
      logMessage(
        "Invalid coordinates in getBlockAtWorld",
        "WARN",
        ERROR_CODES.INVALID_COORDINATES,
      );
      return 0;
    }

    const cx = Math.floor(wx / gameState.chunkSize);
    const cz = Math.floor(wz / gameState.chunkSize);
    const key = `${cx},${cz}`;

    if (!gameState.chunks[key]) {
      gameState.chunks[key] = await chunks.loadOrGenerateChunk(cx, cz);
    }

    const chunk = gameState.chunks[key];
    if (!chunk || !chunk.blocks) return 0;

    const lx =
      ((Math.floor(wx) % gameState.chunkSize) + gameState.chunkSize) %
      gameState.chunkSize;
    const lz =
      ((Math.floor(wz) % gameState.chunkSize) + gameState.chunkSize) %
      gameState.chunkSize;
    const ly = Math.floor(wy);

    if (ly < 0 || ly >= chunk.blocks[0].length) return 0;

    try {
      return chunk.blocks[lx][ly][lz] || 0;
    } catch (e) {
      logMessage(
        "Error accessing block data",
        "DEBUG",
        ERROR_CODES.UNKNOWN_ERROR,
        { coordinates: `${lx},${ly},${lz}` },
      );
      return 0;
    }
  } catch (e) {
    logMessage(
      "Error in getBlockAtWorld",
      "ERROR",
      ERROR_CODES.CHUNK_LOAD_FAILED,
      { error: e.message },
    );
    return 0;
  }
}

// Ensure player is not inside a solid block by scanning upwards from their current Y
async function ensurePlayerNotInGround(playerId) {
  try {
    const player = gameState.players[playerId];
    if (!player) return;

    const wx = player.position.x;
    const wz = player.position.z;
    let wy = Math.floor(player.position.y);

    // If current position is air, nothing to do
    const currentBlock = await getBlockAtWorld(wx, wy, wz);
    if (currentBlock === 0) return;

    // Scan upwards until we find air or reach world height
    for (let y = wy; y < gameState.worldHeight; y++) {
      const b = await getBlockAtWorld(wx, y, wz);
      if (b === 0) {
        player.position.y = y;
        io.to(playerId).emit("playerSpawn", player);
        socketBroadcastPlayerMoved(player);
        logMessage(
          `Teleported player ${player.username} to safe location`,
          "DEBUG",
        );
        return;
      }
    }

    // If none found, place at world height - 1
    player.position.y = gameState.worldHeight - 1;
    io.to(playerId).emit("playerSpawn", player);
    socketBroadcastPlayerMoved(player);
  } catch (err) {
    logMessage(
      "Error in ensurePlayerNotInGround",
      "ERROR",
      ERROR_CODES.UNKNOWN_ERROR,
      { playerId, error: err.message },
    );
  }
}

function socketBroadcastPlayerMoved(player) {
  // Broadcast to other players that this player moved/teleported
  try {
    io.emit("playerMoved", {
      id: player.id,
      position: player.position,
      rotation: player.rotation,
    });
  } catch (e) {
    // ignore
  }
}

// Inventory helper: add items to inventory with stacking (max 64)
function addItemToInventory(inventory, type, count) {
  let remaining = count;
  // try to fill existing stacks
  for (let slot of inventory.items) {
    if (slot.type === type && slot.count < 64) {
      const space = 64 - slot.count;
      const toAdd = Math.min(space, remaining);
      slot.count += toAdd;
      remaining -= toAdd;
      if (remaining <= 0) return 0;
    }
  }
  // add to empty slots
  while (remaining > 0 && inventory.items.length < 36) {
    const toPut = Math.min(64, remaining);
    inventory.items.push({ type, count: toPut });
    remaining -= toPut;
  }
  return remaining; // leftover that couldn't be stored
}

// Drop physics simulation tick
setInterval(async () => {
  try {
    const toBroadcast = [];
    const dropIds = Object.keys(gameState.drops);

    for (const id of dropIds) {
      const d = gameState.drops[id];
      if (!d || !d.position) continue;

      try {
        // Basic gravity
        d.vel.y -= 9.8 * 0.05; // Small timestep
        d.position.x += d.vel.x * 0.05;
        d.position.y += d.vel.y * 0.05;
        d.position.z += d.vel.z * 0.05;

        // Check ground collision
        const groundY = await getSurfaceYAtWorldCoords(
          Math.floor(d.position.x),
          Math.floor(d.position.z),
        );
        if (d.position.y <= groundY + 0.5) {
          d.position.y = groundY + 0.5;
          d.vel.y = 0;
        }

        toBroadcast.push({ id: d.id, position: d.position });
      } catch (dropErr) {
        logMessage(
          "Error updating drop physics",
          "WARN",
          ERROR_CODES.UNKNOWN_ERROR,
          { dropId: id, error: dropErr.message },
        );
      }
    }

    if (toBroadcast.length > 0) {
      io.emit("dropMoved", toBroadcast);
    }
  } catch (e) {
    logMessage(
      "Error in drop physics tick",
      "ERROR",
      ERROR_CODES.UNKNOWN_ERROR,
      { error: e.message },
    );
  }
}, 50);

// Pickup drops near player
async function pickupNearbyDropsForPlayer(playerId) {
  try {
    const player = gameState.players[playerId];
    if (!player) return;

    const pickupRange = 1.6;
    const toRemove = [];
    const dropIds = Object.keys(gameState.drops);

    for (const dropId of dropIds) {
      const drop = gameState.drops[dropId];
      if (!drop || !drop.position) continue;

      try {
        const dx = drop.position.x - player.position.x;
        const dy = drop.position.y - player.position.y;
        const dz = drop.position.z - player.position.z;
        const dist2 = dx * dx + dy * dy + dz * dz;

        if (dist2 <= pickupRange * pickupRange) {
          const leftover = addItemToInventory(
            player.inventory,
            drop.type,
            drop.count,
          );
          io.to(playerId).emit("inventoryUpdate", player.inventory);

          if (leftover === 0) {
            toRemove.push(dropId);
          } else {
            drop.count = leftover;
          }
        }
      } catch (dropErr) {
        logMessage(
          "Error processing drop pickup",
          "WARN",
          ERROR_CODES.UNKNOWN_ERROR,
          { error: dropErr.message },
        );
      }
    }

    for (const id of toRemove) {
      delete gameState.drops[id];
      io.emit("dropRemoved", { id });
    }
  } catch (err) {
    logMessage(
      "Error in pickupNearbyDropsForPlayer",
      "ERROR",
      ERROR_CODES.UNKNOWN_ERROR,
      { error: err.message },
    );
  }
}

// Falling damage handling
async function handleFallingForPlayer(playerId) {
  try {
    const player = gameState.players[playerId];
    if (!player) return;

    // Determine if player is on ground by checking block below feet
    const footY = Math.floor(player.position.y - 0.1);
    const blockBelow = await getBlockAtWorld(
      player.position.x,
      footY,
      player.position.z,
    );
    const onGround = blockBelow !== 0 && blockBelow !== 8; // not air and not water

    if (!player._falling) {
      if (!onGround) {
        player._falling = true;
        player._fallStartY = player.position.y;
      }
    } else {
      if (onGround) {
        // Landed
        const fallDistance = player._fallStartY - player.position.y;
        player._falling = false;
        player._fallStartY = null;

        if (fallDistance > 3) {
          const damage = Math.floor((fallDistance - 3) * 2);
          player.health = Math.max(0, (player.health || 20) - damage);

          io.to(playerId).emit("playerDamaged", {
            health: player.health,
            damage,
          });
          io.emit(
            "playerList",
            Object.values(gameState.players).map((p) => ({
              id: p.id,
              username: p.username,
              position: p.position,
              health: p.health,
            })),
          );

          logMessage(
            `Player ${player.username} took fall damage: ${damage}`,
            "DEBUG",
          );

          if (player.health <= 0) {
            // Respawn
            player.health = 20;
            const playerChunk = getChunkCoords(player.position);
            const spawnX =
              playerChunk.x * gameState.chunkSize +
              Math.floor(gameState.chunkSize / 2) +
              0.5;
            const spawnZ =
              playerChunk.z * gameState.chunkSize +
              Math.floor(gameState.chunkSize / 2) +
              0.5;
            const spawnY = getSurfaceYAtWorldCoords(spawnX, spawnZ) + 1;
            player.position = { x: spawnX, y: spawnY, z: spawnZ };
            player.inventory = { items: [], selectedSlot: 0 };

            io.to(playerId).emit("playerDied", { position: player.position });
            socketBroadcastPlayerMoved(player);
            logMessage(`Player ${player.username} died and respawned`, "INFO");
          }
        }
      }
    }
  } catch (err) {
    logMessage(
      "Error in handleFallingForPlayer",
      "ERROR",
      ERROR_CODES.UNKNOWN_ERROR,
      { error: err.message },
    );
  }
}


  } catch (error) {
    console.error("❌ An error occurred during the download process. Cannot start server:", error.message);
    process.exit(1); // Exit the application if init fails
  }
}

// Check if script args have setup
if (process.argv.includes("--setup")) {
   const eulaText = `
      You are Prohibitted from using Offical Minecraft Game Resources like Textures and sounds
      This is a project for personal intrest on making multiplayer games and learning about networking
      Minecraft belongs to Mojang AB and Microsoft
      And They have a right to DMCA You if you use their resources without permission.


      If you use minecraft textures or resources in your own ThreeCraft Server. I take no responsibility on what happens to you.

      Please Respect Microsoft and Mojang Intelectual Rights to Minecraft Resources
      
      You can use your own textures and sounds in ThreeCraft. or use other Texturepacks that are free to use.
      This is a Minecraft Parody and is not affiliated with Mojang AB or Microsoft.
      By changing the setting below to true you are agreeing to These rules
      1. You will not use Offical Minecraft Resources
      2. You will not host a public server using Offical Minecraft Resources
      3. You understand that Mojang AB and Microsoft own Minecraft and its Resources
      4. You agree to take down your server if Mojang AB, Microsoft request you to do so.
      5. You agree that this is a Parody project and is not affiliated with Mojang AB or Microsoft in any way.
      6. You agree to Remove resources if you use Other peoples Texturepacks that are not given permission to use. and they request you to do so.
      7. You agree that ThreeCraft is a non profit project and is not making any money from this project.
      8. You agree that if you break any of these rules Microsoft and Mojang AB have the right to DMCA you and your server.

      # You must accept the EULA to run the ThreeCraft Integrated Server.
      eula=false
`;      fs.writeFileSync(eulaPath, eulaText, "utf8");
      logMessage("EULA file created. Please read eula.txt and accept the EULA to run the server.","CRITICAL");
      process.exit(1);
}
else {
  // Run the main async function
initializeAndStartServer();
}

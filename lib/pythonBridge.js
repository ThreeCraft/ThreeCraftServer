const { spawn, exec } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");
const fs = require("fs");
const os = require("os");

/**
 * PythonBridge - Node.js to Python communication library
 * Allows seamless IPC between Node.js and Python processes
 * Supports bidirectional communication, function calls, and data transfer
 */
class PythonBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pythonProcesses = new Map();
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.pythonPath = options.pythonPath || "python";
    this.logger = options.logger || console;
    this.timeout = options.timeout || 30000; // 30 seconds default
  }

  /**
   * Spawn a Python process and establish communication
   */
  spawnPython(scriptPath, options = {}) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Python script not found: ${scriptPath}`));
      }

      const processId = `python_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const args = options.args || [];
      const pythonPath = options.pythonPath || this.pythonPath;

      try {
        const pythonProcess = spawn(pythonPath, [scriptPath, ...args], {
          stdio: ["pipe", "pipe", "pipe"],
          ...options.spawnOptions,
        });

        const bridge = {
          process: pythonProcess,
          processId,
          scriptPath,
          alive: true,
          startTime: Date.now(),
          dataBuffer: "",
          messageQueue: [],
          isProcessing: false,
        };

        // Handle stdout (Python -> Node.js)
        pythonProcess.stdout.setEncoding("utf8");
        pythonProcess.stdout.on("data", (data) => {
          bridge.dataBuffer += data;
          this.processPythonOutput(bridge);
        });

        // Handle stderr
        pythonProcess.stderr.setEncoding("utf8");
        pythonProcess.stderr.on("data", (data) => {
          this.logger.error(`[Python Process ${processId}] ${data.trim()}`);
          this.emit("python:error", { processId, error: data.trim() });
        });

        // Handle process exit
        pythonProcess.on("exit", (code) => {
          bridge.alive = false;
          this.pythonProcesses.delete(processId);
          this.logger.info(`Python process ${processId} exited with code ${code}`);
          this.emit("python:exit", { processId, code });
        });

        pythonProcess.on("error", (err) => {
          bridge.alive = false;
          this.pythonProcesses.delete(processId);
          this.logger.error(`Python process error: ${err.message}`);
          reject(err);
        });

        this.pythonProcesses.set(processId, bridge);
        this.logger.info(`Spawned Python process: ${processId}`);
        resolve(processId);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Spawn a Python process in a new terminal window (for GUI applications)
   * Supports Windows, macOS, and Linux terminals
   */
  spawnPythonTerminal(scriptPath, options = {}) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Python script not found: ${scriptPath}`));
      }

      const processId = `python_term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const args = options.args || [];
      const pythonPath = options.pythonPath || this.pythonPath;
      const title = options.title || "ThreeCraft Python GUI";
      const platform = process.platform;

      try {
        let terminalCommand;
        let terminalProcess;

        if (platform === "win32") {
          // Windows: Use cmd.exe to open a new terminal window
          const scriptArgs = args.length > 0 ? ` ${args.join(" ")}` : "";
          terminalCommand = `start "${title}" cmd /k python "${scriptPath}"${scriptArgs}`;
          terminalProcess = exec(terminalCommand, {
            cwd: path.dirname(scriptPath),
          });
        } else if (platform === "darwin") {
          // macOS: Use open command with Terminal.app
          const scriptArgs = args.length > 0 ? ` ${args.join(" ")}` : "";
          const command = `python "${scriptPath}"${scriptArgs}`;
          terminalCommand = `open -a Terminal -n --args /bin/bash -c '${command.replace(/'/g, "'\\''")}'`;
          terminalProcess = exec(terminalCommand);
        } else if (platform === "linux") {
          // Linux: Try common terminal emulators
          const scriptArgs = args.length > 0 ? ` ${args.join(" ")}` : "";
          const command = `python "${scriptPath}"${scriptArgs}`;
          
          // Try different terminal emulators in order of preference
          const terminals = [
            `gnome-terminal -- bash -c '${command.replace(/'/g, "'\\''")}'`,
            `xterm -title "${title}" -hold -e bash -c '${command.replace(/'/g, "'\\''")}'`,
            `konsole --title="${title}" -e bash -c '${command.replace(/'/g, "'\\''")}'`,
            `xfce4-terminal --title="${title}" -e bash -c '${command.replace(/'/g, "'\\''")}'`,
          ];

          let success = false;
          for (const termCmd of terminals) {
            try {
              terminalProcess = exec(termCmd, { stdio: "ignore" });
              success = true;
              break;
            } catch (e) {
              // Try next terminal
            }
          }

          if (!success) {
            return reject(new Error("No supported terminal emulator found on Linux"));
          }
        } else {
          return reject(new Error(`Unsupported platform for terminal GUI: ${platform}`));
        }

        const bridge = {
          process: terminalProcess,
          processId,
          scriptPath,
          alive: true,
          startTime: Date.now(),
          isTerminal: true,
          title,
        };

        // Handle process exit
        if (terminalProcess.on) {
          terminalProcess.on("exit", (code) => {
            bridge.alive = false;
            this.pythonProcesses.delete(processId);
            this.logger.info(`Python terminal process ${processId} closed`);
            this.emit("python:exit", { processId, code });
          });

          terminalProcess.on("error", (err) => {
            bridge.alive = false;
            this.pythonProcesses.delete(processId);
            this.logger.error(`Python terminal process error: ${err.message}`);
            reject(err);
          });
        }

        this.pythonProcesses.set(processId, bridge);
        this.logger.info(`Spawned Python terminal: ${processId} - ${title}`);
        resolve(processId);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Process incoming data from Python process
   */
  processPythonOutput(bridge) {
    const lines = bridge.dataBuffer.split("\n");
    bridge.dataBuffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handlePythonMessage(bridge, message);
      } catch (err) {
        // Try to handle as raw output
        this.logger.debug(`[${bridge.processId}] ${line}`);
        this.emit("python:output", { processId: bridge.processId, output: line });
      }
    }
  }

  /**
   * Handle messages from Python
   */
  handlePythonMessage(bridge, message) {
    const { type, id, data, error } = message;

    if (type === "response" && id) {
      // Response to a request
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);

        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(data);
        }
      }
    } else if (type === "event") {
      // Event from Python
      this.emit("python:event", {
        processId: bridge.processId,
        eventName: data.eventName,
        eventData: data.eventData,
      });
    } else if (type === "log") {
      // Log message from Python
      this.logger.info(`[${bridge.processId}] ${data.message}`);
    }
  }

  /**
   * Call a function in Python
   */
  async callFunction(processId, functionName, args = {}, options = {}) {
    const bridge = this.pythonProcesses.get(processId);
    if (!bridge) {
      throw new Error(`Python process not found: ${processId}`);
    }

    if (!bridge.alive) {
      throw new Error(`Python process is not alive: ${processId}`);
    }

    const id = ++this.requestId;
    const timeout = options.timeout || this.timeout;

    const message = {
      type: "call",
      id,
      function: functionName,
      args,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Function call timeout: ${functionName}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
        function: functionName,
      });

      try {
        bridge.process.stdin.write(JSON.stringify(message) + "\n");
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  /**
   * Send data to Python process
   */
  async sendData(processId, data, options = {}) {
    const bridge = this.pythonProcesses.get(processId);
    if (!bridge) {
      throw new Error(`Python process not found: ${processId}`);
    }

    const message = {
      type: "data",
      data,
    };

    return new Promise((resolve, reject) => {
      try {
        bridge.process.stdin.write(JSON.stringify(message) + "\n");
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Terminate a Python process
   */
  async terminatePython(processId, force = false) {
    const bridge = this.pythonProcesses.get(processId);
    if (!bridge) {
      throw new Error(`Python process not found: ${processId}`);
    }

    return new Promise((resolve) => {
      if (force) {
        bridge.process.kill("SIGKILL");
      } else {
        bridge.process.kill("SIGTERM");
      }

      // Set timeout for force kill
      const timeout = setTimeout(() => {
        if (bridge.alive) {
          bridge.process.kill("SIGKILL");
        }
      }, 5000);

      bridge.process.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Check if Python process is alive
   */
  isPythonAlive(processId) {
    const bridge = this.pythonProcesses.get(processId);
    return bridge && bridge.alive;
  }

  /**
   * Get all active Python processes
   */
  getActivePythonProcesses() {
    return Array.from(this.pythonProcesses.entries())
      .filter(([, bridge]) => bridge.alive)
      .map(([id, bridge]) => ({
        id,
        scriptPath: bridge.scriptPath,
        uptime: Date.now() - bridge.startTime,
      }));
  }

  /**
   * Terminate all Python processes
   */
  async terminateAll(force = false) {
    const promises = Array.from(this.pythonProcesses.keys()).map((processId) =>
      this.terminatePython(processId, force)
    );

    await Promise.all(promises);
    this.logger.info("All Python processes terminated");
  }
}

/**
 * Create a Python integration helper for plugins
 */
class PythonPluginHelper {
  constructor(bridge, logger) {
    this.bridge = bridge;
    this.logger = logger;
    this.processId = null;
  }

  /**
   * Initialize Python script for plugin
   */
  async init(scriptPath, args = []) {
    try {
      // Convert args object to array if needed
      const argsArray = Array.isArray(args) ? args : [];
      this.processId = await this.bridge.spawnPython(scriptPath, { args: argsArray });
      this.logger.info(`Python helper initialized with process ${this.processId}`);
      return this.processId;
    } catch (err) {
      this.logger.error(`Failed to initialize Python helper: ${err.message}`);
      throw err;
    }
  }

  /**
   * Initialize Python script in a new terminal window (for interactive GUIs)
   * Useful for dashboards, menus, interactive applications
   */
  async initTerminal(scriptPath, args = [], title = "ThreeCraft Python GUI") {
    try {
      // Convert args object to array if needed
      const argsArray = Array.isArray(args) ? args : [];
      this.processId = await this.bridge.spawnPythonTerminal(scriptPath, {
        args: argsArray,
        title,
      });
      this.logger.info(`Python terminal initialized with process ${this.processId}`);
      return this.processId;
    } catch (err) {
      this.logger.error(`Failed to initialize Python terminal: ${err.message}`);
      throw err;
    }
  }

  /**
   * Call a Python function
   */
  async call(functionName, args = {}) {
    if (!this.processId) {
      throw new Error("Python helper not initialized");
    }

    return this.bridge.callFunction(this.processId, functionName, args);
  }

  /**
   * Listen for Python events
   */
  onEvent(eventName, callback) {
    const handler = (data) => {
      if (data.processId === this.processId && data.eventName === eventName) {
        callback(data.eventData);
      }
    };

    this.bridge.on("python:event", handler);
    return () => this.bridge.removeListener("python:event", handler);
  }

  /**
   * Cleanup
   */
  async destroy() {
    if (this.processId) {
      await this.bridge.terminatePython(this.processId);
      this.logger.info("Python helper destroyed");
    }
  }
}

module.exports = { PythonBridge, PythonPluginHelper };

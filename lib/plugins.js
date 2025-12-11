const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

/**
 * PluginManager - Central system for loading and managing server plugins
 * Plugins can hook into server lifecycle events and modify game behavior
 */
class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.plugins = new Map();
    this.hooks = new Map();
    this.middleware = [];
    this.pluginsDir = options.pluginsDir || path.join(__dirname, "..", "plugins");
    this.logger = options.logger || console;
    this.config = options.config || {};
    
    // Core hooks that plugins can listen to
    this.coreHooks = [
      "server:init",
      "server:start",
      "server:shutdown",
      "player:join",
      "player:leave",
      "player:move",
      "player:damage",
      "player:death",
      "block:place",
      "block:break",
      "block:update",
      "chunk:load",
      "chunk:unload",
      "chat:message",
      "item:pickup",
      "item:drop",
      "craft:recipe",
      "anticheat:violation",
    ];

    // Initialize hooks
    this.coreHooks.forEach(hook => {
      this.hooks.set(hook, []);
    });
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadPlugins() {
    if (!fs.existsSync(this.pluginsDir)) {
      this.logger.warn(`Plugins directory not found: ${this.pluginsDir}`);
      return [];
    }

    try {
      const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
      const loadedPlugins = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.pluginsDir, entry.name, "index.js");
          if (fs.existsSync(pluginPath)) {
            try {
              await this.loadPlugin(entry.name, pluginPath);
              loadedPlugins.push(entry.name);
            } catch (err) {
              this.logger.error(`Failed to load plugin ${entry.name}: ${err.message}`);
            }
          }
        }
      }

      this.logger.info(`Loaded ${loadedPlugins.length} plugins: ${loadedPlugins.join(", ")}`);
      return loadedPlugins;
    } catch (err) {
      this.logger.error(`Error scanning plugins directory: ${err.message}`);
      return [];
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(name, pluginPath) {
    try {
      // Clear require cache to allow reloading
      delete require.cache[require.resolve(pluginPath)];
      const PluginClass = require(pluginPath);

      if (!PluginClass || typeof PluginClass !== "function") {
        throw new Error("Plugin must export a constructor function or class");
      }

      const plugin = new PluginClass({
        name,
        hooks: this.getHookAPI(),
        config: this.config[name] || {},
        logger: this.createPluginLogger(name),
      });

      // Validate plugin structure
      if (typeof plugin.init !== "function") {
        throw new Error("Plugin must implement init() method");
      }

      // Call plugin initialization
      await plugin.init();

      this.plugins.set(name, plugin);
      this.logger.info(`Plugin loaded: ${name}`);
      this.emit("plugin:loaded", { name, plugin });

      return plugin;
    } catch (err) {
      this.logger.error(`Failed to load plugin ${name}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }

    try {
      if (typeof plugin.destroy === "function") {
        await plugin.destroy();
      }

      // Remove all hooks registered by this plugin
      for (const [hookName, callbacks] of this.hooks) {
        this.hooks.set(
          hookName,
          callbacks.filter(cb => cb._pluginName !== name)
        );
      }

      this.plugins.delete(name);
      this.logger.info(`Plugin unloaded: ${name}`);
      this.emit("plugin:unloaded", { name });
    } catch (err) {
      this.logger.error(`Error unloading plugin ${name}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(name) {
    const pluginPath = path.join(this.pluginsDir, name, "index.js");
    await this.unloadPlugin(name);
    await this.loadPlugin(name, pluginPath);
  }

  /**
   * Get the Hook API object for plugins to use
   */
  getHookAPI() {
    return {
      register: (hookName, callback, priority = 0) => {
        return this.registerHook(hookName, callback, priority);
      },
      unregister: (hookName, callback) => {
        return this.unregisterHook(hookName, callback);
      },
      call: (hookName, ...args) => {
        return this.callHook(hookName, ...args);
      },
      getHooks: () => {
        return Array.from(this.hooks.keys());
      },
    };
  }

  /**
   * Register a callback for a hook
   */
  registerHook(hookName, callback, priority = 0, pluginName = "unknown") {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    callback._priority = priority;
    callback._pluginName = pluginName;

    const callbacks = this.hooks.get(hookName);
    callbacks.push(callback);
    callbacks.sort((a, b) => (b._priority || 0) - (a._priority || 0));

    return () => {
      this.unregisterHook(hookName, callback);
    };
  }

  /**
   * Unregister a callback from a hook
   */
  unregisterHook(hookName, callback) {
    if (!this.hooks.has(hookName)) return false;

    const callbacks = this.hooks.get(hookName);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Call all callbacks registered for a hook
   * Returns array of results from all callbacks
   */
  async callHook(hookName, context = {}) {
    if (!this.hooks.has(hookName)) {
      return [];
    }

    const callbacks = this.hooks.get(hookName);
    const results = [];

    for (const callback of callbacks) {
      try {
        const result = await callback(context);
        results.push(result);

        // If callback returns false, stop processing
        if (result === false) {
          break;
        }
      } catch (err) {
        this.logger.error(`Error in hook ${hookName}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Create a logger instance for a plugin
   */
  createPluginLogger(pluginName) {
    return {
      info: (msg, ...args) => {
        this.logger.info(`[${pluginName}] ${msg}`, ...args);
      },
      warn: (msg, ...args) => {
        this.logger.warn(`[${pluginName}] ${msg}`, ...args);
      },
      error: (msg, ...args) => {
        this.logger.error(`[${pluginName}] ${msg}`, ...args);
      },
      debug: (msg, ...args) => {
        if (this.config.debug) {
          this.logger.debug(`[${pluginName}] ${msg}`, ...args);
        }
      },
    };
  }

  /**
   * Get a plugin instance
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin info/metadata
   */
  getPluginInfo(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return null;

    return {
      name,
      version: plugin.version || "unknown",
      description: plugin.description || "",
      author: plugin.author || "unknown",
      enabled: true,
      hooks: Array.from(this.hooks.entries())
        .filter(([, callbacks]) => callbacks.some(cb => cb._pluginName === name))
        .map(([hookName]) => hookName),
    };
  }

  /**
   * Add middleware for intercepting game events
   */
  addMiddleware(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Process middleware chain
   */
  async processMiddleware(eventName, data) {
    let result = data;
    for (const mw of this.middleware) {
      if (typeof mw[eventName] === "function") {
        result = await mw[eventName](result);
        if (result === false) {
          return null; // Event cancelled
        }
      }
    }
    return result;
  }
}

module.exports = PluginManager;

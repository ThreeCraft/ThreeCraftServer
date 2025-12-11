// Server Dashboard JavaScript
class ServerDashboard {
  constructor() {
    this.socket = io();
    this.performanceChart = null;
    this.performanceData = {
      labels: [],
      fps: [],
      memory: [],
      latency: []
    };
    this.startTime = Date.now();

    this.setupChart();
    this.setupSocketListeners();
    this.updateLoop();
  }

  setupChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    this.performanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.performanceData.labels,
        datasets: [
          {
            label: 'FPS',
            data: this.performanceData.fps,
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Memory (MB)',
            data: this.performanceData.memory,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96, 165, 250, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: {
              color: '#fff',
              font: { size: 12 }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'FPS', color: '#fff' },
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Memory (MB)', color: '#fff' },
            ticks: { color: '#fff' },
            grid: { drawOnChartArea: false },
            max: 512
          },
          x: {
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        }
      }
    });
  }

  setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('serverStats', (data) => {
      this.updateServerStats(data);
    });

    this.socket.on('playerList', (players) => {
      this.updatePlayersList(players);
    });

    this.socket.on('serverLog', (logEntry) => {
      this.addLogEntry(logEntry);
    });

    this.socket.on('systemMetrics', (metrics) => {
      this.updateSystemMetrics(metrics);
    });

 // Instantiate the converter once outside the loop
this.socket.on('consoleOutput', (line) => {
    const consoleFeed = document.getElementById('consoleFeed');
    const entry = document.createElement('div');

    // 1. Sanitize HTML first to prevent code injection (XSS)
    let formatted = line.replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;");

    // 2. Replace ANSI Color Codes with HTML spans
    // This example handles basic foreground colors (30-37)
    const colors = {
        30: 'black', 31: 'red', 32: 'green', 33: 'yellow',
        34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white'
    };

    formatted = formatted.replace(/\x1b\[(\d+)m/g, (match, p1) => {
        if (colors[p1]) {
            return `<span style="color: ${colors[p1]}">`;
        } else if (p1 === '0') {
            return '</span>'; // Reset code closes the span
        }
       // return ''; // Remove unsupported codes
    });

    // Clean up unclosed spans if necessary, or let browser handle it
    entry.innerHTML = formatted;
    
    consoleFeed.appendChild(entry);
    consoleFeed.scrollTop = consoleFeed.scrollHeight;
});
this.socket.on('consoleOutput', (line) => {
    const consoleFeed = document.getElementById('consoleFeed');
    const entry = document.createElement('div');

    // 1. Sanitize HTML (Prevent XSS)
    let formatted = line.replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;");

    // 2. Define ANSI Color Map
    const styles = {
        // Standard Foreground
        '30': 'color: black;', '31': 'color: #ff5c5c;', '32': 'color: #5af78e;', 
        '33': 'color: #f3f99d;', '34': 'color: #57c7ff;', '35': 'color: #ff6ac1;', 
        '36': 'color: #9aedfe;', '37': 'color: #f1f1f0;',
        // Bright/Bold Foreground (Commonly used)
        '90': 'color: #686868;', '91': 'color: #ff5c5c;', '92': 'color: #5af78e;', 
        '93': 'color: #f3f99d;', '94': 'color: #57c7ff;', '95': 'color: #ff6ac1;', 
        '96': 'color: #9aedfe;', '97': 'color: #f1f1f0;',
        // Extras
        '1': 'font-weight: bold;', 
        '4': 'text-decoration: underline;',
    };

    // 3. Replace ANSI Codes with HTML Spans
    // Matches \x1b[...m where ... is 0-9 or ;
    formatted = formatted.replace(/\x1b\[([0-9;]*)m/g, (match, codes) => {
        // If code is "0" or empty, close the span (Reset)
        if (codes === '0' || codes === '') {
            return '</span>';
        }

        // Handle compound codes (e.g., "1;31" for Bold Red)
        const codeArray = codes.split(';');
        let styleString = "";

        codeArray.forEach(code => {
            if (styles[code]) {
                styleString += styles[code];
            }
        });

        // Return a span with the combined styles
        return styleString ? `<span style="${styleString}">` : '';
    });

    // 4. Inject
    entry.innerHTML = formatted;
    consoleFeed.appendChild(entry);
    consoleFeed.scrollTop = consoleFeed.scrollHeight;
});
    // Load initial level.dat into dashboard
    this.loadLevelData();
  }

  updateServerStats(data) {
    document.getElementById('playerCount').textContent = data.playerCount || 0;
    document.getElementById('chunkCount').textContent = data.chunkCount || 0;
    document.getElementById('worldSeed').textContent = Math.floor(data.worldSeed || 0);
    document.getElementById('serverFps').textContent = data.fps || 60;
  }

  updateSystemMetrics(metrics) {
    // Update memory
    const memoryMB = (metrics.memoryUsage / 1024 / 1024).toFixed(0);
    document.getElementById('memoryUsage').textContent = memoryMB + ' MB';
    
    const memoryPercent = Math.min((metrics.memoryUsage / metrics.memoryMax) * 100, 100);
    document.getElementById('memoryFill').style.width = memoryPercent + '%';

    // Update CPU
    document.getElementById('cpuUsage').textContent = metrics.cpuUsage.toFixed(1) + '%';

    // Update network
    document.getElementById('networkUsage').textContent = (metrics.networkSpeed / 1024).toFixed(2) + ' KB/s';
    document.getElementById('incomingData').textContent = (metrics.incomingData / 1024).toFixed(2) + ' B/s';
    document.getElementById('outgoingData').textContent = (metrics.outgoingData / 1024).toFixed(2) + ' B/s';
    document.getElementById('avgLatency').textContent = metrics.avgLatency.toFixed(0) + ' ms';
    document.getElementById('packetLoss').textContent = metrics.packetLoss.toFixed(2) + '%';

    // Update chart
    this.updateChart(metrics.fps, memoryMB);
  }

  updateChart(fps, memory) {
    const now = new Date().toLocaleTimeString();
    
    if (this.performanceData.labels.length >= 30) {
      this.performanceData.labels.shift();
      this.performanceData.fps.shift();
      this.performanceData.memory.shift();
    }

    this.performanceData.labels.push(now);
    this.performanceData.fps.push(fps || 60);
    this.performanceData.memory.push(parseInt(memory) || 0);

    this.performanceChart.data.labels = this.performanceData.labels;
    this.performanceChart.data.datasets[0].data = this.performanceData.fps;
    this.performanceChart.data.datasets[1].data = this.performanceData.memory;
    this.performanceChart.update('none');
  }

  updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    
    if (players.length === 0) {
      playersList.innerHTML = '<p style="opacity: 0.6; text-align: center; padding: 20px;">No players online</p>';
      return;
    }

    playersList.innerHTML = players.map(player => `
      <div class="player-item">
        <div>
          <div class="player-name">${player.username}</div>
          <div class="player-id">${player.id.substring(0, 8)}...</div>
        </div>
        <div class="player-info">
          ${Math.floor(player.position.x)}, ${Math.floor(player.position.y)}, ${Math.floor(player.position.z)}
        </div>
      </div>
    `).join('');
  }

  async loadLevelData() {
    try {
      const res = await fetch('/api/world');
      if (!res.ok) throw new Error('Failed to fetch level');
      const lvl = await res.json();
      document.getElementById('levelJson').textContent = JSON.stringify(lvl, null, 2);

      const playersDiv = document.getElementById('levelPlayers');
      playersDiv.innerHTML = '';
      const players = (lvl.players && Object.entries(lvl.players)) || [];
      if (players.length === 0) {
        playersDiv.innerHTML = '<p style="opacity:0.7;">No saved players</p>';
      } else {
        players.forEach(([id, p]) => {
          const el = document.createElement('div');
          el.className = 'player-item';
          const pos = p.lastPosition || { x: 0, y: 0, z: 0 };
          el.innerHTML = `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03)"><div><strong>${p.username || 'Unknown'}</strong><div style="font-size:12px; opacity:0.8">${id}</div></div><div style="text-align:right; font-size:13px">${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}<div style="font-size:11px; opacity:0.7">${new Date((p.lastSeen||0)).toLocaleString()}</div></div></div>`;
          playersDiv.appendChild(el);
        });
      }
    } catch (e) {
      document.getElementById('levelJson').textContent = 'Error loading level data';
      console.error('Failed to load level data for dashboard', e);
    }
  }

  addLogEntry(logEntry) {
    const logsList = document.getElementById('logsList');
    const timestamp = new Date().toLocaleTimeString();
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${logEntry.type || 'info'}`;
    entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${logEntry.message}`;
    
    logsList.insertBefore(entry, logsList.firstChild);

    // Keep only last 50 entries
    while (logsList.children.length > 50) {
      logsList.removeChild(logsList.lastChild);
    }
  }

  updateUptime() {
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const formattedUptime = `${days}d ${hours % 24}h ${minutes % 60}m`;
    document.getElementById('uptimeText').textContent = formattedUptime;
  }

  updateLoop() {
    this.updateUptime();
    
    // Request stats from server
    this.socket.emit('requestStats');
    
    setInterval(() => {
      this.updateUptime();
      this.socket.emit('requestStats');
    }, 1000);

    // Wire refresh button for level.dat
    const refreshBtn = document.getElementById('refreshLevelBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadLevelData());
    }
  }
}

// Initialize dashboard when page loads
window.addEventListener('load', () => {
  new ServerDashboard();
});

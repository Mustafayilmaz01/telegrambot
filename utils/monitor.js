// monitor.js - FINAL ÇALIŞAN VERSİYON
const os = require('os');

class SystemMonitor {
  constructor(logger) {
    this.logger = logger || console;
    this.startTime = Date.now();
    this.stats = {
      messagesProcessed: 0,
      errors: 0,
      restarts: 0,
      lastHealthCheck: null,
      peakMemoryUsage: 0
    };
    this.healthCheckInterval = null;
    this.statsInterval = null;
  }

  // Sistem kaynaklarını logla
  logSystemStats() {
    try {
      const used = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      
      // Peak memory'yi güncelle
      if (used.rss > this.stats.peakMemoryUsage) {
        this.stats.peakMemoryUsage = used.rss;
      }

      const systemInfo = {
        memory: {
          rss: Math.round(used.rss / 1024 / 1024),
          heapUsed: Math.round(used.heapUsed / 1024 / 1024),
          heapTotal: Math.round(used.heapTotal / 1024 / 1024),
          external: Math.round(used.external / 1024 / 1024),
          peak: Math.round(this.stats.peakMemoryUsage / 1024 / 1024)
        },
        system: {
          totalMB: Math.round(totalMem / 1024 / 1024),
          usedMB: Math.round(usedMem / 1024 / 1024),
          freeMB: Math.round(freeMem / 1024 / 1024),
          usage: Math.round((usedMem / totalMem) * 100)
        },
        cpu: {
          loadAvg: os.loadavg().map(x => parseFloat(x.toFixed(2))),
          cores: os.cpus().length
        },
        uptime: {
          bot: uptime,
          system: Math.floor(os.uptime())
        },
        stats: { ...this.stats }
      };

      this.logger.activity('Sistem durumu', systemInfo);

      // Memory warning
      if (systemInfo.memory.rss > 200) {
        this.logger.warn(`Yüksek memory kullanımı: ${systemInfo.memory.rss}MB`);
      }

      // System memory warning
      if (systemInfo.system.usage > 90) {
        this.logger.warn(`Sistem memory dolu: %${systemInfo.system.usage}`);
      }

      return systemInfo;
    } catch (error) {
      this.logger.error('Sistem stats alma hatası', { error: error.message });
      return null;
    }
  }

  // Health check - GÜVENLİ VERSİYON
  async performHealthCheck(bot) {
    try {
      const startTime = Date.now();
      
      // Basit ping testi
      const me = await bot.getMe();
      const responseTime = Date.now() - startTime;
      
      const healthData = {
        telegram: {
          connected: true,
          username: me.username,
          responseTime: responseTime
        },
        timestamp: new Date().toISOString()
      };

      this.stats.lastHealthCheck = Date.now();
      this.logger.activity(`Health check OK (${responseTime}ms)`, healthData);

      // Warnings
      if (responseTime > 5000) {
        this.logger.warn(`Yavaş Telegram API yanıtı: ${responseTime}ms`);
      }

      return { healthy: true, data: healthData };

    } catch (error) {
      this.stats.errors++;
      this.logger.error('Health check başarısız', { 
        error: error.message,
        code: error.code
      });
      return { healthy: false, error: error.message };
    }
  }

  // Bot istatistiklerini güncelle
  incrementMessageCount() {
    this.stats.messagesProcessed++;
  }

  incrementErrorCount() {
    this.stats.errors++;
  }

  incrementRestartCount() {
    this.stats.restarts++;
  }

  // Detaylı rapor
  generateReport() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const report = {
      bot: {
        uptime: `${hours}h ${minutes}m`,
        uptimeSeconds: uptime,
        startTime: new Date(this.startTime).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
      },
      stats: { ...this.stats },
      performance: {
        messagesPerHour: hours > 0 ? Math.round(this.stats.messagesProcessed / hours) : 0,
        errorRate: this.stats.messagesProcessed > 0 ? 
          Math.round((this.stats.errors / this.stats.messagesProcessed) * 100) : 0,
        peakMemoryMB: Math.round(this.stats.peakMemoryUsage / 1024 / 1024)
      },
      system: this.logSystemStats()
    };

    this.logger.activity('Bot performans raporu', report);
    return report;
  }

  // Monitoring başlat - GÜVENLİ VERSİYON
  startMonitoring(bot, options = {}) {
    const {
      statsInterval = 5 * 60 * 1000,      // 5 dakika
      healthCheckInterval = 3 * 60 * 1000,  // 3 dakika
      reportInterval = 60 * 60 * 1000      // 1 saat
    } = options;

    try {
      this.logger.startup('Monitoring başlatılıyor', {
        statsInterval: statsInterval / 1000,
        healthCheckInterval: healthCheckInterval / 1000,
        reportInterval: reportInterval / 1000
      });

      // Sistem stats - GÜVENLİ
      this.statsInterval = setInterval(() => {
        try {
          this.logSystemStats();
        } catch (e) {
          this.logger.error('Stats interval hatası', { error: e.message });
        }
      }, statsInterval);

      // Health check - GÜVENLİ
      this.healthCheckInterval = setInterval(async () => {
        try {
          await this.performHealthCheck(bot);
        } catch (e) {
          this.logger.error('Health check interval hatası', { error: e.message });
        }
      }, healthCheckInterval);

      // Performans raporu - GÜVENLİ
      this.reportInterval = setInterval(() => {
        try {
          this.generateReport();
        } catch (e) {
          this.logger.error('Report interval hatası', { error: e.message });
        }
      }, reportInterval);

      // İlk çalıştırma - GÜVENLİ
      setTimeout(() => {
        try {
          this.logSystemStats();
        } catch (e) {
          this.logger.error('İlk stats hatası', { error: e.message });
        }
      }, 10000);

      setTimeout(() => {
        try {
          this.performHealthCheck(bot);
        } catch (e) {
          this.logger.error('İlk health check hatası', { error: e.message });
        }
      }, 15000);

    } catch (error) {
      this.logger.error('Monitoring başlatma hatası', { error: error.message });
    }
  }

  // Monitoring durdur
  stopMonitoring() {
    try {
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (this.reportInterval) {
        clearInterval(this.reportInterval);
        this.reportInterval = null;
      }

      this.logger.activity('Monitoring durduruldu');
    } catch (error) {
      this.logger.error('Monitoring durdurma hatası', { error: error.message });
    }
  }

  // Memory leak detection
  detectMemoryLeak() {
    try {
      const current = process.memoryUsage().rss;
      const threshold = 500 * 1024 * 1024; // 500MB

      if (current > threshold) {
        this.logger.warn('Olası memory leak tespit edildi', {
          currentMB: Math.round(current / 1024 / 1024),
          thresholdMB: Math.round(threshold / 1024 / 1024),
          peakMB: Math.round(this.stats.peakMemoryUsage / 1024 / 1024)
        });
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Memory leak detection hatası', { error: error.message });
      return false;
    }
  }

  // Graceful shutdown için cleanup
  async cleanup() {
    try {
      this.logger.activity('Monitor cleanup başlatılıyor');
      this.stopMonitoring();
      
      // Son rapor
      const finalReport = this.generateReport();
      this.logger.activity('Son performans raporu', finalReport);
      
      return finalReport;
    } catch (error) {
      this.logger.error('Monitor cleanup hatası', { error: error.message });
      return null;
    }
  }
}

// Export hem class hem de utility fonksiyonları
module.exports = {
  SystemMonitor,
  
  // Geriye uyumluluk için
  logSystemStats: function() {
    try {
      const used = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      console.log('📊 System Stats:');
      console.log(`   Memory: ${Math.round(used.rss / 1024 / 1024)} MB`);
      console.log(`   Heap: ${Math.round(used.heapUsed / 1024 / 1024)} MB`);
      console.log(`   System: ${Math.round(usedMem / 1024 / 1024)} / ${Math.round(totalMem / 1024 / 1024)} MB`);
      console.log(`   CPU Load: ${os.loadavg().map(x => x.toFixed(2)).join(', ')}`);
      console.log(`   Uptime: ${Math.floor(process.uptime())} seconds`);
    } catch (error) {
      console.error('System stats error:', error.message);
    }
  }
};
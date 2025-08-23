// logger.js - FINAL ÇALIŞAN VERSİYON
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = './logs';
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
    this.ensureLogDir();
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Log directory creation failed:', error.message);
    }
  }

  getTimestamp() {
    const now = new Date();
    // Türkiye saati formatı
    return now.toLocaleString('tr-TR', { 
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getLogFileName(type = 'general') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}-${date}.log`);
  }

  rotateLogIfNeeded(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > this.maxLogSize) {
          const timestamp = Date.now();
          const rotatedPath = filePath.replace('.log', `-${timestamp}.log`);
          fs.renameSync(filePath, rotatedPath);
          this.cleanOldRotatedLogs(path.dirname(filePath));
        }
      }
    } catch (error) {
      // Rotation hatası göz ardı edilebilir
    }
  }

  cleanOldRotatedLogs(logDir) {
    try {
      const files = fs.readdirSync(logDir)
        .filter(file => file.includes('-') && file.endsWith('.log'))
        .sort()
        .reverse();

      if (files.length > this.maxLogFiles) {
        files.slice(this.maxLogFiles).forEach(file => {
          try {
            fs.unlinkSync(path.join(logDir, file));
          } catch (e) {
            // Silme hatası göz ardı et
          }
        });
      }
    } catch (error) {
      // Cleanup hatası göz ardı et
    }
  }

  writeLog(level, message, data = null, writeToFile = true) {
    const timestamp = this.getTimestamp();
    
    // Console formatı
    const consoleMsg = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    // Dosya formatı
    const fileMsg = `[${timestamp}] ${level.toUpperCase()}: ${message}${data ? ` | Data: ${JSON.stringify(data)}` : ''}\n`;

    // Console'a yazdır (renk kodları ile)
    if (level === 'error') {
      console.error(`\x1b[31m${consoleMsg}\x1b[0m`); // Kırmızı
    } else if (level === 'warn') {
      console.warn(`\x1b[33m${consoleMsg}\x1b[0m`); // Sarı
    } else if (level === 'info') {
      console.log(`\x1b[32m${consoleMsg}\x1b[0m`); // Yeşil
    } else if (level === 'startup') {
      console.log(`\x1b[36m${consoleMsg}\x1b[0m`); // Cyan
    } else if (level === 'activity') {
      console.log(`\x1b[35m${consoleMsg}\x1b[0m`); // Magenta
    } else if (level === 'telegram') {
      console.log(`\x1b[34m${consoleMsg}\x1b[0m`); // Blue
    } else if (level === 'firebase') {
      console.log(`\x1b[93m${consoleMsg}\x1b[0m`); // Bright Yellow
    } else {
      console.log(consoleMsg);
    }

    if (!writeToFile) return;

    try {
      // Genel log dosyası
      const generalLogPath = this.getLogFileName('general');
      this.rotateLogIfNeeded(generalLogPath);
      fs.appendFileSync(generalLogPath, fileMsg);

      // Error'ları ayrı dosyaya da yaz
      if (level === 'error') {
        const errorLogPath = this.getLogFileName('error');
        this.rotateLogIfNeeded(errorLogPath);
        fs.appendFileSync(errorLogPath, fileMsg);
      }

      // Bot activity'lerini ayrı takip et
      if (level === 'activity' || level === 'telegram' || level === 'startup') {
        const activityLogPath = this.getLogFileName('activity');
        this.rotateLogIfNeeded(activityLogPath);
        fs.appendFileSync(activityLogPath, fileMsg);
      }

    } catch (error) {
      // Dosya yazma hatası console'a yazdır ama bot'u durdurma
      console.error(`\x1b[31m[LOG ERROR] ${error.message}\x1b[0m`);
    }
  }

  info(message, data) {
    this.writeLog('info', message, data);
  }

  warn(message, data) {
    this.writeLog('warn', message, data);
  }

  error(message, data) {
    this.writeLog('error', message, data);
  }

  debug(message, data) {
    if (process.env.DEBUG === 'true') {
      this.writeLog('debug', message, data);
    }
  }

  // Bot başlatma logları
  startup(message, data) {
    this.writeLog('startup', `🚀 ${message}`, data);
  }

  // Bot aktivite logları
  activity(message, data) {
    this.writeLog('activity', `📊 ${message}`, data);
  }

  // Telegram mesaj logları
  telegram(message, data) {
    this.writeLog('telegram', `📨 ${message}`, data);
  }

  // Firebase logları
  firebase(message, data) {
    this.writeLog('firebase', `🔥 ${message}`, data);
  }

  // Log istatistikleri
  getStats() {
    try {
      const files = fs.readdirSync(this.logDir);
      let totalSize = 0;
      let fileCount = 0;

      files.forEach(file => {
        try {
          const stats = fs.statSync(path.join(this.logDir, file));
          totalSize += stats.size;
          fileCount++;
        } catch (e) {
          // Stat hatası göz ardı et
        }
      });

      return {
        fileCount,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
        logDir: this.logDir
      };
    } catch (error) {
      return { 
        fileCount: 0, 
        totalSizeMB: 0, 
        error: error.message 
      };
    }
  }

  // Günlük log temizleme
  dailyCleanup() {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      let deletedCount = 0;
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        try {
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > thirtyDays) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (e) {
          // Dosya silme hatası göz ardı et
        }
      });

      if (deletedCount > 0) {
        this.info(`🗑️ Günlük temizlik: ${deletedCount} eski log dosyası silindi`);
      }
    } catch (error) {
      this.error('Günlük log temizleme hatası', { error: error.message });
    }
  }
}

const logger = new Logger();

// Günlük temizlik (her gece 03:00)
const scheduleCleanup = () => {
  const now = new Date();
  const nextCleanup = new Date();
  nextCleanup.setHours(3, 0, 0, 0);
  
  if (nextCleanup <= now) {
    nextCleanup.setDate(nextCleanup.getDate() + 1);
  }
  
  const timeUntilCleanup = nextCleanup.getTime() - now.getTime();
  
  setTimeout(() => {
    logger.dailyCleanup();
    // Sonraki gün için tekrar planla
    setInterval(() => logger.dailyCleanup(), 24 * 60 * 60 * 1000);
  }, timeUntilCleanup);
};

scheduleCleanup();

module.exports = logger;
/**
 * אישורטאבו - PM2 Ecosystem Configuration
 * PM2 configuration for Ishurtabu application
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 restart ecosystem.config.js --env production
 */

module.exports = {
  apps: [
    {
      // Application name / שם היישום
      name: 'ishurtabu',

      // Entry point / קובץ ההתחלה
      script: 'server.js',

      // Start arguments / ארגומנטים
      args: '',

      // Single instance required for Playwright automation
      // יש צורך בהוצאה יחידה עבור אוטומציה של Playwright
      instances: 1,

      // Execution mode / מצב ביצוע
      exec_mode: 'fork',

      // Auto restart on failure / הפעלה מחדש אוטומטית בכישלון
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',

      // Watch mode for development / מצב צפייה לפיתוח
      // Set to true in development, false in production
      // הגדר ל-true בפיתוח, false בייצור
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', 'data', '.git', 'certs'],
      watch_delay: 1000,

      // Environment variables / משתנים סביבה
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug'
      },

      // Production environment / סביבת ייצור
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info'
      },

      // Development environment / סביבת פיתוח
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug',
        watch: true
      },

      // Logging configuration / תצורת רישום
      output: './logs/pm2-out.log',
      error: './logs/pm2-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Merge logs from cluster mode / מיזוג יומנים
      merge_logs: true,

      // Process communication / תקשורת תהליך
      listen_timeout: 3000,
      kill_timeout: 5000,

      // Memory and CPU limits / הגבלות זיכרון ו-CPU
      max_memory_restart: '500M',

      // File size for log rotation / גודל קובץ לסיבוב רישום
      max_size: '10M',
      retain: 10,

      // Additional environment variables from .env file
      // משתנים סביבה נוספים מקובץ .env
      env_file: '.env',

      // Interpreter / מתרגם
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=512',

      // Graceful shutdown / כיבוי הדרגתי
      kill_timeout: 5000,

      // Health monitoring / ניטור בריאות
      cron_restart: '0 0 * * *', // Restart daily at midnight / הפעל מחדש מדי יום בחצות
      autorestart: true,

      // Custom error and out patterns for log filtering
      // דפוסים מותאמים לחיפוש בתוך היומנים
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
    }
  ],

  // Cluster deployment settings / הגדרות פריסה לקבוצה
  deploy: {
    production: {
      user: 'ishurtabu',
      host: 'your-domain.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-user/ishurtabu.git',
      path: '/opt/ishurtabu',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    },
    development: {
      user: 'ishurtabu',
      host: 'dev.your-domain.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-user/ishurtabu.git',
      path: '/opt/ishurtabu',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env development'
    }
  }
};

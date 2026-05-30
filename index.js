'use strict';
require('dotenv').config();

const express  = require('express');
const http     = require('http');
const path     = require('path');
const config   = require('./smurf/config/settings');
const logger   = require('./smurf/utils/logger');
const { startBot } = require('./smurf/handlers/connection');
const {
  checkExpiry,
  startExpiryWatchdog,
  scheduleHardExpiry,
  fmtDate,
  fmtCountdown,
} = require('./smurf/utils/expiry');

// ── Expiry state (populated at startup) ───────────────────────
let expiryInfo = { active: true, daysLeft: null, expiryDate: null };

// ── Express app ───────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, 'smurf/SmurfXMD/public')));

// Status page
app.get('/status', (req, res) => {
  const licenceLabel = expiryInfo.expiryDate
    ? `Expires: ${fmtDate(expiryInfo.expiryDate)} (${expiryInfo.daysLeft}d left)`
    : 'No Expiry';

  res.send(`<!DOCTYPE html><html><head><title>${config.BOT_NAME}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;
       padding:40px;display:flex;justify-content:center}
  .card{max-width:560px;width:100%;background:#161b22;border:1px solid #30363d;
        border-radius:12px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.4)}
  .top,.bot{color:#58a6ff;font-family:monospace;letter-spacing:1px}
  h1{color:#58a6ff;margin:14px 0 4px;font-size:22px}
  pre{font-family:'JetBrains Mono','Fira Code',monospace;color:#c9d1d9;
      background:transparent;margin:14px 0;line-height:1.7;white-space:pre-wrap}
  .ok{color:#3fb950;font-weight:bold}
  .key{color:#d2a8ff}
  .quote{color:#8b949e;font-style:italic;border-left:3px solid #30363d;
         padding-left:12px;margin-top:18px}
  .foot{color:#6e7681;text-align:center;margin-top:18px;font-size:13px}
</style></head>
<body>
<div class="card">
<div class="top">╭─❖ ${config.BOT_NAME} ❖─╮</div>
<pre>│
├─❖ <span class="key">Status :</span>  <span class="ok">✅ ONLINE</span>
├─❖ <span class="key">Owner  :</span>  ${config.OWNER_NAME}  (+${config.OWNER_NUMBER})
├─❖ <span class="key">Prefix :</span>  [ ${config.BOT_PREFIX} ]
├─❖ <span class="key">Mode   :</span>  ${config.MODE.toUpperCase()}
├─❖ <span class="key">Host   :</span>  ${logger.PLATFORM}
├─❖ <span class="key">AutoBio:</span>  ${config.AUTO_BIO ? 'ON ✅' : 'OFF'}
├─❖ <span class="key">Licence:</span>  ${licenceLabel}
│</pre>
<div class="bot">╰─❖ Powered by ${config.OWNER_NAME} ❖─╯</div>
<p class="quote">© ${config.BOT_NAME} is awesome 🔥</p>
<p class="foot">Channel · ${config.CHANNEL_NAME}</p>
</div>
</body></html>`);
});

// Health / keep-alive endpoint
app.get('/health', (req, res) => {
  res.json({
    status:      'alive',
    bot:         config.BOT_NAME,
    owner:       config.OWNER_NUMBER,
    platform:    logger.PLATFORM,
    uptime:      Math.floor(process.uptime()),
    memory_mb:   Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    auto_bio:    config.AUTO_BIO,
    auto_like:   config.AUTO_LIKE_STATUS,
    auto_read:   config.AUTO_READ_STATUS,
    expiry_date: expiryInfo.expiryDate ? fmtDate(expiryInfo.expiryDate) : null,
    days_left:   expiryInfo.daysLeft,
  });
});

// Start HTTP server
app.listen(config.PORT, () => {
  logger.info('SERVER', `HTTP server on port ${config.PORT}`);
});

// ── Keep-alive pinger ─────────────────────────────────────────
const PING_INTERVAL_MS = 25 * 60 * 1000; // 25 minutes

if (process.env.DYNO) {
  // Heroku: ping APP_URL or localhost
  const APP_URL = process.env.APP_URL;
  const target  = APP_URL ? `${APP_URL}/health` : `http://localhost:${config.PORT}/health`;
  setInterval(() => { http.get(target, () => {}).on('error', () => {}); }, PING_INTERVAL_MS);
  logger.info('KEEPALIVE', `Pinging ${target} every 25 min`);
} else if (!logger.IS_LOCAL) {
  // Non-Heroku server
  setInterval(() => {
    http.get(`http://localhost:${config.PORT}/health`, () => {}).on('error', () => {});
  }, PING_INTERVAL_MS);
}

// ── Periodic GC hint ─────────────────────────────────────────
setInterval(() => { if (global.gc) global.gc(); }, 5 * 60 * 1000); // every 5 min

// ── Global error handlers ─────────────────────────────────────
process.on('uncaughtException',    err => logger.error('UNCAUGHT',   err.message));
process.on('unhandledRejection',   err => logger.error('UNHANDLED',  err?.message || String(err)));

// ── Helper: get the running WhatsApp socket (if connected) ────
function getRunningSocket() {
  try {
    const { getSocket } = require('./smurf/handlers/connection');
    return getSocket ? getSocket() : null;
  } catch (e) {
    return null;
  }
}

// ── Helper: send a WA message to the bot owner ───────────────
async function notifyOwner(text) {
  try {
    const sock = getRunningSocket();
    if (sock?.user?.id) {
      const botNumber = sock.user.id.split(':')[0].split('@')[0];
      await sock.sendMessage(botNumber    + '@s.whatsapp.net', { text }).catch(() => {});
      await sock.sendMessage(config.OWNER_NUMBER + '@s.whatsapp.net', { text }).catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

// ── Boot ──────────────────────────────────────────────────────
(async () => {
  // 1. Check licence expiry (exits the process if expired and exitOnExpiry is set)
  expiryInfo = await checkExpiry({
    exitOnExpiry: true,
    onExpire: async (_info, expiryDate) => {
      await notifyOwner(
        `⛔ *${config.BOT_NAME} — Licence Expired*\n\n` +
        `📅 Expiry: *${fmtDate(expiryDate)}*\n` +
        `🔒 Bot shut down.\n` +
        `📞 Contact SmurfXMD to renew.\n\n_+${config.OWNER_NUMBER}_`
      );
    },
  });

  // 2. Start the WhatsApp bot
  await startBot().catch(err => {
    logger.error('FATAL', `Bot failed to start: ${err.message}`);
    process.exit(1);
  });

  // 3. Watch for expiry while running — warn owner when approaching
  startExpiryWatchdog(
    // Warning callback (called periodically while still running)
    async (warningText, daysLeft) => {
      try {
        const sock = getRunningSocket();
        if (sock?.user?.id) {
          const botNumber = sock.user.id.split(':')[0].split('@')[0];
          await sock.sendMessage(botNumber + '@s.whatsapp.net', { text: warningText }).catch(() => {});
          if (daysLeft <= 3) {
            await sock.sendMessage(config.OWNER_NUMBER + '@s.whatsapp.net', { text: warningText }).catch(() => {});
          }
        }
      } catch (e) { /* ignore */ }
    },
    // Expiry callback (called when licence expires mid-session)
    async (_info, expiryDate) => {
      await notifyOwner(
        `⛔ *${config.BOT_NAME} — LICENCE EXPIRED*\n\n` +
        `📅 Expiry: *${fmtDate(expiryDate)}*\n` +
        `🔒 Shutting down now.\n` +
        `📞 wa.me/${config.OWNER_NUMBER}\n\n_SMURF-XMD_`
      );
    }
  );

  // 4. Schedule hard (forced) expiry shutdown
  scheduleHardExpiry(async (_info, _expiryDate) => {
    try {
      const sock = getRunningSocket();
      if (sock?.user?.id) {
        const botNumber = sock.user.id.split(':')[0].split('@')[0];
        await sock.sendMessage(botNumber + '@s.whatsapp.net', {
          text: `⛔ *HARD EXPIRY* — ${config.BOT_NAME}\nExpired: ${new Date().toISOString()}\nShutting down instantly.`,
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
  });
})();

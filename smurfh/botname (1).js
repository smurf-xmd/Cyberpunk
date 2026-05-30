'use strict';
// ╭─────────────────────────────────────────────────────────────╮
//   SMURF-XMD  ·  smurfh/botname.js
//   Provides getBotName() helper used by plugins that need the
//   bot's display name without a circular import back into the
//   full config tree.
// ╰─────────────────────────────────────────────────────────────╯

const config = require('../smurf/config/settings');

/**
 * Returns the bot's current display name.
 * Falls back to 'SMURF-XMD' if config hasn't loaded yet.
 */
function getBotName() {
    return (config && config.BOT_NAME) || process.env.BOT_NAME || 'SMURF-XMD';
}

module.exports = { getBotName };

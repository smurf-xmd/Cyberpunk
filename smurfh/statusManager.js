'use strict';
// ╭─────────────────────────────────────────────────────────────╮
//   SMURF-XMD  ·  smurfh/statusManager.js
//   Bridge/alias so plugins inside smurfh/ can import:
//     require('../statusManager')
//   and resolve to the real module at smurf/handlers/statusManager.js
//   Do NOT put business logic here — edit the real module instead.
// ╰─────────────────────────────────────────────────────────────╯

module.exports = require('../smurf/handlers/statusManager');

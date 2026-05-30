'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// SMURF-XMD — View Once & Custom Commands
// .vv → reveal view-once media (group or DM)
// React to save → linker reacts to view-once → saved to DM
// Reply to save → linker replies to view-once → saved to DM
// .cmd → create / delete / list custom text commands
//
// Both react AND reply trigger a silent anonymous save to the
// linker's own DM — the original sender is never notified.
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd, addTrigger } = require('../../smurf/handlers/loader');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');
const { db } = require('../../smurf/db/database');
const config = require('../../smurf/config/settings');
const { cleanJid } = require('../../smurf/utils/helpers');

// ── Ensure custom_commands table exists ──────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS custom_commands (
        name TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        creator TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
`);

const stmts = {
    add: db.prepare('INSERT OR REPLACE INTO custom_commands (name, response, creator) VALUES (?, ?, ?)'),
    del: db.prepare('DELETE FROM custom_commands WHERE name = ?'),
    get: db.prepare('SELECT * FROM custom_commands WHERE name = ?'),
    list: db.prepare('SELECT name, response FROM custom_commands ORDER BY name ASC'),
    exists: db.prepare('SELECT 1 FROM custom_commands WHERE name = ?'),
};

// ── In-memory store: msgId → raw message (for reaction/reply-based save) ─
// Populated by the storeViewOnce trigger below, expires after 10 min
const voStore = new Map();

// ════════════════════════════════════════════════════════════════════
// HELPER — extract view-once payload from any wrapper format
// ════════════════════════════════════════════════════════════════════
function extractViewOnce(msg) {
    if (!msg) return null;
    // Direct view-once wrappers
    if (msg.viewOnceMessage?.message) return msg.viewOnceMessage.message;
    if (msg.viewOnceMessageV2?.message) return msg.viewOnceMessageV2.message;
    if (msg.viewOnceMessageV2Extension?.message) return msg.viewOnceMessageV2Extension.message;
    // Ephemeral envelope wrapping a view-once
    const ep = msg.ephemeralMessage?.message;
    if (ep?.viewOnceMessage?.message) return ep.viewOnceMessage.message;
    if (ep?.viewOnceMessageV2?.message) return ep.viewOnceMessageV2.message;
    if (ep?.viewOnceMessageV2Extension?.message) return ep.viewOnceMessageV2Extension.message;
    // Older WA format: imageMessage/videoMessage with viewOnce flag
    if (msg.imageMessage?.viewOnce) return msg;
    if (msg.videoMessage?.viewOnce) return msg;
    return null;
}

// ════════════════════════════════════════════════════════════════════
// HELPER — download view-once using serialize.js-provided quotedKey
// serialize.js already does the contextInfo unwrapping for us and
// exposes ctx.m.quoted (the quotedMessage) and ctx.m.quotedKey
// ({ id, remoteJid, participant }). Use those — don't re-parse raw.
// ════════════════════════════════════════════════════════════════════
async function downloadViewOnceFromCtx(ctx) {
    const quoted = ctx.m.quoted; // already unwrapped by serialize.js
    const quotedKey = ctx.m.quotedKey; // { id, remoteJid, participant }
    const voMessage = extractViewOnce(quoted);
    if (!voMessage || !quotedKey) return null;

    const fakeMsg = { key: quotedKey, message: voMessage };
    const buf = await downloadMediaMessage(fakeMsg, 'buffer', {}).catch(() => null);
    return buf ? { buf, voMessage } : null;
}

// ════════════════════════════════════════════════════════════════════
// HELPER — download view-once from stored raw message
// ════════════════════════════════════════════════════════════════════
async function downloadViewOnceFromStored(stored) {
    const { voMessage, key } = stored;
    const fakeMsg = { key, message: voMessage };
    const buf = await downloadMediaMessage(fakeMsg, 'buffer', {}).catch(() => null);
    return buf ? { buf, voMessage } : null;
}

// ════════════════════════════════════════════════════════════════════
// HELPER — get bot's self JID (saved-messages inbox)
// ════════════════════════════════════════════════════════════════════
function getBotSelfJid(sock) {
    if (sock?.user?.id) {
        return sock.user.id.split(':')[0] + '@s.whatsapp.net';
    }
    return config.OWNER_NUMBER + '@s.whatsapp.net';
}

// ════════════════════════════════════════════════════════════════════
// HELPER — send downloaded view-once media to a JID anonymously
// (mentions: [] so the original sender is NOT pinged)
// ════════════════════════════════════════════════════════════════════
async function deliverToInbox(sock, toJid, buf, voMessage, stored) {
    const type = getContentType(voMessage);
    const senderNum = stored.sender?.split('@')[0]?.split(':')[0] || 'unknown';
    const chatLabel = stored.groupName || stored.from || 'DM';

    const caption =
        `*View-Once Saved*\n\n` +
        `*From :* ${senderNum}\n` +
        `*Chat :* ${chatLabel}\n` +
        `*Time :* ${new Date().toLocaleString('en-KE', { timeZone: config.TIME_ZONE })}\n\n` +
        `_Saved anonymously by ${config.BOT_NAME}_`;

    if (type === 'imageMessage') {
        await sock.sendMessage(toJid, { image: buf, caption, mentions: [] });
        return true;
    } else if (type === 'videoMessage') {
        await sock.sendMessage(toJid, { video: buf, caption, mimetype: 'video/mp4', mentions: [] });
        return true;
    }
    return false;
}

// ════════════════════════════════════════════════════════════════════
// TRIGGER — store every incoming view-once message
// Runs silently on every message. No action taken here — just cache.
// ════════════════════════════════════════════════════════════════════
addTrigger({
    pattern: /[\s\S]*/,
    handler: async (ctx) => {
        try {
            if (ctx.m.fromMe) return;
            if (ctx.m.isStatus) return;

            const voMessage = extractViewOnce(ctx.m.message);
            if (!voMessage) return;

            const msgId = ctx.m.key?.id;
            if (!msgId) return;

            voStore.set(msgId, {
                voMessage,
                key: ctx.m.key,
                from: ctx.from,
                sender: ctx.sender,
                groupName: ctx.groupName || null,
                ts: Date.now(),
            });
            // Auto-expire after 10 minutes
            setTimeout(() => voStore.delete(msgId), 10 * 60 * 1000);
        } catch {}
    },
});

// ════════════════════════════════════════════════════════════════════
// TRIGGER — REPLY-BASED VIEW-ONCE SAVE
//
// When the LINKER replies to any message (with any text or emoji),
// the bot checks if the quoted message is a stored view-once.
// If yes → silently downloads it and saves to the linker's own DM.
// The original sender is NEVER notified (no @mention, no read receipt).
// ════════════════════════════════════════════════════════════════════
addTrigger({
    pattern: /[\s\S]*/,
    handler: async (ctx) => {
        try {
            const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
            const isLinker =
                ctx.m.fromMe === true ||
                cleanJid(ctx.sender) === cleanJid(ownerJid);
            if (!isLinker) return;

            // Use serialize.js-provided quotedKey for the message ID
            const quotedMsgId = ctx.m.quotedKey?.id;
            if (!quotedMsgId) return;

            const stored = voStore.get(quotedMsgId);
            if (!stored) return;

            const result = await downloadViewOnceFromStored(stored);
            if (!result?.buf) return;

            const { buf, voMessage } = result;
            const botSelfJid = getBotSelfJid(ctx.sock);

            const sent = await deliverToInbox(ctx.sock, botSelfJid, buf, voMessage, stored).catch(() => false);
            if (!sent) return;

            await ctx.react('').catch(() => {});
            voStore.delete(quotedMsgId);

        } catch {}
    },
});

// ════════════════════════════════════════════════════════════════════
// .vv — REVEAL VIEW-ONCE (manual command)
// Works in groups AND in DMs. Reply to a view-once then send .vv
// ════════════════════════════════════════════════════════════════════
addCmd({
    name: 'vv',
    aliases: ['viewonce', 'vo'],
    desc: 'Reveal a view-once image or video (reply to view-once)',
    usage: 'Reply to a view-once with .vv',
    category: 'viewonce',
    handler: async (ctx) => {
        // serialize.js already unwraps contextInfo from any message type
        // and gives us ctx.m.quoted (quotedMessage) and ctx.m.quotedKey
        const quoted = ctx.m.quoted;
        const voMsg = extractViewOnce(quoted);

        if (!voMsg) {
            return ctx.sock.sendMessage(
                ctx.from,
                { text: 'Reply to a *view-once* image or video with *.vv*\n\n_Make sure to reply directly to the view-once message._', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }

        await ctx.react('');

        // Try voStore cache first (most reliable — avoids WA server rejection)
        const quotedMsgId = ctx.m.quotedKey?.id;
        const stored = quotedMsgId ? voStore.get(quotedMsgId) : null;

        let result = stored
            ? await downloadViewOnceFromStored(stored)
            : await downloadViewOnceFromCtx(ctx);

        // Fallback: store missed (bot restarted) → try direct download
        if (!result?.buf && stored) {
            result = await downloadViewOnceFromCtx(ctx);
        }

        if (!result?.buf) {
            await ctx.react('');
            return ctx.sock.sendMessage(
                ctx.from,
                { text: 'Could not download the view-once media. It may have *expired* or the bot restarted before it was cached.', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }

        const { buf, voMessage } = result;
        const type = getContentType(voMessage);
        const senderNum = (ctx.m.quotedKey?.participant || ctx.m.quotedKey?.remoteJid || 'unknown')
            .split('@')[0].split(':')[0];

        try {
            if (type === 'imageMessage') {
                await ctx.sock.sendMessage(ctx.from, {
                    image: buf,
                    caption: `*View-Once Revealed*\nFrom: ${senderNum}\n\n_${config.BOT_NAME}_`,
                    mentions: [],
                    contextInfo: channelCtx(),
                }, { quoted: ctx.m });
            } else if (type === 'videoMessage') {
                await ctx.sock.sendMessage(ctx.from, {
                    video: buf,
                    caption: `*View-Once Revealed*\nFrom: ${senderNum}\n\n_${config.BOT_NAME}_`,
                    mimetype: 'video/mp4',
                    mentions: [],
                    contextInfo: channelCtx(),
                }, { quoted: ctx.m });
            } else {
                await ctx.react('');
                return ctx.sock.sendMessage(
                    ctx.from,
                    { text: 'Unsupported view-once type.', contextInfo: channelCtx() },
                    { quoted: ctx.m }
                );
            }
            await ctx.react('');
        } catch {
            await ctx.react('');
            await ctx.sock.sendMessage(
                ctx.from,
                { text: 'Failed to send the media. Try again.', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }
    },
});


// ════════════════════════════════════════════════════════════════════
// .vv2 — SAVE VIEW-ONCE TO OWNER'S INBOX (silent, private)
// Reply to a view-once with .vv2 → media sent to owner's saved-msgs
// Nothing is revealed in the chat. Owner-only command.
// ════════════════════════════════════════════════════════════════════
addCmd({
    name: 'vv2',
    aliases: ['vvsave', 'vvinbox'],
    desc: 'Save a view-once image or video silently to owner inbox',
    usage: 'Reply to a view-once with .vv2',
    category: 'viewonce',
    handler: async (ctx) => {
        // Owner = whoever linked this session (sock.user.id), not just config.OWNER_NUMBER
        const sessionOwnerJid = getBotSelfJid(ctx.sock);
        const isSessionOwner =
            ctx.m.fromMe === true ||
            cleanJid(ctx.sender) === cleanJid(sessionOwnerJid) ||
            cleanJid(ctx.sender) === cleanJid(config.OWNER_NUMBER + '@s.whatsapp.net');

        if (!isSessionOwner) {
            return ctx.sock.sendMessage(
                ctx.from,
                { text: 'This command is for the *bot owner* only.', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }

        const quoted = ctx.m.quoted;
        const voMsg = extractViewOnce(quoted);

        if (!voMsg) {
            return ctx.sock.sendMessage(
                ctx.from,
                { text: 'Reply to a *view-once* image or video with *.vv2*\n\n_Make sure to reply directly to the view-once message._', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }

        await ctx.react('');

        // Try voStore cache first, fall back to direct download
        const quotedMsgId = ctx.m.quotedKey?.id;
        const stored = quotedMsgId ? voStore.get(quotedMsgId) : null;

        let result = stored
            ? await downloadViewOnceFromStored(stored)
            : await downloadViewOnceFromCtx(ctx);

        if (!result?.buf && stored) {
            result = await downloadViewOnceFromCtx(ctx);
        }

        if (!result?.buf) {
            await ctx.react('');
            return ctx.sock.sendMessage(
                ctx.from,
                { text: 'Could not download the view-once media. It may have *expired* or the bot restarted before it was cached.', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }

        const { buf, voMessage } = result;

        // Always deliver to the session account's own saved-messages inbox.
        // getBotSelfJid reads sock.user.id — this is the number that scanned
        // the QR / linked the session, i.e. the actual owner's number,
        // regardless of what OWNER_NUMBER is set to in config.
        const ownerInboxJid = getBotSelfJid(ctx.sock);

        // Build stored-like object for deliverToInbox caption
        const inboxMeta = stored || {
            sender: ctx.m.quotedKey?.participant || ctx.m.quotedKey?.remoteJid || 'unknown',
            from: ctx.from,
            groupName: ctx.groupName || null,
        };

        try {
            const sent = await deliverToInbox(ctx.sock, ownerInboxJid, buf, voMessage, inboxMeta);
            if (sent) {
                await ctx.react('');
            } else {
                await ctx.react('');
                await ctx.sock.sendMessage(
                    ctx.from,
                    { text: 'Unsupported view-once type.', contextInfo: channelCtx() },
                    { quoted: ctx.m }
                );
            }
        } catch {
            await ctx.react('');
            await ctx.sock.sendMessage(
                ctx.from,
                { text: 'Failed to save to inbox. Try again.', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }
    },
});

// ════════════════════════════════════════════════════════════════════
// REACTION-BASED VIEW-ONCE SAVE
//
// When the LINKER reacts with any emoji to a view-once message,
// the media is silently saved to the linker's own DM (saved messages).
// The original sender is NEVER notified.
//
// Exported so connection.js can call it for reactionMessage events.
// ════════════════════════════════════════════════════════════════════

async function handleViewOnceReaction(sock, reactMsg) {
    try {
        const reactionContent = reactMsg.message?.reactionMessage;
        if (!reactionContent) return;

        const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
        const botSelfJid = getBotSelfJid(sock);

        const reactor = cleanJid(
            reactMsg.key.participant ||
            reactMsg.key.remoteJid ||
            ''
        );

        const isLinker =
            reactMsg.key.fromMe === true ||
            reactor === cleanJid(botSelfJid) ||
            reactor === cleanJid(ownerJid);

        if (!isLinker) return;

        const targetMsgId = reactionContent.key?.id;
        if (!targetMsgId) return;

        const stored = voStore.get(targetMsgId);
        if (!stored) return;

        const result = await downloadViewOnceFromStored(stored);
        if (!result?.buf) return;

        const { buf, voMessage } = result;

        const sent = await deliverToInbox(sock, botSelfJid, buf, voMessage, stored).catch(() => false);
        if (!sent) return;

        await sock.sendMessage(reactMsg.key.remoteJid, {
            react: { text: '', key: reactionContent.key },
        }).catch(() => {});

        voStore.delete(targetMsgId);

    } catch {}
}

// ════════════════════════════════════════════════════════════════════
// .cmd — CREATE / DELETE / LIST CUSTOM COMMANDS
// ════════════════════════════════════════════════════════════════════
addCmd({
    name: 'cmd',
    aliases: ['customcmd', 'addcmd'],
    desc: 'Create, delete or list custom commands',
    usage: '.cmd add <name> <response> | .cmd del <name> | .cmd list',
    category: 'viewonce',
    ownerOnly: true,
    handler: async (ctx) => {
        const sub = ctx.args[0]?.toLowerCase();
        const name = ctx.args[1]?.toLowerCase();

        if (sub === 'list') {
            const rows = stmts.list.all();
            if (!rows.length) {
                return ctx.sock.sendMessage(
                    ctx.from,
                    { text: 'No custom commands yet.\n\nCreate one:\n`.cmd add <name> <response>`', contextInfo: channelCtx() },
                    { quoted: ctx.m }
                );
            }
            const lines = rows.map((r, i) =>
                `${i + 1}. *${config.BOT_PREFIX}${r.name}*\n ↳ ${r.response.slice(0, 60)}${r.response.length > 60 ? '…' : ''}`
            ).join('\n\n');
            return ctx.sock.sendMessage(ctx.from, {
                text: `*Custom Commands* (${rows.length})\n\n${lines}\n\n_${config.BOT_NAME}_`,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m });
        }

        if (sub === 'del' || sub === 'delete' || sub === 'remove') {
            if (!name) return ctx.sock.sendMessage(ctx.from,
                { text: 'Provide the command name.\n\nExample: `.cmd del hi`', contextInfo: channelCtx() },
                { quoted: ctx.m });
            if (!stmts.exists.get(name)) return ctx.sock.sendMessage(ctx.from,
                { text: `Custom command *${name}* does not exist.`, contextInfo: channelCtx() },
                { quoted: ctx.m });
            stmts.del.run(name);
            await ctx.react('');
            return ctx.sock.sendMessage(ctx.from,
                { text: `Custom command *${config.BOT_PREFIX}${name}* deleted.`, contextInfo: channelCtx() },
                { quoted: ctx.m });
        }

        if (sub === 'add' || sub === 'set' || sub === 'create') {
            if (!name) return ctx.sock.sendMessage(ctx.from,
                { text: 'Provide a command name.\n\nExample: `.cmd add hello Hello there! `', contextInfo: channelCtx() },
                { quoted: ctx.m });
            const response = ctx.args.slice(2).join(' ');
            if (!response) return ctx.sock.sendMessage(ctx.from,
                { text: `Provide a response.\n\nExample: \`.cmd add ${name} Your reply here\``, contextInfo: channelCtx() },
                { quoted: ctx.m });
            stmts.add.run(name, response, ctx.sender);
            await ctx.react('');
            return ctx.sock.sendMessage(ctx.from, {
                text:
                    `*Custom Command Created!*\n\n` +
                    `*Trigger :* ${config.BOT_PREFIX}${name}\n` +
                    `*Response:* ${response}\n\n` +
                    `_Anyone can now use \`${config.BOT_PREFIX}${name}\`_`,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m });
        }

        return ctx.sock.sendMessage(ctx.from, {
            text:
                `*Custom Commands Usage*\n\n` +
                `*Add:* \`.cmd add <name> <response>\`\n` +
                `*Del:* \`.cmd del <name>\`\n` +
                `*List:* \`.cmd list\`\n\n` +
                `*Example:*\n` +
                `\`.cmd add rules Follow the group rules!\`\n` +
                `→ triggers when anyone sends \`${config.BOT_PREFIX}rules\`\n\n` +
                `_${config.BOT_NAME}_`,
            contextInfo: channelCtx(),
        }, { quoted: ctx.m });
    },
});

// ════════════════════════════════════════════════════════════════════
// TRIGGER — respond to custom commands dynamically
// ════════════════════════════════════════════════════════════════════
addTrigger({
    pattern: new RegExp(`^\\${config.BOT_PREFIX}\\w+`),
    handler: async (ctx) => {
        try {
            if (!ctx.m.isCmd) return;
            const name = ctx.m.command?.toLowerCase();
            if (!name) return;
            const row = stmts.get.get(name);
            if (!row) return;
            await ctx.sock.sendMessage(
                ctx.from,
                { text: row.response, contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        } catch {}
    },
});

// Export for use in connection.js (reaction path)
module.exports = { handleViewOnceReaction };

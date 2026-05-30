'use strict';
const { addTrigger } = require('../../smurf/handlers/loader');
const { getGroupSettings } = require('../../smurf/db/database');
const { cleanJid } = require('../../smurf/utils/helpers');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

const LINK_REGEX = /https?:\/\/|chat\.whatsapp\.com\/|wa\.me\//i;

addTrigger({
    pattern: LINK_REGEX,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;

        const settings = getGroupSettings(ctx.from);
        if (!settings.antilink) return;

        // Allow admins, owner, bot itself
        if (ctx.isAdmin || ctx.isOwner || ctx.m.fromMe) return;

        // Delete the message
        await ctx.deleteMsg().catch(() => {});

        // Warn
        await ctx.send({
            text:
                `*Antilink Protection*\n\n` +
                `@${ctx.sender.split('@')[0]} links are not allowed in this group!\n\n` +
                `_${config.BOT_NAME}_`,
            mentions: [ctx.sender],
        }).catch(() => {});
    },
});

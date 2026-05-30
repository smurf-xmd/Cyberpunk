'use strict';
// ╭─────────────────────────────────────────╮
// SMURF-XMD · reactions.js
// Anime reaction stickers (waifu.pics)
// ╰─────────────────────────────────────────╯

const axios = require('axios');
const { addCmd } = require('../../smurf/handlers/loader');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

/**
 * Fetch a random image for the given waifu.pics SFW endpoint
 * and send it as an image with a reaction caption.
 *
 * Sending as image (not sticker) is far more reliable — sticker
 * conversion requires ffmpeg/sharp and can silently fail on many
 * hosting environments. Images need no local conversion at all.
 */
async function sendReactionSticker(ctx, endpoint, label) {
    try {
        const { data } = await axios.get(
            `https://api.waifu.pics/sfw/${endpoint}`,
            { timeout: 15_000 }
        );
        if (!data?.url) throw new Error('No image returned from waifu.pics');

        const displayName = ctx.pushName || 'Someone';
        const caption = `*${label.toUpperCase()}* \n ${displayName}\n\n_${config.BOT_NAME}_`;

        await ctx.sock.sendMessage(
            ctx.from,
            {
                image: { url: data.url },
                caption,
                contextInfo: channelCtx(),
            },
            { quoted: ctx.m }
        );
    } catch (err) {
        console.error(`[reactions] ${endpoint} failed:`, err?.message || err);
        await ctx.sock.sendMessage(
            ctx.from,
            { text: `Couldn't fetch *${endpoint}* reaction right now. Try again.`, contextInfo: channelCtx() },
            { quoted: ctx.m }
        ).catch(() => {});
    }
}

// Mapping: command name (and aliases) → waifu.pics endpoint
const reactions = [
    { names: ['kiss', 'cium', 'beso'], endpoint: 'kiss' },
    { names: ['cry'], endpoint: 'cry' },
    { names: ['blush'], endpoint: 'blush' },
    { names: ['dance'], endpoint: 'dance' },
    { names: ['kill'], endpoint: 'kill' },
    { names: ['hug'], endpoint: 'hug' },
    { names: ['kick'], endpoint: 'kick' },
    { names: ['slap'], endpoint: 'slap' },
    { names: ['happy'], endpoint: 'happy' },
    { names: ['bully'], endpoint: 'bully' },
    { names: ['pat', 'headpat'], endpoint: 'pat' },
    { names: ['wink'], endpoint: 'wink' },
    { names: ['poke'], endpoint: 'poke' },
    { names: ['cuddle'], endpoint: 'cuddle' },
    { names: ['highfive', 'hi5'], endpoint: 'highfive' },
    { names: ['smile'], endpoint: 'smile' },
    { names: ['wave'], endpoint: 'wave' },
    { names: ['bite'], endpoint: 'bite' },
    { names: ['lick'], endpoint: 'lick' },
    { names: ['bonk'], endpoint: 'bonk' },
    { names: ['yeet'], endpoint: 'yeet' },
    { names: ['glomp'], endpoint: 'glomp' },
    { names: ['nom'], endpoint: 'nom' },
    { names: ['handhold', 'holdhands'], endpoint: 'handhold' },
    { names: ['awoo'], endpoint: 'awoo' },
    { names: ['smug'], endpoint: 'smug' },
    { names: ['cringe'], endpoint: 'cringe' },
    { names: ['neko'], endpoint: 'neko' },
    { names: ['waifu'], endpoint: 'waifu' },
    { names: ['shinobu'], endpoint: 'shinobu' },
    { names: ['megumin'], endpoint: 'megumin' },
];

for (const r of reactions) {
    const [name, ...aliases] = r.names;
    addCmd({
        name,
        aliases,
        desc: `Send a random *${name}* reaction sticker.`,
        usage: name,
        category: 'reactions',
        handler: async (ctx) => sendReactionSticker(ctx, r.endpoint, name),
    });
}

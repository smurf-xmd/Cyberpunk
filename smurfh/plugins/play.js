'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// SMURF-XMD — play.js
// .play · .ytmp3 · .ytmp3doc
// API: apis.davidcyril.name.ng
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd } = require('../../smurf/handlers/loader');
const axios = require('axios');
const yts = require('yt-search');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

const API_BASE = 'https://apis.davidcyril.name.ng';
const API_TIMEOUT = 25000;

// ── Fetch audio info from davidcyril API ─────────────────────
async function fetchAudio(query) {
    const url = `${API_BASE}/play?query=${encodeURIComponent(query)}`;
    console.log(`[play] Fetching: ${url}`);
    const res = await axios.get(url, {
        timeout: API_TIMEOUT,
        headers: { 'User-Agent': 'SmurfXmdMD/2.0' },
    });
    const d = res.data;
    if (d.status === true && d.result?.download_url) {
        return {
            download_url: d.result.download_url,
            title: d.result.title,
            duration: d.result.duration,
            thumbnail: d.result.thumbnail,
            video_url: d.result.video_url,
        };
    }
    throw new Error(d.message || 'API returned no download URL');
}

// ══════════════════════════════════════════════════════════════
// PLAY — sends audio + document directly, no buttons
// ══════════════════════════════════════════════════════════════
addCmd({
    name: 'play',
    aliases: ['ytmp3', 'ytaudio', 'yta', 'music', 'song'],
    desc: 'Download and send a song as audio + document',
    usage: 'play <song name or YouTube URL>',
    category: 'music',
    handler: async (ctx) => {
        if (!ctx.text)
            return ctx.reply(
                `*Provide a song name or YouTube link.*

` +
                `Example: \`${config.BOT_PREFIX}play mambichwa\``
            );

        await ctx.react('');

        try {
            let videoUrl, videoTitle, videoDuration, videoThumb;

            const isUrl = /youtu(be.com|.be)/i.test(ctx.text);

            if (isUrl) {
                const videoId = ctx.text.includes('youtube.com/watch')
                    ? ctx.text.split('v=')[1]?.split('&')[0]
                    : ctx.text.split('/').pop()?.split('?')[0];

                const info = await yts({ videoId }).catch(() => null);
                videoUrl = ctx.text;
                videoTitle = info?.title || info?.name || ctx.text;
                videoDuration = info?.timestamp || info?.duration || '?';
                videoThumb = info?.thumbnail || info?.image || '';
            } else {
                const search = await yts(ctx.text).catch(() => null);
                if (!search?.videos?.length) {
                    await ctx.react('');
                    return ctx.sock.sendMessage(ctx.from, {
                        text: `No results found for *${ctx.text}*. Try a different song name.`,
                        contextInfo: channelCtx(),
                    }, { quoted: ctx.m });
                }
                const top = search.videos[0];
                videoUrl = top.url;
                videoTitle = top.title || ctx.text;
                videoDuration = top.timestamp || top.duration || '?';
                videoThumb = top.thumbnail || top.image || '';
            }

            await ctx.react('');

            let apiResult;
            try {
                apiResult = await fetchAudio(videoTitle);
            } catch (err) {
                console.log(`[play] API error: ${err.message}`);
                await ctx.react('');
                return ctx.sock.sendMessage(ctx.from, {
                    text: `Could not fetch audio for *${videoTitle}*.
Please try again later.`,
                    contextInfo: channelCtx(),
                }, { quoted: ctx.m });
            }

            const title = apiResult.title || videoTitle;
            const duration = apiResult.duration || videoDuration;
            const safeTitle = title.replace(/[^\w\s.-]/gi, '');

            // Download buffer via URL
            const audioRes = await axios.get(apiResult.download_url, {
                responseType: 'arraybuffer',
                timeout: 40000,
                headers: { 'User-Agent': 'SmurfXmdMD/2.0' },
            });
            const buffer = Buffer.from(audioRes.data);

            if (!buffer || buffer.length < 0x2800) {
                await ctx.react('');
                return ctx.sock.sendMessage(ctx.from, {
                    text: 'Failed to download audio. Please try again.',
                    contextInfo: channelCtx(),
                }, { quoted: ctx.m });
            }

            // Send as playable audio
            await ctx.sock.sendMessage(ctx.from, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                ptt: false,
            }, { quoted: ctx.m });

            // Send as downloadable document
            await ctx.sock.sendMessage(ctx.from, {
                document: buffer,
                mimetype: 'audio/mpeg',
                fileName: `${safeTitle}.mp3`,
                caption: `*${title}*
 *Duration:* ${duration}

_${config.BOT_NAME}_`,
            }, { quoted: ctx.m });

            await ctx.react('');

        } catch (err) {
            console.error('[play] Unexpected error:', err.message);
            await ctx.react('');
            await ctx.sock.sendMessage(ctx.from, {
                text: `Something went wrong. Please try again.

Error: ${err.message}`,
                contextInfo: channelCtx(),
            }, { quoted: ctx.m });
        }
    },
});

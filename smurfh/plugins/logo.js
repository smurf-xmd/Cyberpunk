'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// SMURF-XMD — logo.js
// Logo maker — multi-API with fallback chain
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd } = require('../../smurf/handlers/loader');
const axios = require('axios');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

// ── Ephoto360 style-id map (direct scrape — no API key needed) ─
const EPHOTO_IDS = {
    glossysilver: '596',
    writetext: '870',
    blackpinklogo: '533',
    glitchtext: '618',
    advancedglow: '676',
    typographytext: '620',
    pixelglitch: '756',
    neonglitch: '632',
    nigerianflag: '822',
    americanflag: '818',
    deletingtext: '722',
    blackpinkstyle: '531',
    glowingtext: '594',
    underwater: '730',
    logomaker: '570',
    cartoonstyle: '726',
    papercut: '758',
    effectclouds: '572',
    gradienttext: '606',
    summerbeach: '578',
    sandsummer: '580',
    luxurygold: '560',
    galaxy: '628',
    logo1917: '694',
    makingneon: '640',
    texteffect: '608',
    galaxystyle: '630',
    lighteffect: '610',
};

const LOGO_STYLES = [
    { name: 'glossysilver', aliases: ['glossy','silverlogo'], desc: 'Glossy Silver' },
    { name: 'writetext', aliases: ['textwrite','baby'], desc: 'Write Text' },
    { name: 'blackpinklogo', aliases: ['bplogo','pinkblack'], desc: 'Black Pink' },
    { name: 'glitchtext', aliases: ['glitch','textglitch'], desc: 'Glitch Text' },
    { name: 'advancedglow', aliases: ['advglow','glowadvanced'], desc: 'Advanced Glow' },
    { name: 'typographytext', aliases: ['typography','typo'], desc: 'Typography Text' },
    { name: 'pixelglitch', aliases: ['pixelg','glitchpixel'], desc: 'Pixel Glitch' },
    { name: 'neonglitch', aliases: ['neong','glitchneon'], desc: 'Neon Glitch' },
    { name: 'nigerianflag', aliases: ['ngflag','nigeria'], desc: 'Nigerian Flag' },
    { name: 'americanflag', aliases: ['usflag','usaflag','america'], desc: 'American Flag' },
    { name: 'deletingtext', aliases: ['deltext','textdelete'], desc: 'Deleting Text' },
    { name: 'blackpinkstyle', aliases: ['bpstyle','pinkblackstyle'], desc: 'Blackpink Style' },
    { name: 'glowingtext', aliases: ['glowtxt','textglow'], desc: 'Glowing Text' },
    { name: 'underwater', aliases: ['underw','waterlogo'], desc: 'Under Water' },
    { name: 'logomaker', aliases: ['makelogo','logomake'], desc: 'Logo Maker' },
    { name: 'cartoonstyle', aliases: ['cartoon','toonlogo'], desc: 'Cartoon Style' },
    { name: 'papercut', aliases: ['cutpaper','papercutlogo'], desc: 'Paper Cut' },
    { name: 'effectclouds', aliases: ['cloudeffect','clouds'], desc: 'Effect Clouds' },
    { name: 'gradienttext', aliases: ['gradient','textgradient'], desc: 'Gradient Text' },
    { name: 'summerbeach', aliases: ['beachsummer','beach'], desc: 'Summer Beach' },
    { name: 'sandsummer', aliases: ['summersand','sand'], desc: 'Sand Summer' },
    { name: 'luxurygold', aliases: ['goldluxury','luxgold'], desc: 'Luxury Gold' },
    { name: 'galaxy', aliases: ['galaxylogo','space'], desc: 'Galaxy' },
    { name: 'logo1917', aliases: ['1917','1917logo'], desc: '1917 Style' },
    { name: 'makingneon', aliases: ['neonmake','neonlogo'], desc: 'Making Neon' },
    { name: 'texteffect', aliases: ['effecttext','fxtext'], desc: 'Text Effect' },
    { name: 'galaxystyle', aliases: ['stylegalaxy','galstyle'], desc: 'Galaxy Style' },
    { name: 'lighteffect', aliases: ['effectlight','lightlogo'], desc: 'Light Effect' },
];

// ── Download buffer helper ─────────────────────────────────────
async function downloadBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    return Buffer.from(res.data);
}

// ── Method 1: gifted-apis (original) ──────────────────────────
async function tryGiftedApi(endpoint, text) {
    const GIFTED_API = 'https://gifted-apis.vercel.app';
    const GIFTED_KEY = process.env.GIFTED_API_KEY || '';
    const url = `${GIFTED_API}/api/ephoto360/${endpoint}?apikey=${GIFTED_KEY}&text=${encodeURIComponent(text)}`;
    const { data } = await axios.get(url, { timeout: 30000 });
    if (!data?.success || !data?.result?.image_url) throw new Error('gifted-api: no image_url');
    return await downloadBuffer(data.result.image_url);
}

// ── Method 2: Direct ephoto360 scrape ─────────────────────────
async function tryEphoto360(endpoint, text) {
    const styleId = EPHOTO_IDS[endpoint];
    if (!styleId) throw new Error('No ephoto360 ID for ' + endpoint);

    // Step 1: GET the effect page to grab the nonce/token
    const pageUrl = `https://en.ephoto360.com/effect-${styleId}.html`;
    const pageRes = await axios.get(pageUrl, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    const html = pageRes.data;

    // Extract nonce (wp_ajax nonce or similar token)
    const nonceMatch = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i) ||
                       html.match(/nonce['":\s]+([a-f0-9]{10})/i);
    const nonce = nonceMatch ? nonceMatch[1] : '';

    // Extract form action URL
    const ajaxMatch = html.match(/["']ajaxurl["']\s*:\s*["']([^"']+)["']/i);
    const ajaxUrl = ajaxMatch ? ajaxMatch[1] : 'https://en.ephoto360.com/wp-admin/admin-ajax.php';

    // Step 2: POST to generate the image
    const FormData = require('form-data');
    const form = new FormData();
    form.append('action', 'make_effect_1');
    form.append('id', styleId);
    form.append('text', text);
    form.append('nonce', nonce);

    const postRes = await axios.post(ajaxUrl, form, {
        headers: {
            ...form.getHeaders(),
            'Referer': pageUrl,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        timeout: 60000,
    });

    const result = postRes.data;
    // Response may be JSON { status: 1, image: 'url' } or similar
    const imgUrl = result?.data?.image ||
                   result?.image ||
                   result?.url ||
                   (typeof result === 'string' && result.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp)/i)?.[0]);

    if (!imgUrl) throw new Error('ephoto360: no image URL in response');
    return await downloadBuffer(imgUrl);
}

// ── Method 3: TextPro.co (always-on fallback API) ─────────────
const TEXTPRO_STYLES = {
    luxurygold: 'gold-gradient-text-effect',
    glowingtext: 'neon-text-effect',
    neonglitch: 'neon-text-effect',
    glitchtext: 'glitch-text-effect',
    advancedglow: 'fire-text-effect',
    gradienttext: 'gradient-text-effect',
    typographytext: '3d-text-effect',
    galaxy: 'galaxy-text-effect',
    galaxystyle: 'galaxy-text-effect',
};

async function tryTextPro(endpoint, text) {
    const style = TEXTPRO_STYLES[endpoint] || 'gold-gradient-text-effect';
    const url = `https://textpro.me/generate/${style}/${encodeURIComponent(text)}`;
    const res = await axios.get(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.data?.image) throw new Error('textpro: no image');
    return await downloadBuffer(res.data.image);
}

// ── Main logo function with fallback chain ─────────────────────
async function makeLogo(ctx, endpoint, desc) {
    const text = ctx.text?.trim();
    if (!text) {
        return ctx.reply(
            `Please provide text.\n\n` +
            `Usage: \`${config.BOT_PREFIX}${endpoint} <your text>\`\n` +
            `Example: \`${config.BOT_PREFIX}${endpoint} ${ctx.pushName || 'Smurf'}\``
        );
    }

    await ctx.react('');

    // Try each method in order until one works
    const methods = [
        { name: 'gifted-api', fn: () => tryGiftedApi(endpoint, text) },
        { name: 'ephoto360', fn: () => tryEphoto360(endpoint, text) },
        { name: 'textpro', fn: () => tryTextPro(endpoint, text) },
    ];

    let imgBuf = null;
    for (const method of methods) {
        try {
            imgBuf = await method.fn();
            if (imgBuf && imgBuf.length > 1000) break; // valid image buffer
        } catch (e) {
            console.warn(`[logo:${endpoint}] ${method.name} failed: ${e.message}`);
        }
    }

    if (!imgBuf || imgBuf.length < 1000) {
        await ctx.react('');
        return ctx.reply(
            `Logo generation failed for *${desc}*.\n` +
            `All image APIs are currently unavailable. Please try again later.`
        );
    }

    try {
        await ctx.sock.sendMessage(
            ctx.from,
            {
                image: imgBuf,
                caption: `*${desc}*\n\n*Text:* ${text}\n\n◈ ${config.BOT_NAME}`,
                contextInfo: channelCtx(),
            },
            { quoted: ctx.m }
        );
        await ctx.react('');
    } catch (e) {
        console.error(`[logo:${endpoint}] send error:`, e.message);
        await ctx.react('');
        await ctx.reply('Failed to send logo image.');
    }
}

// ── Register each style as a command ──────────────────────────
for (const style of LOGO_STYLES) {
    addCmd({
        name: style.name,
        aliases: style.aliases,
        desc: `Create ${style.desc} logo`,
        usage: `${style.name} <text>`,
        category: 'logo',
        handler: (ctx) => makeLogo(ctx, style.name, style.desc),
    });
}

// ── Logo list ──────────────────────────────────────────────────
addCmd({
    name: 'logolist',
    aliases: ['logos','logo','logohelp','logomenu'],
    desc: 'Show all available logo styles',
    category: 'logo',
    handler: async (ctx) => {
        const p = config.BOT_PREFIX;
        const list = LOGO_STYLES.map((s, i) => `│➽ ${String(i + 1).padStart(2, '0')}. *${s.name}* — ${s.desc}`).join('\n');
        const out =
            `┏▣ ◈ * LOGO MAKER* ◈\n` +
            `${list}\n` +
            `┗▣\n\n` +
            `*Usage:* \`${p}stylename <your text>\`\n` +
            `*Example:* \`${p}glossysilver ${ctx.pushName || 'Smurf'}\`\n\n` +
            `◈ ${config.BOT_NAME}`;
        await ctx.react('');
        await ctx.sock.sendMessage(ctx.from, { text: out, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

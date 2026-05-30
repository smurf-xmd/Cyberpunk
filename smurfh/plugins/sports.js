'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// SMURF-XMD — sports.js
// NBA Scores · Soccer Standings · Team Search
// API: apis.davidcyril.name.ng
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd, addTrigger } = require('../../smurf/handlers/loader');
const axios = require('axios');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

const API = 'https://apis.davidcyril.name.ng';

// ── Pending reply sessions ─────────────────────────────────────
const pending = new Map();
const TTL = 120_000;

const SPORT_PENDING_KEY = '__sports__';

function setPending(from, type) {
    pending.set(from, { type, expiresAt: Date.now() + TTL });
    setTimeout(() => {
        const e = pending.get(from);
        if (e && e.expiresAt <= Date.now()) pending.delete(from);
    }, TTL + 500);
}
function getPending(from) {
    const e = pending.get(from);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { pending.delete(from); return null; }
    return e;
}

async function send(ctx, text) {
    return ctx.sock.sendMessage(ctx.from, { text, contextInfo: channelCtx() }, { quoted: ctx.m });
}

// ── Soccer league codes ────────────────────────────────────────
const SOCCER_LEAGUES = {
    '1': { name: 'Premier League',        code: 'premierleague' },
    '2': { name: 'La Liga',               code: 'laliga'        },
    '3': { name: 'Bundesliga',            code: 'bundesliga'    },
    '4': { name: 'Serie A',               code: 'seriea'        },
    '5': { name: 'Ligue 1',               code: 'ligue1'        },
    '6': { name: 'Champions League',      code: 'ucl'           },
};

function leagueMenu() {
    let m = `╭━━━━━━━━━━━╮\n│ ⚽ *SOCCER STANDINGS*\n├━━━━━━━━━━━┤\n│ _Reply with a number_\n├━━━━━━━━━━━┤\n`;
    for (const [n, l] of Object.entries(SOCCER_LEAGUES)) m += `│ ${n}. ${l.name}\n`;
    return m + `╰━━━━━━━━━━━╯\n\n_This menu expires in 2 min_`;
}

// ═══════════════════════════════════════════════════════════════
// NBA SCORES
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'nba',
    aliases: ['nbascores', 'basketball', 'nbatoday'],
    desc: 'Get today\'s NBA scores and results',
    usage: 'nba',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('🏀');
        try {
            const { data } = await axios.get(`${API}/sports/nba/scores`, { timeout: 15000 });
            if (!data || (!Array.isArray(data) && !data.games && !data.results && !data.scores)) {
                await ctx.react('❌');
                return send(ctx, `🏀 *NBA SCORES*\n\nNo game data available right now.\nTry again later.\n\n◈ ${config.BOT_NAME}`);
            }

            const games = Array.isArray(data) ? data : (data.games || data.results || data.scores || []);

            if (!games.length) {
                await ctx.react('😴');
                return send(ctx, `🏀 *NBA SCORES*\n\nNo games scheduled today.\n\n◈ ${config.BOT_NAME}`);
            }

            let out = `╭━━━━━━━━━━━╮\n│ 🏀 *NBA SCORES*\n╰━━━━━━━━━━━╯\n\n`;
            for (const g of games) {
                const home = g.homeTeam || g.home_team || g.home || 'Home';
                const away = g.awayTeam || g.away_team || g.away || 'Away';
                const homeScore = g.homeScore ?? g.home_score ?? g.homePoints ?? '-';
                const awayScore = g.awayScore ?? g.away_score ?? g.awayPoints ?? '-';
                const status = g.status || g.gameStatus || g.state || '';
                const period = g.period || g.quarter || '';

                const statusIcon = status.toLowerCase().includes('final') || status.toLowerCase().includes('ft') ? '🏁'
                    : status.toLowerCase().includes('live') || status.toLowerCase().includes('progress') ? '🔴'
                    : '🕐';

                out += `┏━━━━━━━━━┓\n`;
                out += `┃ ${statusIcon} ${status}${period ? ` · Q${period}` : ''}\n`;
                out += `┃ 🏠 *${home}*  ${homeScore}\n`;
                out += `┃ ✈️ *${away}*  ${awayScore}\n`;
                out += `┗━━━━━━━━━┛\n\n`;
            }
            out += `◈ ${config.BOT_NAME}`;
            await send(ctx, out);
            await ctx.react('✅');
        } catch (e) {
            await ctx.react('❌');
            await send(ctx, `🏀 *NBA SCORES*\n\nFailed to fetch scores.\nError: ${e.message}\n\n◈ ${config.BOT_NAME}`);
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// TEAM SEARCH
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'team',
    aliases: ['teaminfo', 'clubinfo', 'searchteam'],
    desc: 'Search for a sports team by name',
    usage: 'team <name>',
    category: 'sports',
    handler: async (ctx) => {
        const query = ctx.args.join(' ').trim();
        if (!query) return send(ctx, `❌ Provide a team name.\nUsage: *${config.BOT_PREFIX}team <name>*\nExample: *${config.BOT_PREFIX}team Arsenal*`);

        await ctx.react('🔍');
        try {
            const { data } = await axios.get(`${API}/sports/team`, {
                params: { name: query },
                timeout: 15000,
            });

            const teams = Array.isArray(data) ? data : (data.teams || data.results || data.data || (data.team ? [data.team] : []));

            if (!teams || !teams.length) {
                await ctx.react('😕');
                return send(ctx, `🔍 *TEAM SEARCH*\n\nNo results for "*${query}*".\nTry a different name.\n\n◈ ${config.BOT_NAME}`);
            }

            let out = `╭━━━━━━━━━━━╮\n│ 🔍 *TEAM SEARCH*\n│ _"${query}"_\n╰━━━━━━━━━━━╯\n\n`;
            for (const t of teams.slice(0, 5)) {
                const name    = t.name || t.teamName || t.strTeam || 'Unknown';
                const league  = t.league || t.leagueName || t.strLeague || '';
                const country = t.country || t.strCountry || '';
                const stadium = t.stadium || t.strStadium || '';
                const formed  = t.formedYear || t.strFormedYear || '';
                const desc    = t.description || t.strDescriptionEN || '';

                out += `┏━━━━━━━━━┓\n`;
                out += `┃ 🏟️ *${name}*\n`;
                if (league)  out += `┃ 🏆 ${league}\n`;
                if (country) out += `┃ 🌍 ${country}\n`;
                if (stadium) out += `┃ 🏟️ ${stadium}\n`;
                if (formed)  out += `┃ 📅 Founded: ${formed}\n`;
                if (desc)    out += `┃ 📝 ${desc.slice(0, 100)}...\n`;
                out += `┗━━━━━━━━━┛\n\n`;
            }
            out += `◈ ${config.BOT_NAME}`;
            await send(ctx, out);
            await ctx.react('✅');
        } catch (e) {
            await ctx.react('❌');
            await send(ctx, `🔍 *TEAM SEARCH*\n\nFailed to fetch team info.\nError: ${e.message}\n\n◈ ${config.BOT_NAME}`);
        }
    },
});

// ═══════════════════════════════════════════════════════════════
// SOCCER STANDINGS
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'standings',
    aliases: ['leaguetable', 'table', 'soccerstandings'],
    desc: 'View current soccer league standings',
    usage: 'standings',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('⚽');
        setPending(ctx.from, 'standings');
        await send(ctx, leagueMenu());
    },
});

// ═══════════════════════════════════════════════════════════════
// NUMERIC REPLY — only fires when sports session is active
// Uses a more specific pattern to avoid colliding with menu.js
// ═══════════════════════════════════════════════════════════════
addTrigger({
    pattern: /^\s*([1-9])\s*$/,
    handler: async (ctx) => {
        // Only handle if there is an active sports pending session
        const session = getPending(ctx.from);
        if (!session) return; // let other triggers (menu.js) handle it

        const choice = ctx.body.trim();

        if (session.type === 'standings') {
            const league = SOCCER_LEAGUES[choice];
            if (!league) {
                return send(ctx, `⚠️ Pick a number *1–${Object.keys(SOCCER_LEAGUES).length}* for a league.`);
            }
            pending.delete(ctx.from);
            await ctx.react('⚽');

            try {
                const { data } = await axios.get(`${API}/sports/soccer/standings`, {
                    params: { league: league.code },
                    timeout: 15000,
                });

                const table = Array.isArray(data) ? data
                    : (data.standings || data.table || data.results || data.data || []);

                if (!table.length) {
                    return send(ctx, `⚽ No standings data for *${league.name}* right now.`);
                }

                let out = `╭━━━━━━━━━━━╮\n│ ⚽ *${league.name}*\n│ *STANDINGS*\n╰━━━━━━━━━━━╯\n\n`;
                out += `*#  Team              P   W   D   L  Pts*\n${'─'.repeat(40)}\n`;

                for (const t of table) {
                    const pos    = t.position ?? t.rank ?? t.pos ?? '?';
                    const team   = (t.team || t.teamName || t.name || 'Unknown').substring(0, 14).padEnd(14);
                    const played = t.played ?? t.gamesPlayed ?? t.mp ?? '-';
                    const won    = t.won ?? t.wins ?? t.w ?? '-';
                    const drawn  = t.drawn ?? t.draws ?? t.d ?? '-';
                    const lost   = t.lost ?? t.losses ?? t.l ?? '-';
                    const pts    = t.points ?? t.pts ?? '-';

                    const zone = pos <= 4 ? '🟦' : pos <= 6 ? '🟨' : pos >= (table.length - 2) ? '🟥' : '⬜';
                    out += `${zone}${String(pos).padStart(2)}. ${team} ${String(played).padStart(2)}  ${String(won).padStart(2)}  ${String(drawn).padStart(2)}  ${String(lost).padStart(2)}  *${String(pts).padStart(3)}*\n`;
                }

                out += `\n🟦 UCL  🟨 UEL  🟥 Relegated\n◈ ${config.BOT_NAME}`;
                await send(ctx, out);
                await ctx.react('✅');
            } catch (e) {
                await ctx.react('❌');
                await send(ctx, `⚽ Failed to fetch *${league.name}* standings.\nError: ${e.message}`);
            }
        }
    },
});

// Export pending map so menu.js can yield to sports sessions
module.exports = { sportsPending: pending };

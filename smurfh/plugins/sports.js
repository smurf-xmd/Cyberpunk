'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// SMURF-XMD — sports.js
// Live scores · Standings · Top scorers · Fixtures · News
// (ported from DarklordFarhan-XMD, adapted to smurf addCmd/ctx)
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd } = require('../../smurf/handlers/loader');
const axios = require('axios');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

const API = 'https://apiskeith.top';

const LEAGUES = {
    '1': { name: 'Premier League', code: 'epl', emoji: '󠁧󠁢󠁥󠁮󠁧󠁿' },
    '2': { name: 'Bundesliga', code: 'bundesliga', emoji: '' },
    '3': { name: 'La Liga', code: 'laliga', emoji: '' },
    '4': { name: 'Ligue 1', code: 'ligue1', emoji: '' },
    '5': { name: 'Serie A', code: 'seriea', emoji: '' },
    '6': { name: 'UEFA Champions League', code: 'ucl', emoji: '' },
    '7': { name: 'FIFA International', code: 'fifa', emoji: '' },
    '8': { name: 'UEFA Euro', code: 'euros', emoji: '' },
};

function leagueMenu(title, icon) {
    let m = `╭━━━━━━━━━━━╮\n│ ${icon} *${title}*\n├━━━━━━━━━━━┤\n│ _Reply with a number_\n├━━━━━━━━━━━┤\n`;
    for (const [n, l] of Object.entries(LEAGUES)) m += `│ ${n}. ${l.emoji} ${l.name}\n`;
    return m + '╰━━━━━━━━━━━╯';
}

function getStatusIcon(st) {
    return { HT: '', FT: '', Pen: '', '1T': '', '2T': '' }[st] || '';
}
function getStatusText(st) {
    return { '': 'Not Started', FT: 'Full Time', '1T': '1st Half', '2T': '2nd Half', HT: 'Half Time', Pst: 'Postponed', Canc: 'Cancelled', Pen: 'Penalties' }[st] || st;
}
function fmtNewsDate(ts) {
    try { return new Date(Number(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return 'Recent'; }
}

// ── Pending reply sessions (reply-number flow) ─────────────────
// Map<chatJid, { type, expiresAt }>
const pending = new Map();
const TTL = 120_000;

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

// helper — send with quoted + channelCtx
async function send(ctx, text) {
    return ctx.sock.sendMessage(ctx.from, { text, contextInfo: channelCtx() }, { quoted: ctx.m });
}

// ── surebet ────────────────────────────────────────────────────
addCmd({
    name: 'surebet', aliases: ['bettips','odds','predict','bet','sureodds'],
    desc: 'Get betting tips and odds predictions',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        try {
            const { data } = await axios.get(`${API}/bet`, { timeout: 15000 });
            if (!data?.status || !data?.result?.length) {
                await ctx.react('');
                return ctx.reply('No betting tips available right now. Try again later.');
            }
            let txt = `╭━━━━━━━━━━━╮\n│ *BETTING TIPS*\n├━━━━━━━━━━━┤\n│ *Today's Picks*\n╰━━━━━━━━━━━╯\n\n`;
            for (const [i, m] of data.result.entries()) {
                txt += `┏━ *Match ${i + 1}* ━┓\n┃ *${m.match}*\n┃ ${m.league}\n┃ ${m.time}\n┣━━━━━━━━━┫\n`;
                if (m.predictions?.fulltime) txt += `┃ FT: ${m.predictions.fulltime.home}% ${m.predictions.fulltime.draw}% ${m.predictions.fulltime.away}%\n`;
                if (m.predictions?.over_2_5) txt += `┃ O2.5: ${m.predictions.over_2_5.yes}%\n`;
                if (m.predictions?.bothTeamToScore) txt += `┃ BTTS: ${m.predictions.bothTeamToScore.yes}%\n`;
                if (m.predictions?.value_bets) txt += `┃ ${m.predictions.value_bets}\n`;
                txt += `┗━━━━━━━━━┛\n\n`;
            }
            txt += `_ Bet responsibly._\n◈ ${config.BOT_NAME}`;
            await send(ctx, txt);
            await ctx.react('');
        } catch (e) {
            await ctx.react('');
            ctx.reply('Failed to fetch betting tips. Try again later.');
        }
    },
});

// ── livescore ──────────────────────────────────────────────────
addCmd({
    name: 'livescore', aliases: ['live','score','livematch'],
    desc: 'Get live, finished, or upcoming football matches',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        setPending(ctx.from, 'livescore');
        await send(ctx,
            `╭━━━━━━━━━━━╮\n│ *SCORES*\n├━━━━━━━━━━━┤\n│ _Reply with number_\n├━━━━━━━━━━━┤\n│ 1. Live\n│ 2. Finished\n│ 3. Upcoming\n╰━━━━━━━━━━━╯`
        );
    },
});

// ── standings ──────────────────────────────────────────────────
addCmd({
    name: 'standings', aliases: ['leaguetable','table','league'],
    desc: 'View current league standings',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        setPending(ctx.from, 'standings');
        await send(ctx, leagueMenu('LEAGUE STANDINGS', ''));
    },
});

// ── topscorers ─────────────────────────────────────────────────
addCmd({
    name: 'topscorers', aliases: ['scorers','goals','goldenboot'],
    desc: 'View top goal scorers across major leagues',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        setPending(ctx.from, 'topscorers');
        await send(ctx, leagueMenu('TOP SCORERS', ''));
    },
});

// ── upcomingmatches ────────────────────────────────────────────
addCmd({
    name: 'upcomingmatches', aliases: ['fixtures','upcoming','nextgames','schedule'],
    desc: 'View upcoming matches across major leagues',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        setPending(ctx.from, 'upcomingmatches');
        await send(ctx, leagueMenu('UPCOMING MATCHES', ''));
    },
});

// ── gamehistory ────────────────────────────────────────────────
addCmd({
    name: 'gamehistory', aliases: ['matchevents','gameevents','matchstats'],
    desc: 'Get recent match events and history',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        setPending(ctx.from, 'gamehistory');
        await send(ctx, leagueMenu('MATCH HISTORY', ''));
    },
});

// ── sportnews ──────────────────────────────────────────────────
addCmd({
    name: 'sportnews', aliases: ['footballnews','soccernews'],
    desc: 'Get latest football news',
    category: 'sports',
    handler: async (ctx) => {
        await ctx.react('');
        try {
            const { data } = await axios.get(`${API}/football/news`, { timeout: 15000 });
            const items = data?.result?.data?.items;
            if (!Array.isArray(items) || !items.length) {
                await ctx.react('');
                return ctx.reply('No football news available right now.');
            }
            let out = `╭━━━━━━━━━━━╮\n│ *FOOTBALL NEWS*\n╰━━━━━━━━━━━╯\n\n`;
            for (const [i, item] of items.slice(0, 8).entries()) {
                out += `┏━ *${i + 1}.* ━┓\n┃ ${item.title}\n┃ ${item.summary?.slice(0, 80) || ''}...\n┃ ${fmtNewsDate(item.createdAt)}\n┗━━━━━━━━━┛\n\n`;
            }
            out += `◈ ${config.BOT_NAME}`;
            await send(ctx, out);
            await ctx.react('');
        } catch (e) {
            await ctx.react('');
            ctx.reply('Failed to fetch football news.');
        }
    },
});

// ── Numeric reply handler (picks up pending sessions) ──────────
const { addTrigger } = require('../../smurf/handlers/loader');

addTrigger({
    pattern: /^\s*([1-9])\s*$/,
    handler: async (ctx) => {
        const session = getPending(ctx.from);
        if (!session) return;

        const choice = ctx.body.trim();
        const p = config.BOT_PREFIX;

        // livescore: choices 1/2/3
        if (session.type === 'livescore') {
            const opts = {
                '1': { name: 'Live', emoji: '', filter: 'live' },
                '2': { name: 'Finished', emoji: '', filter: 'finished' },
                '3': { name: 'Upcoming', emoji: '', filter: 'upcoming' },
            };
            const opt = opts[choice];
            if (!opt) return ctx.reply('Reply with 1, 2, or 3.');
            pending.delete(ctx.from);
            await ctx.react(opt.emoji);
            try {
                const { data } = await axios.get(`${API}/livescore`, { timeout: 15000 });
                if (!data?.status || !data?.result?.games) return ctx.reply('No match data available.');
                const tz = config.TIME_ZONE || 'Africa/Nairobi';
                const now = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
                const games = Object.values(data.result.games).filter(g => {
                    const st = g.R?.st || '';
                    if (choice === '1') return ['1T','2T','HT'].includes(st);
                    if (choice === '2') return ['FT','Pen'].includes(st);
                    return ['','Pst','Canc'].includes(st);
                });
                if (!games.length) return ctx.reply(`${opt.emoji} No ${opt.name} matches found.`);
                let out = `╭━━━━━━━━━━━╮\n│ ${opt.emoji} *${opt.name}*\n├━━━━━━━━━━━┤\n│ ${now} (${tz})\n╰━━━━━━━━━━━╯\n\n`;
                for (const g of games.slice(0, 20)) {
                    const score = g.R?.r1 !== undefined ? `${g.R.r1} - ${g.R.r2}` : 'vs';
                    const stTxt = getStatusText(g.R?.st);
                    out += `${getStatusIcon(g.R?.st)} *${g.p1}* ${score} *${g.p2}*\n ${g.tm || ''}${stTxt ? ` (${stTxt})` : ''}\n\n`;
                }
                out += `_ ${Math.min(games.length, 20)} of ${games.length} matches_\n◈ ${config.BOT_NAME}`;
                await send(ctx, out);
            } catch { ctx.reply('Error fetching match data.'); }
            return;
        }

        // league-based: choices 1-8
        const league = LEAGUES[choice];
        if (!league) return ctx.reply('Reply with 1-8.');
        pending.delete(ctx.from);
        await ctx.react(league.emoji || '');

        try {
            let endpoint, out;

            if (session.type === 'standings') {
                const { data } = await axios.get(`${API}/${league.code}/standings`, { timeout: 15000 });
                if (!data?.status || !Array.isArray(data?.result?.standings)) return ctx.reply(`No standings for ${league.name}.`);
                out = `╭━━━━━━━━━━━╮\n│ ${league.emoji} *${league.name}*\n│ *STANDINGS*\n╰━━━━━━━━━━━╯\n\n`;
                for (const t of data.result.standings) {
                    const zone = t.position <= 4 ? '' : t.position <= 6 ? '' : t.position >= 18 ? '' : '';
                    const gd = t.goalDifference >= 0 ? `+${t.goalDifference}` : t.goalDifference;
                    out += `${zone}${t.position}. *${t.team.substring(0, 12)}*\nP:${t.played} W:${t.won} Pts:${t.points} GD:${gd}\n\n`;
                }
                out += `_UCL UEL Rel_\n◈ ${config.BOT_NAME}`;

            } else if (session.type === 'topscorers') {
                const { data } = await axios.get(`${API}/${league.code}/scorers`, { timeout: 15000 });
                if (!data?.status || !Array.isArray(data?.result?.topScorers)) return ctx.reply(`No scorer data for ${league.name}.`);
                out = `╭━━━━━━━━━━━╮\n│ ${league.emoji} *${league.name}*\n│ *TOP SCORERS*\n╰━━━━━━━━━━━╯\n\n`;
                for (const s of data.result.topScorers.slice(0, 15)) {
                    const medal = s.rank === 1 ? '' : s.rank === 2 ? '' : s.rank === 3 ? '' : '▪';
                    out += `${medal} *${s.rank}. ${s.player}*\n ${s.team}\n ${s.goals} goals | ${s.assists} assists\n\n`;
                }
                out += `◈ ${config.BOT_NAME}`;

            } else if (session.type === 'upcomingmatches') {
                const { data } = await axios.get(`${API}/${league.code}/upcomingmatches`, { timeout: 15000 });
                if (!data?.status || !Array.isArray(data?.result?.upcomingMatches)) return ctx.reply(`No fixtures for ${league.name}.`);
                out = `╭━━━━━━━━━━━╮\n│ ${league.emoji} *${league.name}*\n│ *FIXTURES*\n╰━━━━━━━━━━━╯\n\n`;
                for (const m of data.result.upcomingMatches.slice(0, 15)) {
                    out += `┏━ *MD ${m.matchday}* ━┓\n┃ ${m.homeTeam}\n┃ VS\n┃ ${m.awayTeam}\n┃ ${m.date}\n┗━━━━━━━━━┛\n\n`;
                }
                out += `◈ ${config.BOT_NAME}`;

            } else if (session.type === 'gamehistory') {
                const { data } = await axios.get(`${API}/${league.code}/gamehistory`, { timeout: 15000 });
                if (!data?.status || !Array.isArray(data?.result?.matches)) return ctx.reply(`No match history for ${league.name}.`);
                out = `╭━━━━━━━━━━━╮\n│ ${league.emoji} *${league.name}*\n│ *RECENT*\n╰━━━━━━━━━━━╯\n\n`;
                for (const m of data.result.matches.slice(0, 10)) {
                    out += `┏━━━━━━━━━┓\n┃ ${m.date || 'N/A'}\n┃ *${m.homeTeam}* ${m.homeScore || 0}-${m.awayScore || 0} *${m.awayTeam}*\n`;
                    if (m.events?.length) for (const e of m.events.slice(0, 3)) out += `┃ ${e.minute}' ${e.type === 'goal' ? '' : ''} ${e.player}\n`;
                    out += `┗━━━━━━━━━┛\n\n`;
                }
                out += `◈ ${config.BOT_NAME}`;
            }

            if (out) await send(ctx, out);
        } catch (e) {
            ctx.reply(`Error: ${e.message}`);
        }
    },
});

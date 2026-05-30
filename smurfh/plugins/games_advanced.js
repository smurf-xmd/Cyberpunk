'use strict';
// ╔══════════════════════════════════════════════════════════════╗
// SMURF-XMD — games_advanced.js
// TicTacToe · Word Chain · Dice (all with AI vs-mode)
// (ported from DarklordFarhan-XMD, adapted to smurf addCmd/ctx)
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd, addTrigger } = require('../../smurf/handlers/loader');
const axios = require('axios');
const config = require('../../smurf/config/settings');
const { channelCtx } = require('../../smurf/utils/gmdFunctions2');

const BOT_JID = 'AI_BOT@s.whatsapp.net';
const name = (jid) => jid === BOT_JID ? 'AI ' : jid.split('@')[0];

// ── send helper ────────────────────────────────────────────────
async function send(ctx, text, mentions = []) {
    return ctx.sock.sendMessage(
        ctx.from,
        { text, mentions, contextInfo: channelCtx() },
        { quoted: ctx.m }
    );
}

// ═══════════════════════════════════════════════════════════════
// TIC TAC TOE (in-memory)
// ═══════════════════════════════════════════════════════════════
// Map<chatJid, { player1, player2, board[9], currentTurn, status, isAiGame }>
const TTT = new Map();
const tttTimers = new Map();

function clearTttTimer(from) {
    if (tttTimers.has(from)) { clearTimeout(tttTimers.get(from)); tttTimers.delete(from); }
}

function renderBoard(board) {
    const cell = v => v === 'X' ? '' : v === 'O' ? '' : `${v}⃣`;
    return `${cell(board[0])} | ${cell(board[1])} | ${cell(board[2])}\n` +
           `——+——+——\n` +
           `${cell(board[3])} | ${cell(board[4])} | ${cell(board[5])}\n` +
           `——+——+——\n` +
           `${cell(board[6])} | ${cell(board[7])} | ${cell(board[8])}`;
}

function checkWin(board, mark) {
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    return wins.some(([a,b,c]) => board[a] === mark && board[b] === mark && board[c] === mark);
}
function isBoardFull(board) { return board.every(c => c === 'X' || c === 'O'); }

function aiBestMove(board) {
    const empty = board.map((c,i) => typeof c === 'number' ? i : -1).filter(i => i !== -1);
    if (!empty.length) return -1;
    for (const i of empty) { const b=[...board]; b[i]='O'; if(checkWin(b,'O')) return i; }
    for (const i of empty) { const b=[...board]; b[i]='X'; if(checkWin(b,'X')) return i; }
    if (empty.includes(4)) return 4;
    const corners = [0,2,6,8].filter(c => empty.includes(c));
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    return empty[Math.floor(Math.random() * empty.length)];
}

function setTttMoveTimer(from, sock, currentPlayer, other, board) {
    clearTttTimer(from);
    tttTimers.set(from, setTimeout(async () => {
        const g = TTT.get(from);
        if (!g || g.status !== 'active') return;
        TTT.delete(from);
        const sym = g.currentTurn === g.player1 ? '' : '';
        sock.sendMessage(from, {
            text: `*TIC TAC TOE — TIMEOUT*\n\n@${name(currentPlayer)} took too long!\nGame over. Use *${config.BOT_PREFIX}ttt* to start again.`,
            mentions: [currentPlayer], contextInfo: channelCtx(),
        });
    }, 30000));
}

addCmd({
    name: 'ttt', aliases: ['tictactoe','tttstart'],
    desc: 'Start a TicTacToe game — another player types join within 30s',
    category: 'games',
    handler: async (ctx) => {
        if (TTT.has(ctx.from)) return ctx.reply('Game already active! Use *' + config.BOT_PREFIX + 'tttend* first.');
        const board = [1,2,3,4,5,6,7,8,9];
        TTT.set(ctx.from, { player1: ctx.sender, player2: null, board, currentTurn: ctx.sender, status: 'waiting', isAiGame: false });
        await send(ctx,
            `*TIC TAC TOE*\n\n@${name(ctx.sender)} wants to play!\n*Type "join" within 30s to play!*\n\nPlayer 1: @${name(ctx.sender)} ()\nPlayer 2: Waiting...\n\n${renderBoard(board)}\n\n_Auto-cancels in 30s_`,
            [ctx.sender]
        );
        clearTttTimer(ctx.from);
        tttTimers.set(ctx.from, setTimeout(async () => {
            const g = TTT.get(ctx.from);
            if (g?.status === 'waiting') {
                TTT.delete(ctx.from);
                ctx.sock.sendMessage(ctx.from, { text: `No one joined. Game cancelled.`, contextInfo: channelCtx() });
            }
        }, 30000));
    },
});

addCmd({
    name: 'tttai', aliases: ['tttbot','tictactoeai','aitt'],
    desc: 'Play TicTacToe against AI',
    category: 'games',
    handler: async (ctx) => {
        if (TTT.has(ctx.from)) return ctx.reply('Game already active! Use *' + config.BOT_PREFIX + 'tttend* first.');
        const board = [1,2,3,4,5,6,7,8,9];
        TTT.set(ctx.from, { player1: ctx.sender, player2: BOT_JID, board, currentTurn: ctx.sender, status: 'active', isAiGame: true });
        await send(ctx,
            `*TIC TAC TOE vs AI*\n\nPlayer: @${name(ctx.sender)} ()\nAI: ()\n\n${renderBoard(board)}\n\n@${name(ctx.sender)}'s turn ()\n*Reply with a number (1-9) to move!*`,
            [ctx.sender]
        );
    },
});

addCmd({
    name: 'tttend', aliases: ['endttt','tttcancel','stopttt','cancelttt'],
    desc: 'End the current TicTacToe game',
    category: 'games',
    handler: async (ctx) => {
        const g = TTT.get(ctx.from);
        if (!g) return ctx.reply('No active TicTacToe game.');
        const isPlayer = g.player1 === ctx.sender || g.player2 === ctx.sender;
        if (!isPlayer && !ctx.isAdmin && !ctx.isOwner) return ctx.reply('Only players or admins can end the game!');
        clearTttTimer(ctx.from);
        TTT.delete(ctx.from);
        await send(ctx, `TicTacToe ended by @${name(ctx.sender)}!`, [ctx.sender]);
    },
});

addCmd({
    name: 'tttboard', aliases: ['board','tttshow'],
    desc: 'Show the current TicTacToe board',
    category: 'games',
    handler: async (ctx) => {
        const g = TTT.get(ctx.from);
        if (!g || g.status !== 'active') return ctx.reply('No active game! Start one with *' + config.BOT_PREFIX + 'ttt*');
        const sym = g.currentTurn === g.player1 ? '' : '';
        await send(ctx,
            `*TIC TAC TOE*\nP1: @${name(g.player1)} () vs P2: @${name(g.player2)} ()\n\n${renderBoard(g.board)}\n\n@${name(g.currentTurn)}'s turn (${sym})`,
            [g.player1, g.player2, g.currentTurn].filter(j => j !== BOT_JID)
        );
    },
});

// ── TTT move & join handled in trigger below ───────────────────

// ═══════════════════════════════════════════════════════════════
// WORD CHAIN GAME (in-memory)
// ═══════════════════════════════════════════════════════════════
// Map<chatJid, { players[], currentTurn, lastWord, usedWords[], scores{}, status, isAiGame }>
const WCG = new Map();
const wcgTimers = new Map();
const wcgJoinTimers = new Map();
const wordCache = new Map();

function clearWcgTimer(from) { if(wcgTimers.has(from)) { clearTimeout(wcgTimers.get(from)); wcgTimers.delete(from); } }
function clearWcgJoinTimer(from) { if(wcgJoinTimers.has(from)){ clearTimeout(wcgJoinTimers.get(from)); wcgJoinTimers.delete(from); } }

async function findAiWord(lastWord, usedWords) {
    const letter = lastWord?.slice(-1).toLowerCase() || null;
    try {
        const key = letter || 'all';
        let words;
        if (wordCache.has(key)) {
            words = wordCache.get(key);
        } else {
            const q = letter ? `sp=${letter}*&max=200` : 'max=200';
            const res = await axios.get(`https://api.datamuse.com/words?${q}`, { timeout: 5000 });
            words = res.data.map(w => w.word.toLowerCase()).filter(w => w.length >= 3 && /^[a-z]+$/.test(w));
            wordCache.set(key, words);
        }
        const avail = words.filter(w => !usedWords.includes(w));
        if (avail.length) return avail[Math.floor(Math.random() * Math.min(avail.length, 50))];
    } catch {}
    // fallback
    const fallback = ['apple','elephant','tiger','rabbit','table','eagle','earth','house','snake','engine',
                      'river','rocket','train','night','tower','radio','orange','energy','yellow','window'];
    const cands = letter ? fallback.filter(w => w[0] === letter && !usedWords.includes(w)) : fallback.filter(w => !usedWords.includes(w));
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
}

function fmtScores(scores) {
    return Object.entries(scores).sort((a,b) => b[1]-a[1])
        .map(([jid, pts], i) => `${i+1}. @${name(jid)}: ${pts} pts`).join('\n');
}

function setWcgMoveTimer(from, sock, currentPlayer, game) {
    clearWcgTimer(from);
    wcgTimers.set(from, setTimeout(async () => {
        const g = WCG.get(from);
        if (!g || g.status !== 'active') return;
        // eliminate timedout player
        g.players = g.players.filter(p => p !== currentPlayer);
        if (g.players.length < 2) {
            WCG.delete(from);
            sock.sendMessage(from, {
                text: ` @${name(currentPlayer)} timed out! Not enough players.\n\n*Final Scores:*\n${fmtScores(g.scores)}`,
                mentions: [currentPlayer].filter(j => j !== BOT_JID), contextInfo: channelCtx(),
            });
            return;
        }
        const nextIdx = g.players.indexOf(currentPlayer);
        const next = g.players[nextIdx % g.players.length] || g.players[0];
        g.currentTurn = next;
        WCG.set(from, g);
        sock.sendMessage(from, {
            text: ` @${name(currentPlayer)} timed out and was eliminated!\n @${name(next)}'s turn now!`,
            mentions: [currentPlayer, next].filter(j => j !== BOT_JID), contextInfo: channelCtx(),
        });
        if (next === BOT_JID) {
            setTimeout(() => doAiWcgMove(from, sock, g), 1500);
        } else {
            setWcgMoveTimer(from, sock, next, g);
        }
    }, 30000));
}

async function doAiWcgMove(from, sock, game) {
    const aiWord = await findAiWord(game.lastWord, game.usedWords);
    if (!aiWord) {
        WCG.delete(from);
        return sock.sendMessage(from, {
            text: `*YOU WIN!*\nAI couldn't find a word!\n\n*Final:*\n${fmtScores(game.scores)}`,
            contextInfo: channelCtx(),
        });
    }
    game.usedWords.push(aiWord);
    game.scores[BOT_JID] = (game.scores[BOT_JID] || 0) + aiWord.length;
    game.lastWord = aiWord;
    const nextPlayer = game.players.find(p => p !== BOT_JID) || game.players[0];
    game.currentTurn = nextPlayer;
    WCG.set(from, game);
    sock.sendMessage(from, {
        text: `AI says: *${aiWord}* (+${aiWord.length} pts)\n\n @${name(nextPlayer)}'s turn\nNext word starts with: *${aiWord.slice(-1).toUpperCase()}*\n\n 30s`,
        mentions: [nextPlayer].filter(j => j !== BOT_JID), contextInfo: channelCtx(),
    });
    setWcgMoveTimer(from, sock, nextPlayer, game);
}

addCmd({
    name: 'wcg', aliases: ['wordchain','wcgstart','wordgame'],
    desc: 'Start a Word Chain Game (multiplayer)',
    category: 'games',
    handler: async (ctx) => {
        if (WCG.has(ctx.from)) return ctx.reply('Word Chain game already running! Use *' + config.BOT_PREFIX + 'wcgend* first.');
        WCG.set(ctx.from, {
            players: [ctx.sender], currentTurn: null, lastWord: null,
            usedWords: [], scores: { [ctx.sender]: 0 }, status: 'waiting', isAiGame: false,
        });
        await send(ctx,
            `*WORD CHAIN GAME*\n\n@${name(ctx.sender)} wants to play!\n\n*Rules:*\n• Words must start with the last letter of the previous word\n• No repeating words · Min 2 letters · 30s per turn\n\n*Type .wcgjoin to join!*\n*Host types .wcgbegin when ready*\n\n_30s to join_`,
            [ctx.sender]
        );
        clearWcgJoinTimer(ctx.from);
        wcgJoinTimers.set(ctx.from, setTimeout(async () => {
            const g = WCG.get(ctx.from);
            if (!g || g.status !== 'waiting') return;
            if (g.players.length < 2) {
                WCG.delete(ctx.from);
                return ctx.sock.sendMessage(ctx.from, { text: 'No one joined. Game cancelled.', contextInfo: channelCtx() });
            }
            // auto-start
            g.status = 'active';
            g.currentTurn = g.players[0];
            WCG.set(ctx.from, g);
            const pList = g.players.map((p,i) => `${i+1}. @${name(p)}`).join('\n');
            ctx.sock.sendMessage(ctx.from, {
                text: `Time's up — game starting!\n\n*WORD CHAIN STARTED!*\n\n*Players:*\n${pList}\n\n @${name(g.currentTurn)}'s turn! Say any word to begin!\n\n 30s per turn`,
                mentions: g.players, contextInfo: channelCtx(),
            });
            setWcgMoveTimer(ctx.from, ctx.sock, g.currentTurn, g);
        }, 30000));
    },
});

addCmd({
    name: 'wcgai', aliases: ['wcgbot','wordchainai','aiwcg'],
    desc: 'Play Word Chain Game against AI',
    category: 'games',
    handler: async (ctx) => {
        if (WCG.has(ctx.from)) return ctx.reply('Word Chain game already running! Use *' + config.BOT_PREFIX + 'wcgend* first.');
        WCG.set(ctx.from, {
            players: [ctx.sender, BOT_JID], currentTurn: ctx.sender, lastWord: null,
            usedWords: [], scores: { [ctx.sender]: 0, [BOT_JID]: 0 }, status: 'active', isAiGame: true,
        });
        await send(ctx,
            `*WORD CHAIN vs AI*\n\nRules: start each word with the last letter of the previous\n\n @${name(ctx.sender)} vs AI\n\n@${name(ctx.sender)}'s turn — say any word!\n\n 30s per turn`,
            [ctx.sender]
        );
        const g = WCG.get(ctx.from);
        setWcgMoveTimer(ctx.from, ctx.sock, ctx.sender, g);
    },
});

addCmd({
    name: 'wcgjoin', aliases: ['joinwcg','joinwordchain'],
    desc: 'Join a Word Chain Game',
    category: 'games',
    handler: async (ctx) => {
        const g = WCG.get(ctx.from);
        if (!g || g.status !== 'waiting') return ctx.reply('No game waiting! Start one with *' + config.BOT_PREFIX + 'wcg*');
        if (g.players.includes(ctx.sender)) return ctx.reply('You already joined!');
        g.players.push(ctx.sender);
        g.scores[ctx.sender] = 0;
        WCG.set(ctx.from, g);
        const pList = g.players.map((p,i) => `${i+1}. @${name(p)}`).join('\n');
        await send(ctx, ` @${name(ctx.sender)} joined!\n\n*Players (${g.players.length}):*\n${pList}\n\n*More can join with .wcgjoin*\n*Host types .wcgbegin when ready*`, g.players);
    },
});

addCmd({
    name: 'wcgbegin', aliases: ['startwcg','wcggo'],
    desc: 'Start the Word Chain Game (host only)',
    category: 'games',
    handler: async (ctx) => {
        const g = WCG.get(ctx.from);
        if (!g || g.status !== 'waiting') return ctx.reply('No game waiting to start!');
        if (g.players[0] !== ctx.sender) return ctx.reply('Only the host can start the game!');
        if (g.players.length < 2) return ctx.reply('Need at least 2 players to start!');
        clearWcgJoinTimer(ctx.from);
        g.status = 'active';
        g.currentTurn = g.players[0];
        WCG.set(ctx.from, g);
        const pList = g.players.map((p,i) => `${i+1}. @${name(p)}`).join('\n');
        await send(ctx, `*WORD CHAIN STARTED!*\n\n*Players:*\n${pList}\n\n @${name(g.currentTurn)}'s turn! Say any word!\n\n 30s per turn`, g.players);
        setWcgMoveTimer(ctx.from, ctx.sock, g.currentTurn, g);
    },
});

addCmd({
    name: 'wcgend', aliases: ['endwcg','wcgstop','stopwcg','wcgcancel'],
    desc: 'End the Word Chain Game',
    category: 'games',
    handler: async (ctx) => {
        const g = WCG.get(ctx.from);
        if (!g) return ctx.reply('No Word Chain game to end!');
        const isPlayer = g.players.includes(ctx.sender);
        if (!isPlayer && !ctx.isAdmin && !ctx.isOwner) return ctx.reply('Only players or admins can end the game!');
        clearWcgTimer(ctx.from); clearWcgJoinTimer(ctx.from);
        const scores = g.scores;
        WCG.delete(ctx.from);
        let text = `Word Chain ended by @${name(ctx.sender)}!`;
        if (Object.keys(scores).length) text += `\n\n*Final Scores:*\n${fmtScores(scores)}`;
        await send(ctx, text, [ctx.sender].filter(j => j !== BOT_JID));
    },
});

addCmd({
    name: 'wcgscores', aliases: ['wcgscore','wordchainscore'],
    desc: 'Show Word Chain scores',
    category: 'games',
    handler: async (ctx) => {
        const g = WCG.get(ctx.from);
        if (!g || g.status !== 'active') return ctx.reply('No active Word Chain game!');
        await send(ctx,
            `*WORD CHAIN SCORES*\n\n${fmtScores(g.scores)}\n\nWords used: ${g.usedWords.length}\nTurn: @${name(g.currentTurn)}${g.lastWord ? `\nLast: *${g.lastWord}*` : ''}`,
            g.players.filter(j => j !== BOT_JID)
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// DICE GAME (in-memory)
// ═══════════════════════════════════════════════════════════════
// Map<chatJid, { player1, player2, rounds, currentRound, p1Score, p2Score, p1Roll, p2Roll, currentTurn, status, isAiGame }>
const DICE = new Map();
const diceTimers = new Map();
const diceJoinTimers = new Map();

function clearDiceTimer(from) { if(diceTimers.has(from)) { clearTimeout(diceTimers.get(from)); diceTimers.delete(from); } }
function clearDiceJoinTimer(from) { if(diceJoinTimers.has(from)) { clearTimeout(diceJoinTimers.get(from)); diceJoinTimers.delete(from); } }

const DICE_EMOJIS = ['','','','','',''];
const diceEmoji = v => DICE_EMOJIS[v - 1] || '';
const rollDie = () => Math.floor(Math.random() * 6) + 1;

function setDiceMoveTimer(from, sock, currentPlayer, game) {
    clearDiceTimer(from);
    diceTimers.set(from, setTimeout(async () => {
        const g = DICE.get(from);
        if (!g) return;
        DICE.delete(from);
        sock.sendMessage(from, {
            text: ` @${name(currentPlayer)} took too long! Game cancelled.`,
            mentions: [currentPlayer].filter(j => j !== BOT_JID), contextInfo: channelCtx(),
        });
    }, 30000));
}

addCmd({
    name: 'dice', aliases: ['dicestart','dicegame','rolldice'],
    desc: 'Start a Dice Game',
    usage: 'dice [rounds]',
    category: 'games',
    handler: async (ctx) => {
        if (DICE.has(ctx.from)) return ctx.reply('Dice game already active! Use *' + config.BOT_PREFIX + 'diceend* first.');
        const rounds = parseInt(ctx.args[0]) || 3;
        DICE.set(ctx.from, { player1: ctx.sender, player2: null, rounds, currentRound: 1, p1Score: 0, p2Score: 0, p1Roll: null, p2Roll: null, currentTurn: ctx.sender, status: 'waiting', isAiGame: false });
        await send(ctx,
            `*DICE GAME*\n\n@${name(ctx.sender)} wants to play!\n\n*Rules:*\n• ${rounds} rounds\n• Each player rolls once per round\n• Highest roll wins the round\n\n*Type .dicejoin to play!*\n 30s to join`,
            [ctx.sender]
        );
        clearDiceJoinTimer(ctx.from);
        diceJoinTimers.set(ctx.from, setTimeout(async () => {
            const g = DICE.get(ctx.from);
            if (g?.status === 'waiting') {
                DICE.delete(ctx.from);
                ctx.sock.sendMessage(ctx.from, { text: 'No one joined. Dice game cancelled.', contextInfo: channelCtx() });
            }
        }, 30000));
    },
});

addCmd({
    name: 'diceai', aliases: ['dicebot','aidice','rolldiceai'],
    desc: 'Play Dice against AI',
    usage: 'diceai [rounds]',
    category: 'games',
    handler: async (ctx) => {
        if (DICE.has(ctx.from)) return ctx.reply('Dice game already active! Use *' + config.BOT_PREFIX + 'diceend* first.');
        const rounds = Math.min(Math.max(parseInt(ctx.args[0]) || 3, 1), 10);
        DICE.set(ctx.from, { player1: ctx.sender, player2: BOT_JID, rounds, currentRound: 1, p1Score: 0, p2Score: 0, p1Roll: null, p2Roll: null, currentTurn: ctx.sender, status: 'active', isAiGame: true });
        await send(ctx,
            `*DICE GAME vs AI*\n\n @${name(ctx.sender)} vs AI\nBest of ${rounds} rounds\n\n*Round 1*\n@${name(ctx.sender)}, type *.roll* to roll!\n\n 30s per turn`,
            [ctx.sender]
        );
        setDiceMoveTimer(ctx.from, ctx.sock, ctx.sender, DICE.get(ctx.from));
    },
});

addCmd({
    name: 'dicejoin', aliases: ['joindice'],
    desc: 'Join a waiting Dice Game',
    category: 'games',
    handler: async (ctx) => {
        const g = DICE.get(ctx.from);
        if (!g || g.status !== 'waiting') return ctx.reply('No game waiting! Start one with *' + config.BOT_PREFIX + 'dice*');
        if (g.player1 === ctx.sender) return ctx.reply('You can\'t play against yourself!');
        clearDiceJoinTimer(ctx.from);
        g.player2 = ctx.sender;
        g.status = 'active';
        DICE.set(ctx.from, g);
        await send(ctx,
            `*DICE GAME STARTED!*\n\n @${name(g.player1)} vs @${name(g.player2)}\nBest of ${g.rounds} rounds\n\n*Round 1*\n@${name(g.player1)}, type *.roll*!\n\n 30s per turn`,
            [g.player1, g.player2]
        );
        setDiceMoveTimer(ctx.from, ctx.sock, g.player1, g);
    },
});

addCmd({
    name: 'diceend', aliases: ['enddice','dicestop','stopdice','dicecancel'],
    desc: 'End the Dice Game',
    category: 'games',
    handler: async (ctx) => {
        const g = DICE.get(ctx.from);
        if (!g) return ctx.reply('No Dice game to end!');
        const isPlayer = g.player1 === ctx.sender || g.player2 === ctx.sender;
        if (!isPlayer && !ctx.isAdmin && !ctx.isOwner) return ctx.reply('Only players or admins can end the game!');
        clearDiceTimer(ctx.from); clearDiceJoinTimer(ctx.from);
        DICE.delete(ctx.from);
        await send(ctx, `Dice game ended by @${name(ctx.sender)}!`, [ctx.sender].filter(j => j !== BOT_JID));
    },
});

// ═══════════════════════════════════════════════════════════════
// GAMES MENU
// ═══════════════════════════════════════════════════════════════
addCmd({
    name: 'gamesplus', aliases: ['advancedgames','darkgames'],
    desc: 'Show advanced games menu (TicTacToe, Word Chain, Dice)',
    category: 'games',
    handler: async (ctx) => {
        const p = config.BOT_PREFIX;
        await send(ctx,
            `*ADVANCED GAMES*\n\n` +
            `╭━━━━━━━━━━━━━━━━━╮\n│ *TIC TAC TOE*\n├━━━━━━━━━━━━━━━━━┤\n│ ${p}ttt — vs player\n│ ${p}tttai — vs AI \n│ ${p}tttend — end game\n│ _Type 1-9 to move_\n╰━━━━━━━━━━━━━━━━━╯\n\n` +
            `╭━━━━━━━━━━━━━━━━━╮\n│ *WORD CHAIN*\n├━━━━━━━━━━━━━━━━━┤\n│ ${p}wcg — multiplayer\n│ ${p}wcgai — vs AI \n│ ${p}wcgjoin — join\n│ ${p}wcgbegin — start\n│ ${p}wcgend — end\n│ ${p}wcgscores — scores\n╰━━━━━━━━━━━━━━━━━╯\n\n` +
            `╭━━━━━━━━━━━━━━━━━╮\n│ *DICE GAME*\n├━━━━━━━━━━━━━━━━━┤\n│ ${p}dice [rounds]\n│ ${p}diceai [rounds] — vs AI\n│ ${p}dicejoin — join\n│ ${p}diceend — end\n│ _Type "roll" to roll_\n╰━━━━━━━━━━━━━━━━━╯\n\n` +
            `_ AI modes let you play solo!_\n◈ ${config.BOT_NAME}`
        );
    },
});

// ═══════════════════════════════════════════════════════════════
// UNIVERSAL TRIGGER — handles: join · 1-9 (ttt) · word (wcg) · roll
// ═══════════════════════════════════════════════════════════════
addTrigger({
    pattern: /^(join|roll|\d|[a-z]{2,30})$/i,
    handler: async (ctx) => {
        const body = ctx.body?.trim().toLowerCase();
        if (!body) return;

        // ── join ─────────────────────────────────────────────
        if (body === 'join') {
            // TTT join
            const tttG = TTT.get(ctx.from);
            if (tttG?.status === 'waiting') {
                if (tttG.player1 === ctx.sender) return ctx.reply("You can't play against yourself!");
                clearTttTimer(ctx.from);
                tttG.player2 = ctx.sender;
                tttG.status = 'active';
                TTT.set(ctx.from, tttG);
                await send(ctx,
                    `*TIC TAC TOE — STARTED!*\n\nP1: @${name(tttG.player1)} ()\nP2: @${name(tttG.player2)} ()\n\n${renderBoard(tttG.board)}\n\n@${name(tttG.currentTurn)}'s turn ()\n*Reply with 1-9 to move!*\n 30s per move`,
                    [tttG.player1, tttG.player2, tttG.currentTurn]
                );
                setTttMoveTimer(ctx.from, ctx.sock, tttG.currentTurn, tttG.player2, tttG.player1);
                return;
            }
            // WCG join — handled by .wcgjoin command above
            return;
        }

        // ── roll ─────────────────────────────────────────────
        if (body === 'roll') {
            const g = DICE.get(ctx.from);
            if (!g || g.status !== 'active') return;
            if (g.currentTurn !== ctx.sender) return ctx.reply("It's not your turn!");
            clearDiceTimer(ctx.from);

            const roll = rollDie();
            const isP1 = g.player1 === ctx.sender;
            if (isP1) g.p1Roll = roll; else g.p2Roll = roll;

            // if both rolled this round
            if (g.p1Roll !== null && g.p2Roll !== null) {
                let roundWinner;
                if (g.p1Roll > g.p2Roll) { g.p1Score++; roundWinner = g.player1; }
                else if (g.p2Roll > g.p1Roll) { g.p2Score++; roundWinner = g.player2; }

                let txt = `*Round ${g.currentRound} Results*\n\n${diceEmoji(g.p1Roll)} @${name(g.player1)}: ${g.p1Roll}\n${diceEmoji(g.p2Roll)} ${g.player2 === BOT_JID ? 'AI' : '@' + name(g.player2)}: ${g.p2Roll}\n\n`;
                txt += roundWinner ? ` ${g.player2 === BOT_JID && roundWinner === BOT_JID ? 'AI' : '@' + name(roundWinner)} wins this round!\n` : `Tie!\n`;
                txt += `\n*Score:* ${g.p1Score} - ${g.p2Score}`;

                if (g.currentRound >= g.rounds) {
                    txt += `\n\n*GAME OVER!*\n`;
                    if (g.p1Score > g.p2Score) txt += `*WINNER:* @${name(g.player1)}!`;
                    else if (g.p2Score > g.p1Score) txt += g.player2 === BOT_JID ? `*AI WINS!*` : `*WINNER:* @${name(g.player2)}!`;
                    else txt += `*TIE!*`;
                    DICE.delete(ctx.from);
                    return send(ctx, txt, [g.player1, g.player2].filter(j => j !== BOT_JID));
                }

                // next round
                g.currentRound++; g.p1Roll = null; g.p2Roll = null;
                g.currentTurn = g.player1;
                DICE.set(ctx.from, g);
                txt += `\n\n*Round ${g.currentRound}*\n@${name(g.player1)}, type *.roll*!`;
                await send(ctx, txt, [g.player1, g.player2].filter(j => j !== BOT_JID));
                setDiceMoveTimer(ctx.from, ctx.sock, g.player1, g);
            } else {
                // first roller this round — wait for other
                const waiting = isP1 ? g.player2 : g.player1;
                g.currentTurn = waiting;
                DICE.set(ctx.from, g);

                if (g.isAiGame && waiting === BOT_JID) {
                    await send(ctx, ` @${name(ctx.sender)} rolled: ${diceEmoji(roll)} *${roll}*\n\nAI is rolling...`, [ctx.sender]);
                    await new Promise(r => setTimeout(r, 1000));
                    // AI roll
                    const aiRoll = rollDie();
                    g.p2Roll = aiRoll;
                    let roundWinner;
                    if (g.p1Roll > aiRoll) { g.p1Score++; roundWinner = g.player1; }
                    else if (aiRoll > g.p1Roll) { g.p2Score++; roundWinner = BOT_JID; }
                    let txt2 = `*Round ${g.currentRound} Results*\n\n${diceEmoji(g.p1Roll)} @${name(g.player1)}: ${g.p1Roll}\n${diceEmoji(aiRoll)} AI: ${aiRoll}\n\n`;
                    txt2 += roundWinner === BOT_JID ? `AI wins this round!\n` : roundWinner ? ` @${name(roundWinner)} wins!\n` : `Tie!\n`;
                    txt2 += `\n*Score:* ${g.p1Score} - ${g.p2Score}`;
                    if (g.currentRound >= g.rounds) {
                        txt2 += `\n\n*GAME OVER!*\n`;
                        if (g.p1Score > g.p2Score) txt2 += `*YOU WIN!*`;
                        else if (g.p2Score > g.p1Score) txt2 += `*AI WINS!*`;
                        else txt2 += `*TIE!*`;
                        DICE.delete(ctx.from);
                    } else {
                        g.currentRound++; g.p1Roll = null; g.p2Roll = null;
                        g.currentTurn = g.player1;
                        DICE.set(ctx.from, g);
                        txt2 += `\n\n*Round ${g.currentRound}*\n@${name(g.player1)}, type *.roll*!`;
                        setDiceMoveTimer(ctx.from, ctx.sock, g.player1, g);
                    }
                    return send(ctx, txt2, [g.player1]);
                }

                await send(ctx, ` @${name(ctx.sender)} rolled: ${diceEmoji(roll)} *${roll}*\n\n@${name(waiting)}, type *.roll*!`, [ctx.sender, waiting].filter(j => j !== BOT_JID));
                setDiceMoveTimer(ctx.from, ctx.sock, waiting, g);
            }
            return;
        }

        // ── numeric 1-9 (TTT move) ────────────────────────────
        const numMatch = body.match(/^([1-9])$/);
        if (numMatch) {
            const g = TTT.get(ctx.from);
            if (!g || g.status !== 'active') return;
            if (g.currentTurn !== ctx.sender) return ctx.reply("It's not your turn!");

            const pos = parseInt(numMatch[1]) - 1;
            if (g.board[pos] === 'X' || g.board[pos] === 'O') return ctx.reply('That cell is already taken! Pick another.');

            clearTttTimer(ctx.from);
            const mark = ctx.sender === g.player1 ? 'X' : 'O';
            g.board[pos] = mark;

            if (checkWin(g.board, mark)) {
                TTT.delete(ctx.from);
                return send(ctx,
                    `*TIC TAC TOE*\n\n${renderBoard(g.board)}\n\n @${name(ctx.sender)} wins!`,
                    [ctx.sender].filter(j => j !== BOT_JID)
                );
            }
            if (isBoardFull(g.board)) {
                TTT.delete(ctx.from);
                return send(ctx, `*TIC TAC TOE*\n\n${renderBoard(g.board)}\n\nIt's a draw!`);
            }

            // switch turn
            g.currentTurn = g.currentTurn === g.player1 ? g.player2 : g.player1;
            TTT.set(ctx.from, g);

            if (g.isAiGame && g.currentTurn === BOT_JID) {
                await send(ctx, `${renderBoard(g.board)}\n\nAI is thinking...`);
                await new Promise(r => setTimeout(r, 800));
                const aiPos = aiBestMove(g.board);
                if (aiPos === -1) { TTT.delete(ctx.from); return send(ctx, `Draw!`); }
                g.board[aiPos] = 'O';
                if (checkWin(g.board, 'O')) {
                    TTT.delete(ctx.from);
                    return send(ctx, `${renderBoard(g.board)}\n\nAI wins! Better luck next time!`);
                }
                if (isBoardFull(g.board)) { TTT.delete(ctx.from); return send(ctx, `Draw!`); }
                g.currentTurn = g.player1;
                TTT.set(ctx.from, g);
                await send(ctx,
                    `${renderBoard(g.board)}\n\n@${name(g.player1)}'s turn ()\n*Reply 1-9 to move!*`,
                    [g.player1]
                );
                return;
            }

            const sym = g.currentTurn === g.player1 ? '' : '';
            await send(ctx,
                `${renderBoard(g.board)}\n\n@${name(g.currentTurn)}'s turn (${sym})\n*Reply 1-9 to move!*\n 30s`,
                [g.currentTurn].filter(j => j !== BOT_JID)
            );
            setTttMoveTimer(ctx.from, ctx.sock, g.currentTurn, g.player2, g.player1);
            return;
        }

        // ── word (WCG word submission) ─────────────────────────
        const wg = WCG.get(ctx.from);
        if (!wg || wg.status !== 'active') return;
        if (wg.currentTurn !== ctx.sender) return; // silently ignore

        const word = body.replace(/\s+.*/,''); // first word only
        if (word.length < 2) return ctx.reply('Word must be at least 2 letters!');
        if (wg.usedWords.includes(word)) return ctx.reply(`*${word}* was already used!`);
        if (wg.lastWord) {
            const expected = wg.lastWord.slice(-1).toLowerCase();
            if (word[0] !== expected) return ctx.reply(`Word must start with *${expected.toUpperCase()}*!`);
        }

        clearWcgTimer(ctx.from);
        wg.usedWords.push(word);
        wg.scores[ctx.sender] = (wg.scores[ctx.sender] || 0) + word.length;
        wg.lastWord = word;

        const nextIdx = (wg.players.indexOf(ctx.sender) + 1) % wg.players.length;
        wg.currentTurn = wg.players[nextIdx];
        WCG.set(ctx.from, wg);

        if (wg.isAiGame && wg.currentTurn === BOT_JID) {
            await send(ctx, `*${word}* (+${word.length} pts)\n\nAI is thinking...`);
            await doAiWcgMove(ctx.from, ctx.sock, wg);
            return;
        }

        await send(ctx,
            `*${word}* (+${word.length} pts)\n\n @${name(wg.currentTurn)}'s turn\nNext word starts with: *${word.slice(-1).toUpperCase()}*\n\nWords: ${wg.usedWords.length} | 30s`,
            [wg.currentTurn].filter(j => j !== BOT_JID)
        );
        setWcgMoveTimer(ctx.from, ctx.sock, wg.currentTurn, wg);
    },
});

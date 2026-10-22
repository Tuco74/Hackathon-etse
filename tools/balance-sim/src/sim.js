// Headless balance simulation: 1000 matches, 4 bots.
import { startMatch, setReady, startGame, placeBid, tick, resolveAuction, reveal, afterReveal, placeRouletteBet, spinRoulette } from "../../../packages/game-core/dist/index.js";

function rngFactory(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

const BOTS = [
  { name: "conservador", bidRatio: 0.6 },
  { name: "agresivo", bidRatio: 1.1 },
  { name: "calculador", bidRatio: 0.85 },
  { name: "aleatorio", bidRatio: Math.random() },
];

function runOne(seed) {
  const rng = rngFactory(seed);
  const nowFn = () => 1000;
  const players = BOTS.map((b, i) => ({ id: `p${i}`, nickname: b.name }));
  let s = startMatch(players, "SIM", rng, nowFn);
  for (const p of s.players) s = setReady(s, p.id, true);
  s = startGame(s, rng, nowFn);
  // play until game over, with safety counter
  let steps = 0;
  while (!s.finished && steps < 10000) {
    steps++;
    if (s.phase === "AUCTION") {
      // each bot may bid
      for (let i = 0; i < BOTS.length; i++) {
        const pid = `p${i}`;
        const player = s.players.find(p => p.id === pid);
        if (!player || !player.connected) continue;
        const a = s.currentRound.auction;
        if (!a || a.highBidderId === pid) continue;
        const minNext = a.highBidderId === null ? 10 : a.currentBid + 25;
        // estimate value: bots bid based on ratio * (mid band avg)
        const est = 600 * BOTS[i].bidRatio;
        if (est >= minNext && player.money >= minNext) {
          const amount = Math.min(minNext, player.money);
          const r = placeBid(s, pid, amount, nowFn);
          if (r.ok) s = r.state;
        }
      }
      // tick timer expiry
      s = tick(s, () => nowFn() + 20000, rng);
      if (s.phase === "REVEAL") {
        s = reveal(s);
        s = afterReveal(s, rng, nowFn);
      }
    } else if (s.phase === "REVEAL") {
      s = reveal(s);
      s = afterReveal(s, rng, nowFn);
    } else if (s.phase === "ROULETTE") {
      // optional bets: 50% bet small
      for (let i = 0; i < BOTS.length; i++) {
        if (rng() < 0.5) {
          const pid = `p${i}`;
          const player = s.players.find(p => p.id === pid);
          if (player && player.money >= 10) {
            const amt = Math.min(10, player.money);
            const r = placeRouletteBet(s, pid, rng() < 0.5 ? "red" : "black", amt);
            if (r.ok) s = r.state;
          }
        }
      }
      s = spinRoulette(s, rng, nowFn);
      // advance handled inside
    } else if (s.phase === "ROUND_INTRO") {
      // startRound already called by afterReveal/startGame; if stuck, break
      break;
    } else if (s.phase === "GAME_OVER") {
      break;
    } else {
      break;
    }
  }
  return s;
}

const N = 1000;
let finals = [];
let profitable = 0;
let totalLots = 0;
let bankrupt = 0;
let durations = [];
for (let k = 0; k < N; k++) {
  const s = runOne(12345 + k);
  const winnerMoney = Math.max(...s.players.map(p => p.money));
  finals.push(winnerMoney);
  for (const h of s.history) {
    totalLots++;
    if (h.winnerId && h.total > h.winningBid) profitable++;
    if (h.deserted) {}
  }
  for (const p of s.players) if (p.money <= 0) bankrupt++;
  durations.push(s.round);
}
finals.sort((a,b)=>a-b);
const median = finals[Math.floor(finals.length/2)];
console.log(JSON.stringify({
  matches: N,
  medianFinalMoney: median,
  pctProfitableLots: totalLots ? (profitable/totalLots*100).toFixed(1) : 0,
  bankruptCount: bankrupt,
  avgRounds: (durations.reduce((a,b)=>a+b,0)/N).toFixed(2),
}, null, 2));
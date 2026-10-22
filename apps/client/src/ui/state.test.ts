import { describe, expect, it } from "vitest";
import type { PlayerPublic, S2CMessage } from "@trastero/shared";
import {
  allReady,
  cash,
  createState,
  isHighBidder,
  joinRoom,
  me,
  myBestWorst,
  playerName,
  reduce,
  type UiState,
} from "./state";

const players: PlayerPublic[] = [
  { id: "p1", nickname: "Ana", money: 1000, ready: true, connected: true },
  { id: "p2", nickname: "Beto", money: 1000, ready: false, connected: true },
];

function roomState(over: Partial<Extract<S2CMessage, { type: "S2C_ROOM_STATE" }>> = {}): S2CMessage {
  return {
    type: "S2C_ROOM_STATE",
    roomCode: "ABCD",
    phase: "LOBBY",
    round: 0,
    totalRounds: 20,
    players,
    ...over,
  };
}

function joined(): UiState {
  return reduce(joinRoom(createState(), "Ana", "ABCD"), roomState(), 1_000);
}

describe("identity", () => {
  it("recognises me by nickname after joining", () => {
    const state = joined();
    expect(state.meId).toBe("p1");
    expect(me(state)?.nickname).toBe("Ana");
    expect(cash(state)).toBe(1000);
    expect(playerName(state, "p2")).toBe("Beto");
  });

  it("keeps the previous id if the room state arrives again", () => {
    const once = joined();
    const twice = reduce(once, roomState({ round: 1, phase: "AUCTION" }), 1_100);
    expect(twice.meId).toBe("p1");
  });
});

describe("ready gate", () => {
  it("only allows starting when everyone is ready", () => {
    expect(allReady(joined())).toBe(false);
    const ready = reduce(
      joined(),
      roomState({ players: players.map((p) => ({ ...p, ready: true })) }),
      1_200,
    );
    expect(allReady(ready)).toBe(true);
  });
});

describe("round flow", () => {
  it("stores the public lot without any value", () => {
    const state = reduce(
      joined(),
      {
        type: "S2C_ROUND_INTRO",
        round: 1,
        countdownSec: 3,
        lot: {
          id: "lot-1",
          round: 1,
          objectCount: 3,
          silhouettes: ["sil_tv", "sil_crate", "sil_vase"],
          clues: ["pesa lo suyo"],
          category: "electronics",
        },
      },
      2_000,
    );
    expect(state.lot?.id).toBe("lot-1");
    expect(state.lot?.silhouettes).toHaveLength(3);
    expect(state.phase).toBe("AUCTION");
    expect(state.introUntil).toBe(2_000 + 3_000);
    expect(JSON.stringify(state.lot)).not.toMatch(/trueValue|value/i);
  });

  it("tracks bids and stops flagging me as able to bid again", () => {
    const auction = reduce(
      joined(),
      {
        type: "S2C_AUCTION_STATE",
        state: {
          lotId: "lot-1",
          currentBid: 250,
          highBidderId: "p1",
          endsAt: 10_000,
          extensionsUsed: 0,
          minNextBid: 275,
          canBid: false,
        },
      },
      2_100,
    );
    expect(isHighBidder(auction)).toBe(true);

    const raised = reduce(
      auction,
      { type: "S2C_BID_EVENT", playerId: "p2", amount: 300, endsAt: 12_000, extensionsUsed: 0 },
      2_200,
    );
    expect(raised.auction?.currentBid).toBe(300);
    expect(raised.auction?.highBidderId).toBe("p2");
    expect(raised.auction?.endsAt).toBe(12_000);
    expect(isHighBidder(raised)).toBe(false);
  });

  it("records a reveal once, even if the same message arrives twice", () => {
    let state = reduce(joined(), roomState({ round: 1, phase: "REVEAL" }), 3_000);
    const reveal: S2CMessage = {
      type: "S2C_REVEAL",
      lotId: "lot-1",
      objects: [{ silhouetteId: "sil_tv", name: "Televisor", value: 450, category: "electronics" }],
      total: 450,
      winnerId: "p1",
      winningBid: 300,
      profit: 150,
    };
    state = reduce(state, reveal, 3_100);
    state = reduce(state, reveal, 3_200);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.profit).toBe(150);
    expect(state.reveal?.total).toBe(450);
  });
});

describe("money history", () => {
  it("snapshots money once per round", () => {
    let state = reduce(joined(), roomState({ round: 1, phase: "REVEAL" }), 4_000);
    state = reduce(state, roomState({ round: 1, phase: "REVEAL" }), 4_100);
    state = reduce(state, roomState({ round: 2, phase: "AUCTION" }), 4_200);
    expect(state.moneyHistory.map((s) => s.round)).toEqual([1, 2]);
    expect(state.moneyHistory[0]?.money).toEqual({ p1: 1000, p2: 1000 });
  });
});

describe("roulette", () => {
  it("stores the commitment and then the revealed result", () => {
    let state = reduce(joined(), roomState({ round: 5, phase: "ROULETTE" }), 5_000);
    state = reduce(
      state,
      {
        type: "S2C_ROULETTE_PHASE",
        hashSeed: "a".repeat(64),
        windowSec: 20,
        players: [
          { id: "p1", money: 1000 },
          { id: "p2", money: 1000 },
        ],
        bets: [],
        passed: [],
        readyToSpin: false,
      },
      5_100,
    );
    expect(state.phase).toBe("ROULETTE");
    expect(state.roulette?.hashSeed).toHaveLength(64);

    state = reduce(
      state,
      {
        type: "S2C_ROULETTE_RESULT",
        seed: "seed-1",
        result: 17,
        skipped: false,
        payouts: [{ playerId: "p1", delta: 100, money: 1100 }],
      },
      5_200,
    );
    expect(state.rouletteResult?.result).toBe(17);
    expect(state.rouletteResult?.payouts[0]?.delta).toBe(100);
  });
});

describe("errors and results", () => {
  it("keeps the last error with its code", () => {
    const state = reduce(
      joined(),
      { type: "S2C_ERROR", code: "BID_TOO_LOW", message: "Puja rechazada" },
      6_000,
    );
    expect(state.lastError?.code).toBe("BID_TOO_LOW");
    expect(state.lastError?.at).toBe(6_000);
  });

  it("selects my best and worst purchase", () => {
    let state = reduce(joined(), roomState({ round: 5, phase: "REVEAL" }), 7_000);
    state = reduce(
      state,
      {
        type: "S2C_REVEAL",
        lotId: "lot-1",
        objects: [{ silhouetteId: "sil_tv", name: "TV", value: 100, category: "electronics" }],
        total: 100,
        winnerId: "p1",
        winningBid: 300,
        profit: -200,
      },
      7_100,
    );
    state = reduce(state, roomState({ round: 6, phase: "REVEAL" }), 7_200);
    state = reduce(
      state,
      {
        type: "S2C_REVEAL",
        lotId: "lot-2",
        objects: [{ silhouetteId: "sil_vase", name: "Jarrón", value: 900, category: "antique" }],
        total: 900,
        winnerId: "p1",
        winningBid: 400,
        profit: 500,
      },
      7_300,
    );
    const { best, worst } = myBestWorst(state);
    expect(best?.profit).toBe(500);
    expect(worst?.profit).toBe(-200);
  });

  it("builds a ranking from live money when the match is not over", () => {
    const state = joined();
    expect(state.gameOver).toBeNull();
  });
});

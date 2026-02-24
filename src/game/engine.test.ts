import { describe, expect, it } from "vitest";
import {
  applyMove,
  chooseBestMove,
  chooseMoveBySkill,
  createInitialBoard,
  getLegalMoves,
  isDarkSquare,
  isSameMove
} from "./engine";
import type { Board, Move, Piece } from "./types";

describe("engine", () => {
  it("creates a valid initial board layout", () => {
    const { board, nextId } = createInitialBoard(1);
    let lightCount = 0;
    let darkCount = 0;

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (!piece) {
          continue;
        }
        expect(isDarkSquare(row, col)).toBe(true);
        if (piece.player === "light") {
          lightCount += 1;
        } else {
          darkCount += 1;
        }
      }
    }

    expect(lightCount).toBe(12);
    expect(darkCount).toBe(12);
    expect(nextId).toBe(25);
  });

  it("enforces mandatory captures over slide moves", () => {
    const board = emptyBoard();
    place(board, 5, 2, { id: 1, player: "light", king: false });
    place(board, 4, 3, { id: 2, player: "dark", king: false });
    place(board, 5, 6, { id: 3, player: "light", king: false });

    const moves = getLegalMoves(board, "light", null);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ pieceId: 1, from: [5, 2], to: [3, 4], capture: [4, 3] });
  });

  it("forces multi-jump continuation with the same piece", () => {
    const board = emptyBoard();
    place(board, 5, 0, { id: 10, player: "light", king: false });
    place(board, 4, 1, { id: 20, player: "dark", king: false });
    place(board, 2, 3, { id: 21, player: "dark", king: false });

    const firstMoves = getLegalMoves(board, "light", null);
    expect(firstMoves).toHaveLength(1);
    const next = applyMove(board, firstMoves[0], "light");

    expect(next.currentPlayer).toBe("light");
    expect(next.forcedPieceId).toBe(10);

    const followups = getLegalMoves(next.board, next.currentPlayer, next.forcedPieceId);
    expect(followups).toHaveLength(1);
    expect(followups[0]).toMatchObject({ pieceId: 10, from: [3, 2], to: [1, 4], capture: [2, 3] });
  });

  it("ends turn when a capture crowns a piece", () => {
    const board = emptyBoard();
    place(board, 2, 1, { id: 30, player: "light", king: false });
    place(board, 1, 2, { id: 31, player: "dark", king: false });
    place(board, 1, 4, { id: 32, player: "dark", king: false });

    const captureToKingRow: Move = {
      pieceId: 30,
      from: [2, 1],
      to: [0, 3],
      capture: [1, 2]
    };
    const result = applyMove(board, captureToKingRow, "light");

    expect(result.promoted).toBe(true);
    expect(result.forcedPieceId).toBeNull();
    expect(result.currentPlayer).toBe("dark");
  });

  it("prefers capture moves when scoring AI options", () => {
    const board = emptyBoard();
    place(board, 5, 2, { id: 40, player: "light", king: false });
    place(board, 4, 3, { id: 41, player: "dark", king: false });

    const slideMove: Move = {
      pieceId: 40,
      from: [5, 2],
      to: [4, 1],
      capture: null
    };
    const captureMove: Move = {
      pieceId: 40,
      from: [5, 2],
      to: [3, 4],
      capture: [4, 3]
    };

    const choice = chooseBestMove([slideMove, captureMove], board, "light", () => 0);
    expect(choice).toEqual(captureMove);
  });

  it("uses random move selection for easy AI", () => {
    const board = emptyBoard();
    place(board, 5, 2, { id: 50, player: "light", king: false });
    const legalMoves = getLegalMoves(board, "light", null);
    const choice = chooseMoveBySkill("easy", legalMoves, board, "light", () => 0.99);
    expect(choice).toEqual(legalMoves[legalMoves.length - 1]);
  });

  it("hard AI avoids obvious one-turn blunders", () => {
    const board = emptyBoard();
    place(board, 2, 1, { id: 60, player: "dark", king: false });
    place(board, 4, 3, { id: 61, player: "light", king: false });

    const legalMoves = getLegalMoves(board, "dark", null);
    const riskyMove = legalMoves.find((move) => move.to[0] === 3 && move.to[1] === 2);
    const safeMove = legalMoves.find((move) => move.to[0] === 3 && move.to[1] === 0);
    expect(riskyMove).toBeDefined();
    expect(safeMove).toBeDefined();

    const choice = chooseMoveBySkill("hard", legalMoves, board, "dark", () => 0);
    expect(choice).toEqual(safeMove);
  });

  it("compares move payloads reliably", () => {
    const a: Move = { pieceId: 1, from: [5, 0], to: [4, 1], capture: null };
    const b: Move = { pieceId: 1, from: [5, 0], to: [4, 1], capture: null };
    const c: Move = { pieceId: 1, from: [5, 0], to: [3, 2], capture: [4, 1] };

    expect(isSameMove(a, b)).toBe(true);
    expect(isSameMove(a, c)).toBe(false);
  });
});

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function place(board: Board, row: number, col: number, piece: Piece): void {
  board[row][col] = piece;
}

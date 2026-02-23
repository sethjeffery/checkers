import { create } from "zustand";
import { applyMove, chooseBestMove, createInitialBoard, getLegalMoves, isSameMove, otherPlayer } from "../game/engine";
import type { Board, Mode, Move, MoveEvent, Player, Screen } from "../game/types";

interface GameState {
  screen: Screen;
  mode: Mode;
  tutorialEnabled: boolean;
  board: Board;
  currentPlayer: Player;
  forcedPieceId: number | null;
  legalMoves: Move[];
  selectedPieceId: number | null;
  waitingForComputer: boolean;
  gameOver: boolean;
  winner: Player | null;
  tipIndex: number;
  capturedFlashId: number | null;
  lastMoveEvent: MoveEvent | null;
  startGame: (mode: Mode, tutorialEnabled: boolean) => void;
  restartGame: () => void;
  goHome: () => void;
  setWaitingForComputer: (value: boolean) => void;
  selectPiece: (pieceId: number | null) => void;
  clearSelection: () => void;
  commitMove: (move: Move) => void;
  showHint: () => Move | null;
  nextTip: () => number;
  clearCapturedFlash: () => void;
}

const initial = createInitialBoard(1);

export const useGameStore = create<GameState>((set, get) => ({
  screen: "title",
  mode: "one",
  tutorialEnabled: false,
  board: initial.board,
  currentPlayer: "light",
  forcedPieceId: null,
  legalMoves: getLegalMoves(initial.board, "light", null),
  selectedPieceId: null,
  waitingForComputer: false,
  gameOver: false,
  winner: null,
  tipIndex: 0,
  capturedFlashId: null,
  lastMoveEvent: null,

  startGame: (mode, tutorialEnabled) => {
    const seeded = createInitialBoard(1);
    set({
      screen: "game",
      mode,
      tutorialEnabled,
      board: seeded.board,
      currentPlayer: "light",
      forcedPieceId: null,
      legalMoves: getLegalMoves(seeded.board, "light", null),
      selectedPieceId: null,
      waitingForComputer: false,
      gameOver: false,
      winner: null,
      tipIndex: 0,
      capturedFlashId: null,
      lastMoveEvent: null
    });
  },

  restartGame: () => {
    const { mode, tutorialEnabled } = get();
    get().startGame(mode, tutorialEnabled);
  },

  goHome: () => {
    set({
      screen: "title",
      waitingForComputer: false,
      selectedPieceId: null,
      forcedPieceId: null,
      capturedFlashId: null,
      lastMoveEvent: null
    });
  },

  setWaitingForComputer: (value) => set({ waitingForComputer: value }),

  selectPiece: (pieceId) => {
    const legalMoves = get().legalMoves;
    if (!pieceId) {
      set({ selectedPieceId: null });
      return;
    }
    const hasMoves = legalMoves.some((move) => move.pieceId === pieceId);
    set({ selectedPieceId: hasMoves ? pieceId : null });
  },

  clearSelection: () => set({ selectedPieceId: null }),

  commitMove: (move) => {
    const current = get();
    if (current.gameOver) {
      return;
    }
    const legalMove = current.legalMoves.find((candidate) => isSameMove(candidate, move));
    if (!legalMove) {
      return;
    }

    const mover = current.currentPlayer;
    const next = applyMove(current.board, legalMove, current.currentPlayer);
    const legalMoves = getLegalMoves(next.board, next.currentPlayer, next.forcedPieceId);
    const gameOver = legalMoves.length === 0;
    const winner = gameOver ? otherPlayer(next.currentPlayer) : null;
    const lastMoveEvent: MoveEvent = {
      move: legalMove,
      mover,
      capture: Boolean(legalMove.capture),
      promoted: next.promoted,
      forcedContinuation: next.forcedPieceId !== null
    };

    set({
      board: next.board,
      currentPlayer: next.currentPlayer,
      forcedPieceId: next.forcedPieceId,
      legalMoves,
      selectedPieceId: next.forcedPieceId,
      waitingForComputer: false,
      gameOver,
      winner,
      capturedFlashId: next.capturedPieceId,
      lastMoveEvent
    });
  },

  showHint: () => {
    const { legalMoves, board, currentPlayer, gameOver } = get();
    if (gameOver || legalMoves.length === 0) {
      return null;
    }
    const hint = chooseBestMove(legalMoves, board, currentPlayer);
    if (hint) {
      set({ selectedPieceId: hint.pieceId });
    }
    return hint;
  },

  nextTip: () => {
    const next = get().tipIndex + 1;
    set({ tipIndex: next });
    return next;
  },

  clearCapturedFlash: () => set({ capturedFlashId: null })
}));

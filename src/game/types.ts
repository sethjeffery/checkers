export type Player = "light" | "dark";
export type Mode = "one" | "two";
export type Screen = "title" | "game";

export interface Piece {
  id: number;
  player: Player;
  king: boolean;
}

export type Cell = Piece | null;
export type Board = Cell[][];

export interface Move {
  pieceId: number;
  from: [number, number];
  to: [number, number];
  capture: [number, number] | null;
}

export interface MoveEvent {
  move: Move;
  mover: Player;
  capture: boolean;
  promoted: boolean;
  forcedContinuation: boolean;
}

export interface AppliedMove {
  board: Board;
  currentPlayer: Player;
  forcedPieceId: number | null;
  capturedPieceId: number | null;
  promoted: boolean;
}

import type { AISkill, AppliedMove, Board, Move, Piece, Player } from "./types";

const HARD_SEARCH_DEPTH = 4;

export function createInitialBoard(startId = 1): { board: Board; nextId: number } {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  let nextId = startId;

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (isDarkSquare(row, col)) {
        board[row][col] = { id: nextId, player: "dark", king: false };
        nextId += 1;
      }
    }
  }

  for (let row = 5; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (isDarkSquare(row, col)) {
        board[row][col] = { id: nextId, player: "light", king: false };
        nextId += 1;
      }
    }
  }

  return { board, nextId };
}

export function getLegalMoves(board: Board, player: Player, forcedPieceId: number | null): Move[] {
  if (forcedPieceId) {
    const forced = findPiece(forcedPieceId, board);
    if (!forced) {
      return [];
    }
    return getSinglePieceCaptures(board, forced.row, forced.col, forced.piece);
  }

  const captures: Move[] = [];
  const slides: Move[] = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.player !== player) {
        continue;
      }
      const pieceCaptures = getSinglePieceCaptures(board, row, col, piece);
      if (pieceCaptures.length) {
        captures.push(...pieceCaptures);
      } else {
        slides.push(...getSinglePieceSlides(board, row, col, piece));
      }
    }
  }

  return captures.length ? captures : slides;
}

export function applyMove(board: Board, move: Move, currentPlayer: Player): AppliedMove {
  const nextBoard = cloneBoard(board);
  const [fromRow, fromCol] = move.from;
  const [toRow, toCol] = move.to;
  const movingPiece = nextBoard[fromRow][fromCol];

  if (!movingPiece) {
    return {
      board: nextBoard,
      currentPlayer,
      forcedPieceId: null,
      capturedPieceId: null,
      promoted: false
    };
  }

  nextBoard[fromRow][fromCol] = null;
  nextBoard[toRow][toCol] = movingPiece;

  let capturedPieceId: number | null = null;
  if (move.capture) {
    const [capRow, capCol] = move.capture;
    const captured = nextBoard[capRow][capCol];
    nextBoard[capRow][capCol] = null;
    if (captured) {
      capturedPieceId = captured.id;
    }
  }

  let promoted = false;
  if (!movingPiece.king) {
    if ((movingPiece.player === "light" && toRow === 0) || (movingPiece.player === "dark" && toRow === 7)) {
      movingPiece.king = true;
      promoted = true;
    }
  }

  let nextPlayer = otherPlayer(currentPlayer);
  let forcedPieceId: number | null = null;

  if (move.capture && !promoted) {
    // American/English checkers: the move ends when a piece is crowned.
    const followups = getSinglePieceCaptures(nextBoard, toRow, toCol, movingPiece);
    if (followups.length) {
      nextPlayer = currentPlayer;
      forcedPieceId = movingPiece.id;
    }
  }

  return {
    board: nextBoard,
    currentPlayer: nextPlayer,
    forcedPieceId,
    capturedPieceId,
    promoted
  };
}

export function chooseBestMove(
  moves: Move[],
  board: Board,
  player: Player,
  random: () => number = Math.random
): Move | null {
  if (!moves.length) {
    return null;
  }

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const score = scoreMove(move, board, player, random);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

export function chooseMoveBySkill(
  skill: AISkill,
  moves: Move[],
  board: Board,
  player: Player,
  random: () => number = Math.random
): Move | null {
  if (!moves.length) {
    return null;
  }

  if (skill === "easy") {
    const index = Math.min(moves.length - 1, Math.floor(random() * moves.length));
    return moves[index];
  }

  if (skill === "medium") {
    return chooseBestMove(moves, board, player, random);
  }

  return chooseBestLookaheadMove(moves, board, player, random);
}

export function findPiece(pieceId: number, board: Board): { row: number; col: number; piece: Piece } | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.id === pieceId) {
        return { row, col, piece };
      }
    }
  }
  return null;
}

export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

export function otherPlayer(player: Player): Player {
  return player === "light" ? "dark" : "light";
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isSameMove(left: Move, right: Move): boolean {
  return (
    left.pieceId === right.pieceId &&
    left.from[0] === right.from[0] &&
    left.from[1] === right.from[1] &&
    left.to[0] === right.to[0] &&
    left.to[1] === right.to[1] &&
    areCaptureCoordsEqual(left.capture, right.capture)
  );
}

function getSinglePieceCaptures(board: Board, row: number, col: number, piece: Piece): Move[] {
  const moves: Move[] = [];
  const directions = getDirections(piece);

  for (const [dr, dc] of directions) {
    const middleRow = row + dr;
    const middleCol = col + dc;
    const targetRow = row + dr * 2;
    const targetCol = col + dc * 2;

    if (!isInside(middleRow, middleCol) || !isInside(targetRow, targetCol)) {
      continue;
    }

    const middlePiece = board[middleRow][middleCol];
    if (!middlePiece || middlePiece.player === piece.player) {
      continue;
    }
    if (board[targetRow][targetCol]) {
      continue;
    }

    moves.push({
      pieceId: piece.id,
      from: [row, col],
      to: [targetRow, targetCol],
      capture: [middleRow, middleCol]
    });
  }

  return moves;
}

function getSinglePieceSlides(board: Board, row: number, col: number, piece: Piece): Move[] {
  const moves: Move[] = [];
  const directions = getDirections(piece);

  for (const [dr, dc] of directions) {
    const targetRow = row + dr;
    const targetCol = col + dc;
    if (!isInside(targetRow, targetCol)) {
      continue;
    }
    if (board[targetRow][targetCol]) {
      continue;
    }

    moves.push({
      pieceId: piece.id,
      from: [row, col],
      to: [targetRow, targetCol],
      capture: null
    });
  }

  return moves;
}

function getDirections(piece: Piece): Array<[number, number]> {
  if (piece.king) {
    return [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  }
  return piece.player === "light" ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function isInside(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function cloneBoard(board: Board): Board {
  return board.map((row) =>
    row.map((piece) => {
      if (!piece) {
        return null;
      }
      return { ...piece };
    })
  );
}

function chooseBestLookaheadMove(
  moves: Move[],
  board: Board,
  player: Player,
  random: () => number
): Move | null {
  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const next = applyMove(board, move, player);
    const score = minimax(
      next.board,
      next.currentPlayer,
      next.forcedPieceId,
      player,
      HARD_SEARCH_DEPTH - 1,
      -Infinity,
      Infinity,
      random
    );

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      continue;
    }

    if (Math.abs(score - bestScore) < 0.001 && random() > 0.5) {
      bestMove = move;
    }
  }

  return bestMove;
}

function minimax(
  board: Board,
  currentPlayer: Player,
  forcedPieceId: number | null,
  maximizingPlayer: Player,
  depth: number,
  alpha: number,
  beta: number,
  random: () => number
): number {
  const moves = getLegalMoves(board, currentPlayer, forcedPieceId);
  if (!moves.length) {
    return currentPlayer === maximizingPlayer ? -1000 - depth : 1000 + depth;
  }

  if (depth <= 0) {
    return evaluateBoard(board, maximizingPlayer) + random() * 0.01;
  }

  if (currentPlayer === maximizingPlayer) {
    let value = -Infinity;
    for (const move of moves) {
      const next = applyMove(board, move, currentPlayer);
      value = Math.max(
        value,
        minimax(
          next.board,
          next.currentPlayer,
          next.forcedPieceId,
          maximizingPlayer,
          depth - 1,
          alpha,
          beta,
          random
        )
      );
      alpha = Math.max(alpha, value);
      if (beta <= alpha) {
        break;
      }
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    const next = applyMove(board, move, currentPlayer);
    value = Math.min(
      value,
      minimax(
        next.board,
        next.currentPlayer,
        next.forcedPieceId,
        maximizingPlayer,
        depth - 1,
        alpha,
        beta,
        random
      )
    );
    beta = Math.min(beta, value);
    if (beta <= alpha) {
      break;
    }
  }
  return value;
}

function evaluateBoard(board: Board, maximizingPlayer: Player): number {
  let score = 0;

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) {
        continue;
      }
      const promotionDistance = piece.player === "light" ? row : 7 - row;
      const advancement = (7 - promotionDistance) / 7;
      const centerDistance = Math.abs(row - 3.5) + Math.abs(col - 3.5);
      const centerControl = (7 - centerDistance) * 0.05;
      const pieceValue = (piece.king ? 3.8 : 1.2) + advancement * 0.35 + centerControl;

      score += piece.player === maximizingPlayer ? pieceValue : -pieceValue;
    }
  }

  const myMobility = getLegalMoves(board, maximizingPlayer, null).length;
  const theirMobility = getLegalMoves(board, otherPlayer(maximizingPlayer), null).length;
  score += (myMobility - theirMobility) * 0.06;

  return score;
}

function scoreMove(move: Move, board: Board, player: Player, random: () => number): number {
  let score = random() * 0.2;
  const movingPiece = board[move.from[0]][move.from[1]];

  if (move.capture) {
    score += 6;
    const captured = board[move.capture[0]][move.capture[1]];
    if (captured?.king) {
      score += 3;
    }
  }

  if (movingPiece && !movingPiece.king) {
    const targetRow = move.to[0];
    if ((player === "light" && targetRow === 0) || (player === "dark" && targetRow === 7)) {
      score += 4;
    } else {
      const advance = player === "light" ? move.from[0] - targetRow : targetRow - move.from[0];
      score += advance * 0.55;
    }
  }

  const centerDistance = Math.abs(move.to[0] - 3.5) + Math.abs(move.to[1] - 3.5);
  score += (7 - centerDistance) * 0.12;
  return score;
}

function areCaptureCoordsEqual(left: Move["capture"], right: Move["capture"]): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1];
}

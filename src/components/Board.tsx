import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { isDarkSquare } from "../game/engine";
import type { Board as BoardType, Move } from "../game/types";

interface BoardProps {
  board: BoardType;
  legalMoves: Move[];
  selectedPieceId: number | null;
  forcedPieceId: number | null;
  currentPlayer: "light" | "dark";
  isHumanTurn: boolean;
  waitingForComputer: boolean;
  onSelectPiece: (pieceId: number | null) => void;
  onCommitMove: (move: Move) => void;
}

interface DragState {
  pieceId: number;
  moves: Move[];
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

interface RoundedPolygonData {
  points: Point[];
  cornerRadii: number[];
  starts: Point[];
  ends: Point[];
}

interface PieceRenderItem {
  id: number;
  player: "light" | "dark";
  king: boolean;
  row: number;
  col: number;
}

const BOARD_SIZE = 8;
const BOARD_DEPTH = 22;
const TOP_PADDING = 26;
const HORIZONTAL_PADDING = 34;
const TOP_WIDTH = 800;
const TOP_HEIGHT = 448;
const BOARD_EDGE_PADDING_X = 28;
const BOARD_EDGE_PADDING_Y = 18;
const TILE_HALF_WIDTH = (TOP_WIDTH - BOARD_EDGE_PADDING_X * 2) / 16;
const TILE_HALF_HEIGHT = (TOP_HEIGHT - BOARD_EDGE_PADDING_Y * 2) / 16;
const VIEW_WIDTH = TOP_WIDTH + HORIZONTAL_PADDING * 2;
const VIEW_HEIGHT = TOP_HEIGHT + TOP_PADDING + BOARD_DEPTH + 30;
const CENTER_X = VIEW_WIDTH / 2;
const PIECE_RADIUS_X = TILE_HALF_WIDTH * 0.47;
const PIECE_RADIUS_Y = TILE_HALF_HEIGHT * 0.4;
const PIECE_DEPTH = TILE_HALF_HEIGHT * 0.44;
const PIECE_EXTRUSION_PATH = buildPieceExtrusionPath(PIECE_RADIUS_X, PIECE_RADIUS_Y, PIECE_DEPTH);
const KING_STAR_PATH = buildStarPath(PIECE_RADIUS_Y * 0.86, PIECE_RADIUS_Y * 0.4);
const BOARD_CORNER_RADIUS = 24;
const CORNER_TILE_RADIUS = TILE_HALF_WIDTH * 0.28;
const BOARD_TOP_CLIP_ID = "board-top-clip";

const PIECE_MOVE_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 0.61, 0.36, 1] as const
};

const TOP_VERTEX: Point = { x: CENTER_X, y: TOP_PADDING };
const RIGHT_VERTEX: Point = { x: CENTER_X + TOP_WIDTH / 2, y: TOP_PADDING + TOP_HEIGHT / 2 };
const BOTTOM_VERTEX: Point = { x: CENTER_X, y: TOP_PADDING + TOP_HEIGHT };
const LEFT_VERTEX: Point = { x: CENTER_X - TOP_WIDTH / 2, y: TOP_PADDING + TOP_HEIGHT / 2 };

const BOARD_TOP_POINTS = [TOP_VERTEX, RIGHT_VERTEX, BOTTOM_VERTEX, LEFT_VERTEX];
const BOARD_CORNER_RADII = [BOARD_CORNER_RADIUS, BOARD_CORNER_RADIUS, BOARD_CORNER_RADIUS, BOARD_CORNER_RADIUS];
const BOARD_TOP_DATA = createRoundedPolygonData(BOARD_TOP_POINTS, BOARD_CORNER_RADII);
const TOP_SURFACE_PATH = buildRoundedPolygonPathFromData(BOARD_TOP_DATA);
const SIDE_FACE_PATH = buildVisibleSideFacePath(BOARD_TOP_DATA, BOARD_DEPTH);

export function Board({
  board,
  legalMoves,
  selectedPieceId,
  forcedPieceId,
  currentPlayer,
  isHumanTurn,
  waitingForComputer,
  onSelectPiece,
  onCommitMove
}: BoardProps) {
  const boardRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const selectedMoves = useMemo(() => {
    if (!selectedPieceId) {
      return [];
    }
    return legalMoves.filter((move) => move.pieceId === selectedPieceId);
  }, [legalMoves, selectedPieceId]);

  const source = selectedMoves[0]?.from ?? null;
  const movablePieceIds = useMemo(() => {
    if (!isHumanTurn || waitingForComputer) {
      return new Set<number>();
    }
    return new Set(legalMoves.map((move) => move.pieceId));
  }, [isHumanTurn, legalMoves, waitingForComputer]);

  const highlightedTargets = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const move of selectedMoves) {
      map.set(`${move.to[0]}-${move.to[1]}`, Boolean(move.capture));
    }
    return map;
  }, [selectedMoves]);

  const cells = useMemo(
    () =>
      Array.from({ length: BOARD_SIZE }, (_, row) =>
        Array.from({ length: BOARD_SIZE }, (_, col) => ({
          row,
          col
        }))
      ).flat(),
    []
  );

  const renderedPieces = useMemo(() => {
    const pieces: PieceRenderItem[] = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const piece = board[row][col];
        if (!piece) {
          continue;
        }
        pieces.push({
          id: piece.id,
          player: piece.player,
          king: piece.king,
          row,
          col
        });
      }
    }

    pieces.sort((a, b) => {
      const depthDelta = a.row + a.col - (b.row + b.col);
      if (depthDelta !== 0) {
        return depthDelta;
      }
      return a.col - b.col;
    });
    return pieces;
  }, [board]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const activeDrag = drag;

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") {
        event.preventDefault();
      }
      const boardNode = boardRef.current;
      if (!boardNode) {
        return;
      }
      const point = clientToBoardPoint(event.clientX, event.clientY, boardNode);
      setDrag((current) => (current ? { ...current, x: point.x, y: point.y } : null));
    }

    function finalizeDrag(clientX: number, clientY: number) {
      const boardNode = boardRef.current;
      let moved = false;

      if (boardNode) {
        const dropPoint = clientToBoardPoint(clientX, clientY, boardNode);
        const targetCell = boardPointToCell(dropPoint.x, dropPoint.y);

        if (targetCell) {
          const [row, col] = targetCell;
          const targetMove = activeDrag.moves.find((move) => move.to[0] === row && move.to[1] === col);
          if (targetMove) {
            onCommitMove(targetMove);
            moved = true;
          }
        }
      }

      if (!moved) {
        onSelectPiece(activeDrag.pieceId);
      }
      setDrag(null);
    }

    function onPointerUp(event: PointerEvent) {
      finalizeDrag(event.clientX, event.clientY);
    }

    function onPointerCancel() {
      onSelectPiece(activeDrag.pieceId);
      setDrag(null);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerCancel, { once: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [drag, onCommitMove, onSelectPiece]);

  function handleSquareClick(row: number, col: number) {
    if (!isHumanTurn || waitingForComputer || drag) {
      return;
    }

    const selectedMove = selectedMoves.find((move) => move.to[0] === row && move.to[1] === col);
    if (selectedMove) {
      onCommitMove(selectedMove);
      return;
    }

    const piece = board[row][col];
    if (!piece || piece.player !== currentPlayer) {
      onSelectPiece(null);
      return;
    }

    const pieceHasMoves = legalMoves.some((move) => move.pieceId === piece.id);
    onSelectPiece(pieceHasMoves ? piece.id : null);
  }

  function handlePiecePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    pieceId: number,
    player: "light" | "dark",
    row: number,
    col: number
  ) {
    if (!isHumanTurn || waitingForComputer || drag || player !== currentPlayer) {
      return;
    }

    const moves = legalMoves.filter((move) => move.pieceId === pieceId);
    if (!moves.length) {
      return;
    }

    onSelectPiece(pieceId);
    const center = getTileCenter(row, col);

    setDrag({
      pieceId,
      moves,
      x: center.x,
      y: center.y
    });

    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers can reject capture on SVG groups; drag still works via window listeners.
      }
    }
    event.preventDefault();
  }

  return (
    <div className="board-stage">
      <svg
        ref={boardRef}
        className="board-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        aria-label="Checkers board"
      >
        <defs>
          <clipPath id={BOARD_TOP_CLIP_ID}>
            <path d={TOP_SURFACE_PATH} />
          </clipPath>
        </defs>

        <g className="board-geometry" aria-hidden="true">
          <path className="board-face board-face-side" d={SIDE_FACE_PATH} />
          <path className="board-face board-face-top" d={TOP_SURFACE_PATH} />
        </g>

        <g className="tiles-layer" clipPath={`url(#${BOARD_TOP_CLIP_ID})`}>
          {cells.map(({ row, col }) => {
            const hint = highlightedTargets.get(`${row}-${col}`);
            return (
              <path
                key={`${row}-${col}`}
                data-square="1"
                data-row={row}
                data-col={col}
                data-testid={`square-${row}-${col}`}
                onClick={() => handleSquareClick(row, col)}
                focusable="false"
                className={clsx("square", isDarkSquare(row, col) ? "dark" : "light", {
                  hint: hint !== undefined,
                  "hint-capture": hint === true,
                  "select-source": source && source[0] === row && source[1] === col
                })}
                d={getTilePath(row, col)}
                aria-label={`Square ${row}, ${col}`}
              />
            );
          })}
        </g>

        <g className="pieces-layer">
          {renderedPieces.map((piece) => {
            const dragging = drag?.pieceId === piece.id;
            const center = dragging ? { x: drag.x, y: drag.y } : getTileCenter(piece.row, piece.col);
            const isMovable = movablePieceIds.has(piece.id);

            return (
              <motion.g
                key={piece.id}
                className={clsx("piece", piece.player, {
                  king: piece.king,
                  dragging,
                  movable: isMovable,
                  "must-move": forcedPieceId === piece.id,
                  selected: selectedPieceId === piece.id
                })}
                data-testid={`piece-${piece.id}`}
                data-row={piece.row}
                data-col={piece.col}
                onPointerDown={(event) =>
                  handlePiecePointerDown(event, piece.id, piece.player, piece.row, piece.col)
                }
                style={{ pointerEvents: dragging ? "none" : "auto" }}
                initial={false}
                animate={{ x: center.x, y: center.y }}
                transition={dragging ? { duration: 0 } : PIECE_MOVE_TRANSITION}
              >
                <path className="piece-extrusion" d={PIECE_EXTRUSION_PATH} />
                <ellipse className="piece-move-ring" cx={0} cy={-PIECE_DEPTH} rx={PIECE_RADIUS_X * 0.92} ry={PIECE_RADIUS_Y * 0.82} />
                <ellipse className="piece-top" cx={0} cy={-PIECE_DEPTH} rx={PIECE_RADIUS_X} ry={PIECE_RADIUS_Y} />
                {piece.king ? (
                  <g className="piece-king-mark" transform={`translate(0 ${-PIECE_DEPTH + 0.8}) scale(1 0.72)`}>
                    <path className="piece-king-star" d={KING_STAR_PATH} />
                  </g>
                ) : null}
              </motion.g>
            );
          })}
        </g>

        {waitingForComputer ? (
          <g className="wait-overlay">
            <path className="wait-overlay-mask" d={TOP_SURFACE_PATH} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function getTileCenter(row: number, col: number): Point {
  return {
    x: CENTER_X + (col - row) * TILE_HALF_WIDTH,
    y: TOP_PADDING + BOARD_EDGE_PADDING_Y + (row + col + 1) * TILE_HALF_HEIGHT
  };
}

function getTilePath(row: number, col: number): string {
  const cornerRadii = [0, 0, 0, 0];
  if (row === 0 && col === 0) {
    cornerRadii[0] = CORNER_TILE_RADIUS;
  } else if (row === 0 && col === BOARD_SIZE - 1) {
    cornerRadii[1] = CORNER_TILE_RADIUS;
  } else if (row === BOARD_SIZE - 1 && col === BOARD_SIZE - 1) {
    cornerRadii[2] = CORNER_TILE_RADIUS;
  } else if (row === BOARD_SIZE - 1 && col === 0) {
    cornerRadii[3] = CORNER_TILE_RADIUS;
  }

  return buildRoundedPolygonPath(getTilePoints(row, col), cornerRadii);
}

function getTilePoints(row: number, col: number): Point[] {
  const center = getTileCenter(row, col);
  return [
    { x: center.x, y: center.y - TILE_HALF_HEIGHT },
    { x: center.x + TILE_HALF_WIDTH, y: center.y },
    { x: center.x, y: center.y + TILE_HALF_HEIGHT },
    { x: center.x - TILE_HALF_WIDTH, y: center.y }
  ];
}

function clientToBoardPoint(clientX: number, clientY: number, board: SVGSVGElement): Point {
  const rect = board.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * VIEW_WIDTH,
    y: ((clientY - rect.top) / rect.height) * VIEW_HEIGHT
  };
}

function boardPointToCell(x: number, y: number): [number, number] | null {
  const u = (x - CENTER_X) / TILE_HALF_WIDTH;
  const v = (y - TOP_PADDING - BOARD_EDGE_PADDING_Y) / TILE_HALF_HEIGHT - 1;
  const row = Math.round((v - u) / 2);
  const col = Math.round((v + u) / 2);
  if (!isInsideBoard(row, col)) {
    return null;
  }
  return [row, col];
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function buildRoundedPolygonPath(points: Point[], cornerRadii: number[]): string {
  const data = createRoundedPolygonData(points, cornerRadii);
  return buildRoundedPolygonPathFromData(data);
}

function createRoundedPolygonData(points: Point[], cornerRadii: number[]): RoundedPolygonData {
  const count = points.length;
  const starts: Point[] = new Array(count);
  const ends: Point[] = new Array(count);

  for (let index = 0; index < count; index += 1) {
    const prev = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    const radius = cornerRadii[index] ?? 0;

    if (radius <= 0) {
      starts[index] = current;
      ends[index] = current;
      continue;
    }

    const toPrev = normalizeVector({
      x: prev.x - current.x,
      y: prev.y - current.y
    });
    const toNext = normalizeVector({
      x: next.x - current.x,
      y: next.y - current.y
    });

    const maxRadius = Math.min(radius, distanceBetween(current, prev) / 2, distanceBetween(current, next) / 2);
    starts[index] = {
      x: current.x + toPrev.x * maxRadius,
      y: current.y + toPrev.y * maxRadius
    };
    ends[index] = {
      x: current.x + toNext.x * maxRadius,
      y: current.y + toNext.y * maxRadius
    };
  }

  return {
    points,
    cornerRadii,
    starts,
    ends
  };
}

function buildRoundedPolygonPathFromData(data: RoundedPolygonData): string {
  const { points, cornerRadii, starts, ends } = data;
  const count = points.length;
  let path = `M ${starts[0].x} ${starts[0].y}`;
  for (let index = 0; index < count; index += 1) {
    const current = points[index];
    const radius = cornerRadii[index] ?? 0;
    if (radius > 0) {
      path += ` Q ${current.x} ${current.y} ${ends[index].x} ${ends[index].y}`;
    } else {
      path += ` L ${ends[index].x} ${ends[index].y}`;
    }

    const nextStart = starts[(index + 1) % count];
    path += ` L ${nextStart.x} ${nextStart.y}`;
  }

  return `${path} Z`;
}

function buildVisibleSideFacePath(data: RoundedPolygonData, depth: number): string {
  const start3 = data.starts[3];
  const end2 = data.ends[2];
  const start2 = data.starts[2];
  const end1 = data.ends[1];
  const left = data.points[3];
  const bottom = data.points[2];
  const right = data.points[1];

  const leftVisible = splitQuadraticSegment(data.ends[3], left, start3, 0.5).second;
  const rightVisible = splitQuadraticSegment(end1, right, data.starts[1], 0.5).first;

  const leftVisibleStart = leftVisible.start;
  const leftVisibleControl = leftVisible.control;
  const leftVisibleEnd = leftVisible.end;
  const rightVisibleStart = rightVisible.start;
  const rightVisibleControl = rightVisible.control;
  const rightVisibleEnd = rightVisible.end;

  const leftVisibleStartd = withYOffset(leftVisibleStart, depth);
  const leftVisibleControld = withYOffset(leftVisibleControl, depth);
  const leftVisibleEndd = withYOffset(leftVisibleEnd, depth);
  const rightVisibleStartd = withYOffset(rightVisibleStart, depth);
  const rightVisibleControld = withYOffset(rightVisibleControl, depth);
  const rightVisibleEndd = withYOffset(rightVisibleEnd, depth);
  const start2d = withYOffset(start2, depth);
  const end2d = withYOffset(end2, depth);
  const bottomd = withYOffset(bottom, depth);

  return [
    `M ${leftVisibleStart.x} ${leftVisibleStart.y}`,
    `Q ${leftVisibleControl.x} ${leftVisibleControl.y} ${leftVisibleEnd.x} ${leftVisibleEnd.y}`,
    `L ${end2.x} ${end2.y}`,
    `Q ${bottom.x} ${bottom.y} ${start2.x} ${start2.y}`,
    `L ${rightVisibleStart.x} ${rightVisibleStart.y}`,
    `Q ${rightVisibleControl.x} ${rightVisibleControl.y} ${rightVisibleEnd.x} ${rightVisibleEnd.y}`,
    `L ${rightVisibleEndd.x} ${rightVisibleEndd.y}`,
    `Q ${rightVisibleControld.x} ${rightVisibleControld.y} ${rightVisibleStartd.x} ${rightVisibleStartd.y}`,
    `L ${start2d.x} ${start2d.y}`,
    `Q ${bottomd.x} ${bottomd.y} ${end2d.x} ${end2d.y}`,
    `L ${leftVisibleEndd.x} ${leftVisibleEndd.y}`,
    `Q ${leftVisibleControld.x} ${leftVisibleControld.y} ${leftVisibleStartd.x} ${leftVisibleStartd.y}`,
    "Z"
  ].join(" ");
}

function withYOffset(point: Point, deltaY: number): Point {
  return {
    x: point.x,
    y: point.y + deltaY
  };
}

function distanceBetween(left: Point, right: Point): number {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeVector(vector: Point): Point {
  const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude
  };
}

interface QuadraticSegment {
  start: Point;
  control: Point;
  end: Point;
}

function splitQuadraticSegment(start: Point, control: Point, end: Point, t: number): {
  first: QuadraticSegment;
  second: QuadraticSegment;
} {
  const firstControl = lerpPoint(start, control, t);
  const secondControl = lerpPoint(control, end, t);
  const splitPoint = lerpPoint(firstControl, secondControl, t);

  return {
    first: {
      start,
      control: firstControl,
      end: splitPoint
    },
    second: {
      start: splitPoint,
      control: secondControl,
      end
    }
  };
}

function lerpPoint(start: Point, end: Point, t: number): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function buildPieceExtrusionPath(radiusX: number, radiusY: number, depth: number): string {
  return [
    `M ${-radiusX} ${-depth}`,
    `A ${radiusX} ${radiusY} 0 0 0 ${radiusX} ${-depth}`,
    `L ${radiusX} 0`,
    `A ${radiusX} ${radiusY} 0 0 1 ${-radiusX} 0`,
    "Z"
  ].join(" ");
}

function buildStarPath(outerRadius: number, innerRadius: number): string {
  const points: Point[] = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = (-Math.PI / 2) + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  }

  return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { getLegalMoves } from "./game/engine";
import type { Board } from "./game/types";
import { useGameStore } from "./store/useGameStore";

describe("App integration", () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("plays alternating turns in two-player mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Two Players" }));
    expect(await screen.findByText("Red to move")).toBeInTheDocument();

    await user.click(screen.getByTestId("square-5-0"));
    await user.click(screen.getByTestId("square-4-1"));
    expect(await screen.findByText("Blue to move")).toBeInTheDocument();

    await user.click(screen.getByTestId("square-2-1"));
    await user.click(screen.getByTestId("square-3-0"));
    expect(await screen.findByText("Red to move")).toBeInTheDocument();
  });

  it("highlights and commits mandatory captures", async () => {
    const board = createCaptureBoard();
    useGameStore.setState({
      screen: "game",
      mode: "two",
      tutorialEnabled: true,
      board,
      currentPlayer: "light",
      forcedPieceId: null,
      legalMoves: getLegalMoves(board, "light", null),
      selectedPieceId: null,
      waitingForComputer: false,
      gameOver: false,
      winner: null,
      tipIndex: 0,
      capturedFlashId: null
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("square-5-2"));
    expect(screen.getByTestId("square-3-4")).toHaveClass("hint-capture");

    await user.click(screen.getByTestId("square-3-4"));
    expect(await screen.findByText("Red wins!")).toBeInTheDocument();
  });

  it("computer chains forced jumps in one-player mode", async () => {
    vi.useFakeTimers();

    const board = createDarkDoubleJumpBoard();
    useGameStore.setState({
      screen: "game",
      mode: "one",
      tutorialEnabled: false,
      board,
      currentPlayer: "dark",
      forcedPieceId: null,
      legalMoves: getLegalMoves(board, "dark", null),
      selectedPieceId: null,
      waitingForComputer: false,
      gameOver: false,
      winner: null,
      tipIndex: 0,
      capturedFlashId: null
    });

    render(<App />);

    await vi.advanceTimersByTimeAsync(1300);
    await vi.advanceTimersByTimeAsync(1300);

    const state = useGameStore.getState();
    expect(state.board[3][2]).toBeNull();
    expect(state.board[5][4]).toBeNull();
    expect(state.board[6][5]?.player).toBe("dark");
    expect(state.forcedPieceId).toBeNull();
    expect(state.currentPlayer).toBe("light");
    expect(state.gameOver).toBe(false);
  });
});

function createCaptureBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[5][2] = { id: 1, player: "light", king: false };
  board[4][3] = { id: 2, player: "dark", king: false };
  return board;
}

function createDarkDoubleJumpBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[2][1] = { id: 10, player: "dark", king: false };
  board[3][2] = { id: 11, player: "light", king: false };
  board[5][4] = { id: 12, player: "light", king: false };
  board[7][0] = { id: 13, player: "light", king: false };
  return board;
}

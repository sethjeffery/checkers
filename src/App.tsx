import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { chooseBestMove } from "./game/engine";
import { Board } from "./components/Board";
import { BotGuide } from "./components/BotGuide";
import { useGameStore } from "./store/useGameStore";
import type { Player } from "./game/types";

type TutorialTipId = "diagonal-forward" | "must-jump" | "chain-jump" | "king-move";

const TUTORIAL_STORAGE_KEY = "checker-quest-tutorial-seen-v1";
const TUTORIAL_TIP_IDS: TutorialTipId[] = ["diagonal-forward", "must-jump", "chain-jump", "king-move"];

const TUTORIAL_TIP_MESSAGES: Record<TutorialTipId, string> = {
  "diagonal-forward": "You can move any piece diagonally forwards.",
  "must-jump": "My piece is in front of yours, so you have to jump over it!",
  "chain-jump": "Keep going with that same piece. Multiple jumps must be chained in one turn.",
  "king-move": "You've got a king! They can move in any diagonal direction!"
};

const BOT_THINKING_LINES = ["Hmm...", "Watch this...", "My turn!", "Let me think...", "I have an idea..."];
const BOT_UNDER_ATTACK_LINES = [
  "Good move!",
  "My piece!",
  "I'll get you for that...",
  "You're pretty good!",
  "Nice jump."
];
const BOT_CAPTURE_LINES = ["Got one!", "I saw that move coming.", "Your piece is mine.", "That was a clean capture."];
const BOT_AFTER_MOVE_LINES = ["Your turn.", "Show me what you've got.", "Your move."];
const AI_MOVE_DELAY_MS = 1200;

export default function App() {
  const [tutorialSeen, setTutorialSeen] = useState<Set<TutorialTipId>>(() => loadTutorialTips());
  const tutorialSeenRef = useRef<Set<TutorialTipId>>(tutorialSeen);
  const [botMessage, setBotMessage] = useState("Pick a mode to begin.");
  const previousBotLineRef = useRef<string | null>(null);

  const {
    screen,
    mode,
    board,
    currentPlayer,
    forcedPieceId,
    legalMoves,
    selectedPieceId,
    waitingForComputer,
    gameOver,
    winner,
    lastMoveEvent,
    startGame,
    restartGame,
    goHome,
    selectPiece,
    commitMove,
    showHint
  } = useGameStore();

  const isHumanTurn = mode === "two" || currentPlayer === "light";
  const modeLabel = mode === "one" ? "One Player" : "Two Players";
  const firstTimeTutorialActive = tutorialSeen.size < TUTORIAL_TIP_IDS.length;

  useEffect(() => {
    tutorialSeenRef.current = tutorialSeen;
  }, [tutorialSeen]);

  const turnLabel = useMemo(() => {
    if (gameOver && winner) {
      return `${playerDisplayName(winner)} wins!`;
    }
    if (forcedPieceId) {
      return `${playerDisplayName(currentPlayer)} must continue jumping.`;
    }
    if (mode === "one" && currentPlayer === "dark") {
      return "Computer to move";
    }
    return `${playerDisplayName(currentPlayer)} to move`;
  }, [currentPlayer, forcedPieceId, gameOver, mode, winner]);

  const canShowHint = isHumanTurn && !gameOver && !waitingForComputer;

  const say = useCallback((line: string) => {
    previousBotLineRef.current = line;
    setBotMessage(line);
  }, []);

  const sayRandom = useCallback((lines: string[]) => {
    const line = pickRandomLine(lines, previousBotLineRef.current);
    previousBotLineRef.current = line;
    setBotMessage(line);
  }, []);

  const scheduleSay = useCallback(
    (line: string) => {
      const timer = window.setTimeout(() => {
        say(line);
      }, 0);
      return () => {
        window.clearTimeout(timer);
      };
    },
    [say]
  );

  const maybeShowTutorialTip = useCallback(
    (tipId: TutorialTipId): boolean => {
      if (tutorialSeenRef.current.has(tipId)) {
        return false;
      }

      const next = new Set(tutorialSeenRef.current);
      next.add(tipId);
      tutorialSeenRef.current = next;
      saveTutorialTips(next);
      setTutorialSeen(next);
      say(TUTORIAL_TIP_MESSAGES[tipId]);
      return true;
    },
    [say]
  );

  useEffect(() => {
    if (screen !== "game") {
      return;
    }
    const message = firstTimeTutorialActive
      ? "Hi, I am Coach Bot. I will guide your first game."
      : mode === "one"
        ? "Your move."
        : "Red starts. Good luck!";
    const timer = window.setTimeout(() => {
      say(message);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [firstTimeTutorialActive, mode, say, screen]);

  useEffect(() => {
    if (screen !== "game" || mode !== "one" || currentPlayer !== "dark" || gameOver) {
      return;
    }

    const snapshot = useGameStore.getState();
    if (snapshot.waitingForComputer) {
      return;
    }

    snapshot.setWaitingForComputer(true);
    const timer = window.setTimeout(() => {
      const state = useGameStore.getState();
      const move = chooseBestMove(state.legalMoves, state.board, state.currentPlayer);
      state.setWaitingForComputer(false);
      if (move) {
        state.commitMove(move);
      }
    }, AI_MOVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentPlayer, gameOver, legalMoves, mode, screen]);

  useEffect(() => {
    if (screen !== "game" || mode !== "one" || !waitingForComputer || gameOver) {
      return;
    }
    sayRandom(BOT_THINKING_LINES);
    const timer = window.setInterval(() => {
      sayRandom(BOT_THINKING_LINES);
    }, 1150);
    return () => {
      window.clearInterval(timer);
    };
  }, [gameOver, mode, sayRandom, screen, waitingForComputer]);

  useEffect(() => {
    if (screen !== "game" || gameOver || waitingForComputer || !isHumanTurn) {
      return;
    }

    if (forcedPieceId && maybeShowTutorialTip("chain-jump")) {
      return;
    }

    if (legalMoves.some((move) => move.capture) && maybeShowTutorialTip("must-jump")) {
      return;
    }

    maybeShowTutorialTip("diagonal-forward");
  }, [forcedPieceId, gameOver, isHumanTurn, legalMoves, maybeShowTutorialTip, screen, waitingForComputer]);

  useEffect(() => {
    if (screen !== "game" || !lastMoveEvent) {
      return;
    }

    if (lastMoveEvent.promoted && lastMoveEvent.mover === "light" && maybeShowTutorialTip("king-move")) {
      return;
    }

    if (gameOver && winner) {
      return scheduleSay(`${playerDisplayName(winner)} wins! Want another round?`);
    }

    if (mode !== "one") {
      if (lastMoveEvent.capture) {
        return scheduleSay("Nice capture.");
      }
      return;
    }

    if (lastMoveEvent.mover === "light") {
      if (lastMoveEvent.capture) {
        sayRandom(BOT_UNDER_ATTACK_LINES);
      } else if (lastMoveEvent.promoted) {
        return scheduleSay("Great king! That piece can move diagonally both ways now.");
      }
      return;
    }

    if (lastMoveEvent.capture) {
      sayRandom(BOT_CAPTURE_LINES);
      return;
    }
    if (lastMoveEvent.promoted) {
      return scheduleSay("I have a king now. It can move diagonally in any direction.");
    }
    if (lastMoveEvent.forcedContinuation) {
      return scheduleSay("I still have another jump.");
    }
    sayRandom(BOT_AFTER_MOVE_LINES);
  }, [gameOver, lastMoveEvent, mode, maybeShowTutorialTip, sayRandom, scheduleSay, screen, winner]);

  function handleStart(modeToStart: "one" | "two") {
    startGame(modeToStart, true);
  }

  function handleHint() {
    if (!canShowHint) {
      return;
    }
    const hint = showHint();
    if (!hint) {
      return;
    }
    if (hint.capture) {
      say("Try the highlighted jump.");
      return;
    }
    say("Try the highlighted move.");
  }

  function handleAskBot() {
    if (gameOver && winner) {
      say(`${playerDisplayName(winner)} won this round. Tap Restart for another game.`);
      return;
    }
    if (waitingForComputer && mode === "one") {
      sayRandom(BOT_THINKING_LINES);
      return;
    }
    if (!isHumanTurn) {
      say("My turn now. Watch this move.");
      return;
    }
    if (forcedPieceId) {
      say("Use the same glowing piece and keep jumping.");
      return;
    }
    if (legalMoves.some((move) => move.capture)) {
      say("A jump is open, so you must capture.");
      return;
    }
    if (selectedPieceId) {
      say("Drop your selected piece on one of the highlighted squares.");
      return;
    }
    say("Pick a glowing piece and move diagonally forward.");
  }

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {screen === "title" ? (
          <motion.section
            key="title"
            className="screen active"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.28 }}
          >
            <div className="card title-card">
              <p className="eyebrow">Welcome To</p>
              <h1>Checker Quest</h1>
              <p className="subtitle">
                An isometric 2.5D draughts board with a live coach bot to guide new players.
              </p>
              <div className="title-actions">
                <button type="button" className="big-btn" onClick={() => handleStart("one")}>
                  One Player
                </button>
                <button type="button" className="big-btn alt" onClick={() => handleStart("two")}>
                  Two Players
                </button>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="game"
            className="screen active"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.24 }}
          >
            <div className="hud card">
              <div>
                <h2>{firstTimeTutorialActive ? `${modeLabel} + Guided Bot` : modeLabel}</h2>
                <p id="turn-text">{turnLabel}</p>
              </div>
              <div className="hud-actions">
                <button type="button" onClick={restartGame}>
                  Restart
                </button>
                <button type="button" onClick={goHome}>
                  Home
                </button>
              </div>
            </div>

            <div className="game-stage">
              <Board
                board={board}
                legalMoves={legalMoves}
                selectedPieceId={selectedPieceId}
                forcedPieceId={forcedPieceId}
                currentPlayer={currentPlayer}
                isHumanTurn={isHumanTurn}
                waitingForComputer={waitingForComputer}
                onSelectPiece={selectPiece}
                onCommitMove={commitMove}
              />
              <BotGuide message={botMessage} onAsk={handleAskBot} onHint={handleHint} canHint={canShowHint} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function loadTutorialTips(): Set<TutorialTipId> {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return new Set<TutorialTipId>();
  }
  try {
    const raw = storage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) {
      return new Set<TutorialTipId>();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<TutorialTipId>();
    }
    const filtered = parsed.filter((tip): tip is TutorialTipId => TUTORIAL_TIP_IDS.includes(tip as TutorialTipId));
    return new Set<TutorialTipId>(filtered);
  } catch {
    return new Set<TutorialTipId>();
  }
}

function saveTutorialTips(seen: Set<TutorialTipId>) {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return;
  }
  storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(Array.from(seen.values())));
}

function getSafeLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storage = window.localStorage as Partial<Storage> | undefined;
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return null;
  }

  return storage as Storage;
}

function pickRandomLine(lines: string[], previousLine: string | null): string {
  const pool = lines.filter((line) => line !== previousLine);
  const choices = pool.length ? pool : lines;
  const index = Math.floor(Math.random() * choices.length);
  return choices[index] ?? lines[0];
}

function playerDisplayName(player: Player): string {
  return player === "light" ? "Red" : "Blue";
}

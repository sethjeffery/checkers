import { useEffect, useState } from "react";

interface BotGuideProps {
  message: string;
  onAsk: () => void;
  onHint: () => void;
  canHint: boolean;
}

export function BotGuide({ message, onAsk, onHint, canHint }: BotGuideProps) {
  const [typedMessage, setTypedMessage] = useState(message);

  useEffect(() => {
    let active = true;
    let stepTimer: number | null = null;

    const kickoff = window.setTimeout(() => {
      setTypedMessage("");
      let index = 0;

      const typeNext = () => {
        if (!active) {
          return;
        }
        index += 1;
        setTypedMessage(message.slice(0, index));
        if (index < message.length) {
          const nextDelay = message[index - 1] === " " ? 16 : 24;
          stepTimer = window.setTimeout(typeNext, nextDelay);
        }
      };

      stepTimer = window.setTimeout(typeNext, 70);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      if (stepTimer !== null) {
        window.clearTimeout(stepTimer);
      }
    };
  }, [message]);

  return (
    <div className="bot-guide" role="status" aria-live="polite">
      <div className="bot-avatar" aria-hidden="true">
        <div className="bot-head">
          <span className="bot-eye bot-eye-left" />
          <span className="bot-eye bot-eye-right" />
          <span className="bot-mouth" />
        </div>
      </div>
      <div className="bot-bubble card">
        <h3>Coach Bot</h3>
        <p>
          <span className={`bot-typed${typedMessage.length < message.length ? " typing" : ""}`}>{typedMessage}</span>
        </p>
        <div className="bot-actions">
          <button type="button" onClick={onAsk}>
            What now?
          </button>
          <button type="button" onClick={onHint} disabled={!canHint}>
            Show Hint
          </button>
        </div>
      </div>
    </div>
  );
}

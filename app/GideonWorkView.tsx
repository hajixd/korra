"use client";

import { useEffect } from "react";

type GideonWorkViewProps = {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  thinkingStage: string;
  stagePlan: string[];
  latestPrompt: string;
  latestResponse: string;
  latestTools: string[];
  latestChartCount: number;
  latestAnimationCount: number;
  latestChecklistCount: number;
  latestHasStrategyDraft: boolean;
  latestCannotAnswer: boolean;
  symbol: string;
  timeframe: string;
  candleCount: number;
  historyCount: number;
  actionCount: number;
};

const formatCount = (value: number): string => value.toLocaleString("en-US");

export default function GideonWorkView({
  open,
  onClose,
  isPending,
  thinkingStage,
  stagePlan,
  latestPrompt,
  latestResponse,
  latestTools,
  latestChartCount,
  latestAnimationCount,
  latestChecklistCount,
  latestHasStrategyDraft,
  latestCannotAnswer,
  symbol,
  timeframe,
  candleCount,
  historyCount,
  actionCount
}: GideonWorkViewProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="gideon-workview" role="dialog" aria-modal="true" aria-label="Gideon work view">
      <button
        type="button"
        className="gideon-workview__backdrop"
        onClick={onClose}
        aria-label="Close work view"
      />
      <div className="gideon-workview__panel">
        <header className="gideon-workview__header">
          <div>
            <strong>Gideon Work View</strong>
            <span>{isPending ? "Thinking" : "Idle"}</span>
          </div>
          <button type="button" className="gideon-workview__close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="gideon-workview__grid">
          <section className="gideon-workview__card">
            <h3>Status</h3>
            <div className="gideon-workview__row">
              <span>Stage</span>
              <strong>{thinkingStage || "—"}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Symbol</span>
              <strong>{symbol}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Timeframe</span>
              <strong>{timeframe}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Charts</span>
              <strong>{formatCount(latestChartCount)}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Animations</span>
              <strong>{formatCount(latestAnimationCount)}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Checklists</span>
              <strong>{formatCount(latestChecklistCount)}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Strategy Draft</span>
              <strong>{latestHasStrategyDraft ? "Yes" : "No"}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Blocked</span>
              <strong>{latestCannotAnswer ? "Yes" : "No"}</strong>
            </div>
          </section>

          <section className="gideon-workview__card">
            <h3>Context</h3>
            <div className="gideon-workview__row">
              <span>Candles</span>
              <strong>{formatCount(candleCount)}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Trades</span>
              <strong>{formatCount(historyCount)}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Actions</span>
              <strong>{formatCount(actionCount)}</strong>
            </div>
            <div className="gideon-workview__row">
              <span>Tools Used</span>
              <strong>{latestTools.length > 0 ? latestTools.join(", ") : "—"}</strong>
            </div>
          </section>

          <section className="gideon-workview__card">
            <h3>Plan</h3>
            {stagePlan.length > 0 ? (
              <ul className="gideon-workview__list">
                {stagePlan.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="gideon-workview__muted">No active plan.</p>
            )}
          </section>

          <section className="gideon-workview__card">
            <h3>Latest Prompt</h3>
            <p className="gideon-workview__copy">{latestPrompt || "—"}</p>
          </section>

          <section className="gideon-workview__card">
            <h3>Latest Response</h3>
            <p className="gideon-workview__copy">{latestResponse || "—"}</p>
          </section>
        </div>
      </div>

      <style jsx>{`
        .gideon-workview {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .gideon-workview__backdrop {
          position: absolute;
          inset: 0;
          background: rgba(5, 8, 14, 0.72);
          border: 0;
          cursor: pointer;
        }

        .gideon-workview__panel {
          position: relative;
          width: min(960px, 92vw);
          max-height: 86vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          background: var(--bg-elev);
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
        }

        .gideon-workview__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.4rem 0.2rem;
        }

        .gideon-workview__header strong {
          display: block;
          font-size: 1rem;
        }

        .gideon-workview__header span {
          display: block;
          color: var(--text-dim);
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        .gideon-workview__close {
          border: 1px solid var(--line);
          background: transparent;
          color: var(--text);
          border-radius: 10px;
          padding: 0.35rem 0.75rem;
          cursor: pointer;
          font-size: 0.75rem;
        }

        .gideon-workview__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
          padding: 0 1.4rem 1.4rem;
          overflow: auto;
        }

        .gideon-workview__card {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 0.75rem 0.85rem;
          background: rgba(9, 12, 18, 0.9);
        }

        .gideon-workview__card h3 {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-dim);
          margin: 0 0 0.5rem;
        }

        .gideon-workview__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.82rem;
          margin-bottom: 0.4rem;
        }

        .gideon-workview__row strong {
          font-weight: 600;
        }

        .gideon-workview__list {
          margin: 0;
          padding-left: 1rem;
          font-size: 0.8rem;
          color: var(--text);
        }

        .gideon-workview__muted {
          margin: 0;
          color: var(--text-dim);
          font-size: 0.8rem;
        }

        .gideon-workview__copy {
          margin: 0;
          color: var(--text);
          font-size: 0.82rem;
          line-height: 1.4;
          max-height: 9rem;
          overflow: auto;
          white-space: pre-wrap;
        }

        @media (max-width: 640px) {
          .gideon-workview__header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.6rem;
          }

          .gideon-workview__close {
            align-self: flex-end;
          }
        }
      `}</style>
    </div>
  );
}

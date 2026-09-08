import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The travel assistant, available from every page.
 *
 * Answers come from `/api/assistant/chat`, which builds them from the app's own
 * catalogue and the signed-in traveller's trips. The records behind a factual
 * answer come back with it and are shown underneath, so a traveller can see
 * where a recommendation came from rather than having to trust it.
 *
 * Kept in its own file rather than added to App.jsx, which is already long
 * enough that another panel would be hard to find.
 */

const API_BASE = '/api';

/**
 * One turn of the conversation.
 *
 * Declared at module scope: a component defined inside a render body is a new
 * type on every render, so React would tear down and rebuild the whole
 * transcript each time a character is typed.
 */
function Turn({ turn }) {
  const fromAssistant = turn.role === 'assistant';
  return (
    <div className={`assistant-turn assistant-turn-${turn.role}`}>
      <div className="assistant-bubble">
        {turn.text.split('\n').map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>

      {fromAssistant && turn.sources?.length > 0 && (
        <div className="assistant-sources">
          <p className="assistant-sources-label">From the catalogue</p>
          <ul>
            {turn.sources.map((source) => (
              <li key={source.id || source.name}>
                {source.image_url && (
                  <img src={source.image_url} alt="" loading="lazy" decoding="async" />
                )}
                <span>
                  <strong>{source.name}</strong>
                  {source.location && <em>{source.location}</em>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TravelAssistant({ token }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState([]);
  const [starters, setStarters] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const transcriptRef = useRef(null);
  const inputRef = useRef(null);

  // Fetched once the panel is first opened rather than on page load, so the
  // assistant costs nothing to anyone who never uses it.
  useEffect(() => {
    if (!open || turns.length > 0) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/assistant/starters`);
        if (!response.ok) throw new Error('starters unavailable');
        const result = await response.json();
        if (cancelled) return;
        setTurns([{ role: 'assistant', text: result.greeting, sources: [] }]);
        setStarters(result.starters || []);
      } catch {
        if (cancelled) return;
        setTurns([{
          role: 'assistant',
          text: 'Ask me about places to visit in Cameroon, what a trip might cost, or how anything in the app works.',
          sources: [],
        }]);
      }
    })();

    return () => { cancelled = true; };
  }, [open, turns.length]);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, thinking]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel, which is what a keyboard user will try first.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const send = useCallback(async (message) => {
    const question = message.trim();
    if (!question || thinking) return;

    setTurns((current) => [...current, { role: 'user', text: question, sources: [] }]);
    setDraft('');
    setStarters([]);
    setSuggestions([]);
    setThinking(true);

    try {
      const response = await fetch(`${API_BASE}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Sent when signed in so the assistant can answer about your trips.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: question }),
      });
      const result = await response.json();

      if (!response.ok) {
        setTurns((current) => [...current, {
          role: 'assistant',
          text: result.error || 'Something went wrong. Please try again.',
          sources: [],
        }]);
        return;
      }

      setTurns((current) => [...current, {
        role: 'assistant',
        text: result.reply,
        sources: result.sources || [],
      }]);
      setSuggestions(result.suggestions || []);
    } catch {
      setTurns((current) => [...current, {
        role: 'assistant',
        text: 'I could not reach the server. Check your connection and try again.',
        sources: [],
      }]);
    } finally {
      setThinking(false);
    }
  }, [token, thinking]);

  const chips = suggestions.length > 0 ? suggestions : starters;

  return (
    <>
      <button
        type="button"
        className="assistant-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="travel-assistant-panel"
        aria-label={open ? 'Close the travel assistant' : 'Open the travel assistant'}
      >
        {open ? '✕' : '💬'}
        {!open && <span>Ask</span>}
      </button>

      {open && (
        <section
          id="travel-assistant-panel"
          className="assistant-panel"
          aria-label="Travel assistant"
        >
          <header className="assistant-header">
            <div>
              <strong>Travel assistant</strong>
              <p>Answers from this app's Cameroon catalogue</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the travel assistant"
              className="assistant-close"
            >
              ✕
            </button>
          </header>

          <div className="assistant-transcript" ref={transcriptRef} aria-live="polite">
            {turns.map((turn, index) => (
              <Turn key={index} turn={turn} />
            ))}

            {thinking && (
              <div className="assistant-turn assistant-turn-assistant">
                <div className="assistant-bubble assistant-thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {chips.length > 0 && !thinking && (
            <div className="assistant-chips">
              {chips.slice(0, 4).map((chip) => (
                <button key={chip} type="button" onClick={() => send(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          )}

          <form
            className="assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <label className="visually-hidden" htmlFor="assistant-input">
              Ask the travel assistant a question
            </label>
            <input
              id="assistant-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about a place, a cost, or the app…"
              maxLength={500}
              autoComplete="off"
            />
            <button
              type="submit"
              className="button button-primary"
              disabled={thinking || !draft.trim()}
            >
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}

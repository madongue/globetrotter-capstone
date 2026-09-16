import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { Button } from './ui';
import * as api from '../lib/api';
import './assistant-dock.css';

/**
 * The assistant, on every screen.
 *
 * It answers from the application's own data — the catalogue, your trips, and
 * for an administrator the review queue and the account list — so it can say
 * "that is not in the catalogue" instead of inventing a waterfall.
 *
 * It also proposes what to do next, and the proposals depend on who is asking:
 * an administrator asking about pending suggestions is offered the review
 * queue, and a traveller asking the same question is not offered it and is not
 * told it exists. The server decides that, from the role on the account; this
 * component only renders what it is given.
 *
 * The bot never performs an action. Every proposal is a link the person
 * chooses to follow. A bot that acted on its own reading of a sentence would
 * eventually approve the wrong suggestion, and the click costs nothing.
 */

const GREETING = {
  from: 'bot',
  text:
    'Ask me about travelling in Cameroon, or about anything in this app. '
    + 'I answer from what is actually here, so I will tell you when something is not.',
};

/** Screens with nothing to ask about yet. */
const HIDDEN_ON = ['/login', '/register'];

export default function AssistantDock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [actions, setActions] = useState([]);
  const [starters, setStarters] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (starters.length === 0) {
      api.assistantStarters()
        .then((payload) => setStarters(payload?.starters || payload?.questions || []))
        .catch(() => { /* the box works without them */ });
    }
  }, [open, starters.length]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open]);

  // Escape closes it, which is what people try first.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (question) => {
    const text = (question || draft).trim();
    if (!text || busy) return;

    setMessages((current) => [...current, { from: 'you', text }]);
    setDraft('');
    setBusy(true);

    try {
      const reply = await api.askAssistant(text);
      setMessages((current) => [...current, { from: 'bot', text: reply.reply }]);
      setActions(reply.actions || []);
    } catch (error) {
      setMessages((current) => [...current, {
        from: 'bot',
        text: error.message || 'I could not reach the server just then. Try again?',
        failed: true,
      }]);
      setActions([]);
    } finally {
      setBusy(false);
    }
  };

  const follow = (path) => { setOpen(false); navigate(path); };

  if (HIDDEN_ON.includes(pathname)) return null;

  if (!open) {
    return (
      <button type="button" className="dock__open" onClick={() => setOpen(true)}>
        <MessageCircle size={18} aria-hidden="true" />
        <span>Ask</span>
      </button>
    );
  }

  return (
    <aside className="dock" role="dialog" aria-label="Travel assistant">
      <header className="dock__head">
        <span className="dock__title">
          <Sparkles size={16} aria-hidden="true" /> Assistant
        </span>
        <button
          type="button"
          className="dock__close"
          onClick={() => setOpen(false)}
          aria-label="Close the assistant"
        >
          <X size={16} />
        </button>
      </header>

      <div className="dock__log">
        {messages.map((message, index) => (
          <p
            key={index}
            className={[
              'dock__msg',
              message.from === 'you' ? 'dock__msg--you' : 'dock__msg--bot',
              message.failed ? 'dock__msg--failed' : '',
            ].filter(Boolean).join(' ')}
          >
            {/* The server sends plain text with newlines for its lists. */}
            {message.text}
          </p>
        ))}

        {busy && <p className="dock__msg dock__msg--bot dock__typing">Thinking…</p>}

        {/* What this role could do next. Rendered after the latest answer,
            because that is what they are about. */}
        {!busy && actions.length > 0 && (
          <div className="dock__actions">
            <p className="dock__actions-label">You can</p>
            {actions.map((action) => (
              <button
                key={action.id || action.path}
                type="button"
                className="dock__action"
                onClick={() => follow(action.path)}
              >
                {action.label}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {messages.length === 1 && starters.length > 0 && (
          <div className="dock__starters">
            {starters.slice(0, 4).map((starter) => (
              <button
                key={starter}
                type="button"
                className="dock__starter"
                onClick={() => ask(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        <span ref={endRef} />
      </div>

      <form
        className="dock__ask"
        onSubmit={(event) => { event.preventDefault(); ask(); }}
      >
        <input
          ref={inputRef}
          className="dock__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask anything…"
          aria-label="Ask the assistant"
          maxLength={500}
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()} aria-label="Send">
          <Send size={15} aria-hidden="true" />
        </Button>
      </form>
    </aside>
  );
}

import { FormEvent, useState } from 'react';
import * as settings from '../../settings';

type Action = 'add' | 'remove';
type Status = 'idle' | 'submitting' | 'success' | 'error';

const CONNECT_CODE_RE = /^[A-Z0-9]+#[0-9]+$/;

const inputClassName = 'w-full px-2 py-1.5 rounded bg-gray-900 text-gray-100 placeholder-gray-500 border border-gray-600 focus:outline-none focus:border-indigo-400 text-sm';
const labelClassName = 'text-xs text-gray-400';

export function TagRequestForm() {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>('add');
  const [connectCode, setConnectCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [context, setContext] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = connectCode.trim().toUpperCase();

    if (!CONNECT_CODE_RE.test(normalizedCode)) {
      setStatus('error');
      setErrorMessage('Enter a valid connect code, e.g. ABCD#123.');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch(settings.tagRequestUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          connectCode: normalizedCode,
          displayName: displayName.trim(),
          context: context.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setConnectCode('');
      setDisplayName('');
      setContext('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 hover:text-indigo-400 hover:underline mb-2"
      >
        Request a tag be added or removed
      </button>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-sm text-gray-300 mb-2 text-center">
        Thanks! Your request has been sent.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-xs mb-3 p-3 rounded bg-gray-800 border border-gray-600 flex flex-col gap-2"
    >
      <label className={labelClassName} htmlFor="tag-request-action">
        What would you like?
        <select
          id="tag-request-action"
          className={inputClassName}
          value={action}
          onChange={(e) => setAction(e.target.value as Action)}
        >
          <option value="add">Add a tag</option>
          <option value="remove">Remove a tag</option>
        </select>
      </label>

      <label className={labelClassName} htmlFor="tag-request-code">
        Slippi connect code
        <input
          id="tag-request-code"
          type="text"
          required
          value={connectCode}
          onChange={(e) => setConnectCode(e.target.value)}
          placeholder="ABCD#123"
          className={inputClassName}
        />
      </label>

      <label className={labelClassName} htmlFor="tag-request-name">
        Player name (optional)
        <input
          id="tag-request-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClassName}
        />
      </label>

      <label className={labelClassName} htmlFor="tag-request-context">
        Anything else we should know? (optional)
        <textarea
          id="tag-request-context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          className={inputClassName}
        />
      </label>

      {status === 'error' && (
        <div className="text-xs text-red-400">{errorMessage}</div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:underline"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/costasford/NorcalSlippiLeaderboard/issues/new?template=tag-request.yml"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 hover:text-indigo-400 hover:underline"
          >
            or use GitHub
          </a>
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="text-sm px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            {status === 'submitting' ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  );
}

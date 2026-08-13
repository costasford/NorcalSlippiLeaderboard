import {
  render, screen, fireEvent, waitFor,
} from '@testing-library/react';
import { TagRequestForm } from '../TagRequestForm';

jest.mock('../../../settings', () => ({
  tagRequestUrl: 'https://example.test/tag-request',
}));

const openForm = () => {
  render(<TagRequestForm />);
  fireEvent.click(screen.getByText('Request a tag be added or removed'));
};

const fillConnectCode = (value: string) => {
  fireEvent.change(screen.getByLabelText('Slippi connect code'), { target: { value } });
};

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('TagRequestForm', () => {
  it('starts collapsed, showing only the toggle', () => {
    render(<TagRequestForm />);
    expect(screen.getByText('Request a tag be added or removed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Slippi connect code')).not.toBeInTheDocument();
  });

  it('expands to show the form fields when clicked', () => {
    openForm();
    expect(screen.getByLabelText('What would you like?')).toBeInTheDocument();
    expect(screen.getByLabelText('Slippi connect code')).toBeInTheDocument();
    expect(screen.getByLabelText('Player name (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Anything else we should know? (optional)')).toBeInTheDocument();
  });

  it('still offers a GitHub Issues link for people who prefer it', () => {
    openForm();
    const link = screen.getByText('or use GitHub');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/costasford/NorcalSlippiLeaderboard/issues/new?template=tag-request.yml',
    );
  });

  it('collapses back to the toggle when Cancel is clicked', () => {
    openForm();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Request a tag be added or removed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Slippi connect code')).not.toBeInTheDocument();
  });

  it('rejects an invalid connect code without calling fetch', async () => {
    openForm();
    fillConnectCode('not a code');
    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('Enter a valid connect code, e.g. ABCD#123.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('submits the expected payload for a valid request', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    openForm();
    fireEvent.change(screen.getByLabelText('What would you like?'), { target: { value: 'remove' } });
    fillConnectCode('abcd#123');
    fireEvent.change(screen.getByLabelText('Player name (optional)'), { target: { value: 'Test Player' } });
    fireEvent.change(
      screen.getByLabelText('Anything else we should know? (optional)'),
      { target: { value: 'this is me' } },
    );
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://example.test/tag-request');
    expect(JSON.parse(options.body)).toEqual({
      action: 'remove',
      connectCode: 'ABCD#123',
      displayName: 'Test Player',
      context: 'this is me',
    });
  });

  it('shows a success message and resets the form after a successful submission', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    openForm();
    fillConnectCode('abcd#123');
    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('Thanks! Your request has been sent.')).toBeInTheDocument();
  });

  it('shows the server-provided error message on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Too many requests. Please try again later.' }),
    });

    openForm();
    fillConnectCode('abcd#123');
    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('Too many requests. Please try again later.')).toBeInTheDocument();
  });
});

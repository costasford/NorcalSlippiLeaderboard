import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('../routes/home/HomePage', () => ({
  __esModule: true,
  default: () => <div>HomePage rendered</div>,
}));

describe('App', () => {
  it('renders HomePage at the root hash route with no basename mismatch warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByText('HomePage rendered')).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('does not begin with the basename'),
    );
    warnSpy.mockRestore();
  });
});

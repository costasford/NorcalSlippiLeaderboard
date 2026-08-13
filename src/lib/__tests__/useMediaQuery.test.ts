import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';

const mockMatchMedia = (matches: boolean) => {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const mql = {
    matches,
    media: '',
    addEventListener: jest.fn((_event: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: jest.fn(),
  };
  window.matchMedia = jest.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return { mql, listeners };
};

describe('useMediaQuery', () => {
  it('returns true when the query matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the media query change event fires', () => {
    const { listeners } = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'));
    expect(result.current).toBe(false);

    act(() => {
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });

    expect(result.current).toBe(true);
  });

  it('removes the change listener on unmount', () => {
    const { mql } = mockMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 640px)'));
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('queries matchMedia with the exact string provided', () => {
    mockMatchMedia(true);
    renderHook(() => useMediaQuery('(min-width: 999px)'));
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 999px)');
  });
});

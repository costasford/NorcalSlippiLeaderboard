import React from 'react';
import { render, screen } from '@testing-library/react';
import { Character } from '../Character';

// react-tooltip ships an ESM-only bundle Jest can't parse without extra
// transform config, and react-circular-progressbar's SVG rendering isn't
// what's under test here - both are mocked so we can focus on Character's
// own logic (icon selection, percentage math, tooltip content).
jest.mock('react-tooltip', () => ({
  Tooltip: () => null,
}));

jest.mock('react-circular-progressbar', () => ({
  CircularProgressbarWithChildren: (
    { children }: { children: React.ReactNode },
  ) => <div>{children}</div>,
  buildStyles: () => ({}),
}));

describe('Character', () => {
  it('renders the character icon with alt text', () => {
    render(<Character id="test-1" totalGames={10} stats={{ character: 'FOX', gameCount: 5 }} />);
    expect(screen.getByAltText('FOX icon')).toBeInTheDocument();
  });

  it('falls back to the unknown icon without crashing for an unrecognized character', () => {
    render(<Character id="test-1" totalGames={10} stats={{ character: 'MYSTERY_CHAR', gameCount: 5 }} />);
    expect(screen.getByAltText('MYSTERY_CHAR icon')).toBeInTheDocument();
  });

  it('builds a unique id from the character and player id', () => {
    const { container } = render(
      <Character id="abcd-1" totalGames={10} stats={{ character: 'FOX', gameCount: 5 }} />,
    );
    expect(container.querySelector('#FOXabcd-1')).toBeInTheDocument();
  });

  it('embeds the game count and percentage in the tooltip content, pluralized', () => {
    const { container } = render(
      <Character id="test-1" totalGames={20} stats={{ character: 'FOX', gameCount: 5 }} />,
    );
    const tooltipHost = container.querySelector('[data-tooltip-html]');
    expect(tooltipHost?.getAttribute('data-tooltip-html')).toBe(
      '<div>5 games</div><div>25%</div>',
    );
  });

  it('uses singular "game" for a single-game count', () => {
    const { container } = render(
      <Character id="test-1" totalGames={20} stats={{ character: 'FOX', gameCount: 1 }} />,
    );
    const tooltipHost = container.querySelector('[data-tooltip-html]');
    expect(tooltipHost?.getAttribute('data-tooltip-html')).toBe(
      '<div>1 game</div><div>5%</div>',
    );
  });
});

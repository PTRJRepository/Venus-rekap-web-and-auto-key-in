/**
 * Unit tests for `components/MatrixCell.tsx`.
 *
 * Covers:
 *   1. Each of the 6 statuses renders the matching MUI icon.
 *   2. `status: null` renders no icon (req 6.9).
 *   3. Tooltip honors the 300 ms `enterDelay` (req 7.3) — uses fake timers
 *      and `userEvent.setup({ advanceTimers })` so MUI's internal hover
 *      timeout is driven by the test clock.
 *   4. Click forwards the cell DOM element (HTMLElement) to `onClick` so
 *      the popover can anchor to it (req 8.1).
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10,
 *            7.1, 7.2, 7.3, 7.5, 8.1, 15.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import { MatrixCell } from '../components/MatrixCell';
import type { MatrixCellProps } from '../components/MatrixCell';
import type { AttendanceStatus } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<MatrixCellProps> = {}): MatrixCellProps {
  return {
    status: 'present',
    isWeekend: false,
    isSaturday: false,
    isSunday: false,
    isSelected: false,
    isRowHovered: false,
    isColHovered: false,
    width: 34,
    height: 44,
    ariaLabel: 'Budi · 5 Mei 2026 · Hadir',
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onClick: () => {},
    ...overrides,
  };
}

/**
 * MUI's `createSvgIcon` attaches `data-testid="${displayName}Icon"` in
 * non-production builds. We assert presence by that test id, which is the
 * stable, documented identifier per MUI internals.
 */
const STATUS_TO_ICON_TESTID: Record<AttendanceStatus, string> = {
  present: 'CheckCircleRoundedIcon',
  alpha: 'ErrorRoundedIcon',
  leave: 'FlightRoundedIcon',
  sick: 'MedicalServicesRoundedIcon',
  late: 'AccessTimeRoundedIcon',
  off: 'RemoveRoundedIcon',
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('MatrixCell — status icon rendering', () => {
  afterEach(() => cleanup());

  it.each(Object.entries(STATUS_TO_ICON_TESTID) as Array<
    [AttendanceStatus, string]
  >)(
    'renders the matching icon for status %s',
    (status, expectedTestId) => {
      render(<MatrixCell {...makeProps({ status })} />);
      expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
    },
  );

  it('renders no icon when status is null (req 6.9)', () => {
    const { container } = render(
      <MatrixCell {...makeProps({ status: null })} />,
    );
    // No SVG element should be present inside the cell.
    expect(container.querySelector('svg')).toBeNull();
    // And none of the known status icon test ids should be present.
    for (const tid of Object.values(STATUS_TO_ICON_TESTID)) {
      expect(screen.queryByTestId(tid)).toBeNull();
    }
  });
});

describe('MatrixCell — tooltip 300 ms delay (req 7.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('does not show the tooltip before 300 ms but shows it at 300 ms', () => {
    const ariaLabel = 'Budi · 5 Mei 2026 · Hadir';
    render(<MatrixCell {...makeProps({ ariaLabel })} />);

    // The cell's `aria-label` matches the tooltip text; we hover it to
    // start MUI's `enterDelay` timer. MUI's Tooltip listens for the native
    // `mouseover` event (it bubbles), which fireEvent dispatches
    // synchronously — keeping the test deterministic under fake timers.
    const cell = screen.getByRole('gridcell', { name: ariaLabel });
    fireEvent.mouseOver(cell);

    // Just before 300 ms — tooltip should not yet be in the DOM.
    act(() => {
      vi.advanceTimersByTime(299);
    });
    // The visible tooltip is rendered by MUI as a separate element with
    // role="tooltip". The `aria-label` of the cell does not count.
    expect(screen.queryByRole('tooltip')).toBeNull();

    // Cross the 300 ms threshold — tooltip becomes visible. Wrap the
    // timer advance in `act` so React flushes the resulting state update.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent(ariaLabel);
  });
});

describe('MatrixCell — click forwards the cell HTMLElement (req 8.1)', () => {
  afterEach(() => cleanup());

  it('calls onClick with the gridcell HTMLElement as the anchor', () => {
    const onClick = vi.fn<(anchor: HTMLElement) => void>();
    render(<MatrixCell {...makeProps({ onClick })} />);

    const cell = screen.getByRole('gridcell');
    fireEvent.click(cell);

    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(HTMLElement);
    // The anchor must be the cell itself so popover positioning is exact.
    expect(arg).toBe(cell);
  });
});

// Feature: matrix-kehadiran-dark-redesign, Task 7.4
//
// Unit tests for `KPICard` covering:
//   - Renders title and numeric value.
//   - Preserves pre-formatted string values verbatim (e.g. "95,2%").
//   - Omits the sparkline SVG when no series is provided.
//   - Renders a `<polyline>` SVG when a sparkline series is provided.
//   - Renders the optional subtitle when supplied.
//
// Validates: Requirements 4.9, 4.10, 4.11, 15.2.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPICard } from '../components/KPICard';
import { tokens } from '../tokens';

describe('KPICard', () => {
  it('renders the title and numeric value', () => {
    render(
      <KPICard
        title="Total Karyawan"
        value={171}
        icon={<div data-testid="icon" />}
        color={tokens.accent.green}
      />,
    );

    expect(screen.getByText('Total Karyawan')).toBeInTheDocument();
    expect(screen.getByText('171')).toBeInTheDocument();
  });

  it('renders a pre-formatted string value verbatim', () => {
    render(
      <KPICard
        title="Rata-rata Kehadiran"
        value="95,2%"
        icon={<div data-testid="icon" />}
        color={tokens.accent.green}
      />,
    );

    expect(screen.getByText('95,2%')).toBeInTheDocument();
  });

  it('does not render an SVG when no sparkline is provided', () => {
    const { container } = render(
      <KPICard
        title="Alfa"
        value={3}
        icon={<div data-testid="icon" />}
        color={tokens.accent.red}
      />,
    );

    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an SVG with a polyline when a sparkline series is provided', () => {
    const { container } = render(
      <KPICard
        title="Hadir"
        value={148}
        icon={<div data-testid="icon" />}
        color={tokens.accent.green}
        sparkline={[10, 20, 30, 25, 40]}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('polyline')).not.toBeNull();
  });

  it('renders the optional subtitle when provided', () => {
    render(
      <KPICard
        title="Rata-rata Kehadiran"
        value="95,2%"
        subtitle="+2.1%"
        icon={<div data-testid="icon" />}
        color={tokens.accent.green}
      />,
    );

    expect(screen.getByText('+2.1%')).toBeInTheDocument();
  });
});

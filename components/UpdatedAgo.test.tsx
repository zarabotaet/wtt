import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAgo, UpdatedAgo } from './UpdatedAgo';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatAgo', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatAgo(12_000)).toBe('12s ago');
    expect(formatAgo(5 * 60_000 + 10_000)).toBe('5 min ago');
    expect(formatAgo(2 * 3_600_000 + 60_000)).toBe('2 h ago');
  });

  it('never shows a negative age (clock skew)', () => {
    expect(formatAgo(-5_000)).toBe('0s ago');
  });
});

describe('UpdatedAgo', () => {
  it('shows how old the snapshot is', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    render(<UpdatedAgo generatedAt={88_000} tier="live" error={null} />);
    expect(screen.getByText('Updated 12s ago')).toBeInTheDocument();
  });

  it('shows nothing for a final tournament', () => {
    const { container } = render(<UpdatedAgo generatedAt={0} tier="final" error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports a failed update', () => {
    render(<UpdatedAgo generatedAt={0} tier="live" error="HTTP 502" />);
    expect(screen.getByText('Update failed')).toBeInTheDocument();
  });
});

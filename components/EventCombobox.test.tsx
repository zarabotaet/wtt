import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCombobox } from './EventCombobox';
import type { NormalizedEvent } from '@/lib/types';

const events: NormalizedEvent[] = [
  { eventId: '1', eventName: 'Event One', startDateTime: '2026-01-01T00:00:00', endDateTime: '2026-01-02T00:00:00', status: 'past' },
  { eventId: '2', eventName: 'Event Two', startDateTime: '2026-02-01T00:00:00', endDateTime: '2026-02-02T00:00:00', status: 'past' },
];

async function openList() {
  const user = userEvent.setup();
  const input = screen.getByLabelText('Select event');
  await user.click(input);
  await user.clear(input);
}

describe('EventCombobox hover', () => {
  it('reports an option the pointer rests on, once', async () => {
    const onHover = vi.fn();
    render(<EventCombobox events={events} currentEventId="1" onSelect={vi.fn()} onHover={onHover} />);
    await openList();
    fireEvent.mouseEnter(screen.getByText('Event Two'));
    expect(onHover).not.toHaveBeenCalled();
    await waitFor(() => expect(onHover).toHaveBeenCalledWith('2'));
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('ignores an option the pointer only passes over', async () => {
    const onHover = vi.fn();
    render(<EventCombobox events={events} currentEventId="1" onSelect={vi.fn()} onHover={onHover} />);
    await openList();
    const option = screen.getByText('Event Two');
    fireEvent.mouseEnter(option);
    fireEvent.mouseLeave(option);
    await new Promise((r) => setTimeout(r, 250));
    expect(onHover).not.toHaveBeenCalled();
  });
});

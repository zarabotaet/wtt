import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoomSlider } from './ZoomSlider';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty('--card-min');
});

describe('ZoomSlider', () => {
  it('updates the --card-min CSS variable as the slider moves', () => {
    render(<ZoomSlider />);
    const slider = screen.getByLabelText('Card size');
    // Use RTL's fireEvent.change (not a manual .value assignment +
    // dispatchEvent) — it goes through the input's native value setter,
    // which is what makes React's own change-tracking notice the update.
    fireEvent.change(slider, { target: { value: '360' } });
    expect(document.documentElement.style.getPropertyValue('--card-min')).toBe('360px');
  });
});

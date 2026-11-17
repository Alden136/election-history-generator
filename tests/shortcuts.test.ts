import { describe, expect, it } from 'vitest';
import { shortcutFor } from '../src/app/shortcuts';

const press = (key: string, extra = {}) => shortcutFor({ key, modified: false, busy: false, onButton: false, ...extra });

describe('keyboard shortcuts', () => {
  it('maps the arrows and space', () => {
    expect(press('ArrowLeft')).toBe('previous');
    expect(press('ArrowRight')).toBe('next');
    expect(press(' ')).toBe('toggle');
    expect(press('a')).toBeNull();
    expect(press('ArrowUp')).toBeNull();
  });

  it('stays out of the way while typing or with a modifier held', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', ' ']) {
      expect(press(key, { busy: true })).toBeNull();
      expect(press(key, { modified: true })).toBeNull();
    }
  });

  it('leaves space to a focused button but still steps with the arrows', () => {
    expect(press(' ', { onButton: true })).toBeNull();
    expect(press('ArrowRight', { onButton: true })).toBe('next');
  });
});

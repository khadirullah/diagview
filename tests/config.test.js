import { jest } from '@jest/globals';
import { state, updateConfig, resetConfig, getConfig, DEFAULT_CONFIG } from '../src/core/config.js';

describe('Configuration System', () => {
  beforeEach(() => {
    resetConfig();
  });

  test('config has default state out of the box', () => {
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });

  test('state proxies allow modification of internal variables', () => {
    expect(state.isInitialized).toBe(false);
    state.isInitialized = true;
    expect(state.isInitialized).toBe(true);
  });

  test('updateConfig sets valid values', () => {
    updateConfig({ toastDuration: 5000 });
    expect(getConfig().toastDuration).toBe(5000);
  });

  test('updateConfig ignores invalid values', () => {
    // Mock console.warn so test output isn't noisy
    const warnMock = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    updateConfig({ highResScale: 99 }); // Invalid, max is 10
    expect(getConfig().highResScale).toBe(DEFAULT_CONFIG.highResScale);
    expect(warnMock).toHaveBeenCalled();
    
    warnMock.mockRestore();
  });
});

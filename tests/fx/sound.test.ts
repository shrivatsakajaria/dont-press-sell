import { afterEach, expect, test, vi } from 'vitest';
import { createSfx } from '../../src/fx/sound';

afterEach(() => vi.unstubAllGlobals());

type Sfx = ReturnType<typeof createSfx>;

function allCalls(s: Sfx) {
  s.unlock();
  s.tick(1);
  s.thud();
  s.till();
  s.rise(0.5);
  s.counter(0.3);
  s.payout(true);
  s.payout(false);
  s.setMuted(true);
  s.setMuted(false);
}

test('no AudioContext: every method is a no-op', () => {
  vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal('webkitAudioContext', undefined);
  expect(() => allCalls(createSfx())).not.toThrow();
});

test('calls before unlock do nothing and do not throw', () => {
  const s = createSfx();
  expect(() => {
    s.tick(1);
    s.thud();
    s.till();
    s.rise(1);
    s.counter(1);
    s.payout(true);
  }).not.toThrow();
});

function fakeCtx(resume: () => Promise<void>, state = 'running') {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: param(),
    gain: param(),
    Q: param(),
    type: '',
    buffer: null,
  });
  const created: unknown[] = [];
  class Ctx {
    state = state;
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    resume = resume;
    createOscillator() {
      const n = node();
      created.push(n);
      return n;
    }
    createGain() {
      return node();
    }
    createBiquadFilter() {
      return node();
    }
    createBufferSource() {
      const n = node();
      created.push(n);
      return n;
    }
    createBuffer(_c: number, len: number) {
      return { getChannelData: () => new Float32Array(len) };
    }
  }
  return { Ctx, created };
}

test('resume rejecting does not leave an unhandled rejection or throw', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const { Ctx } = fakeCtx(() => Promise.reject(new Error('no')), 'suspended');
  vi.stubGlobal('AudioContext', Ctx);
  const s = createSfx();
  expect(() => allCalls(s)).not.toThrow();
  await new Promise((r) => setTimeout(r, 10));
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});

test('sounds play when unlocked, and nothing plays when muted', () => {
  const { Ctx, created } = fakeCtx(() => Promise.resolve());
  vi.stubGlobal('AudioContext', Ctx);
  const s = createSfx();
  s.unlock();
  s.till();
  expect(created.length).toBeGreaterThan(0);
  const n = created.length;
  s.setMuted(true);
  s.till();
  s.thud();
  s.tick(2);
  s.rise(1);
  s.counter(1);
  s.payout(true);
  expect(created.length).toBe(n);
});

test('nothing is scheduled while the context is not running', () => {
  const { Ctx, created } = fakeCtx(() => Promise.resolve(), 'suspended');
  vi.stubGlobal('AudioContext', Ctx);
  const s = createSfx();
  s.unlock();
  s.till();
  s.thud();
  expect(created.length).toBe(0);
});

test('unlock resumes an interrupted context', () => {
  const resume = vi.fn(() => Promise.resolve());
  const { Ctx } = fakeCtx(resume, 'interrupted');
  vi.stubGlobal('AudioContext', Ctx);
  createSfx().unlock();
  expect(resume).toHaveBeenCalled();
});

// Umami events (R66-R69): a handful per game, coarse buckets only, no identifiers, no cookies.
// Nothing here may break or slow the game: every call is wrapped, and with no tracker (blocked, or not
// loaded yet) events wait in a short queue or are dropped.
import type { RunKind } from '../engine/types';
import { cell } from '../store/store';
import {
  daysBetween, daysBucket, gamesBucket, inAppFrom, leadBucket, msToStartBucket, resultSecBucket, secBucket, tens,
} from './buckets';

type Data = Record<string, string | number | boolean>;
export interface Umami {
  track(name: string, data?: Data): unknown;
}

export interface AnalyticsDeps {
  /** window.umami, read at each send (it arrives after the page, or never when blocked). */
  umami(): Umami | undefined;
  ua: string;
  /** Milliseconds since the page started loading (performance.now). */
  now(): number;
  /** Today's local date, YYYY-MM-DD. */
  today(): string;
  sound(): boolean;
}

export type Entry = 'new' | 'rematch' | 'double' | 'challenge' | 'picked';
export type ResultAction = 'rematch' | 'new' | 'double' | 'keep' | 'challenge' | 'pick' | 'collection';
export type ShareVia = 'native' | 'copy' | 'fallback' | 'card';

export interface GameInfo {
  entry: Entry;
  kind: RunKind;
  run: string;
  double: boolean;
  /** Percent of the planned game before step i begins. */
  progress(step: number): number;
}

export interface Frame {
  stepIndex: number;
  invested: boolean;
  forward: boolean;
  /** A red day (the paper floods red) is on screen. */
  red: boolean;
  trade: 'sell' | 'buy' | null;
}

export interface GameTrack {
  /** Every render of the running game; the first one is the Start press. */
  frame(f: Frame): void;
  pause(): void;
  resume(): void;
  end(r: { lead: number; trades: number; bust: boolean }): void;
}

export interface Analytics {
  flush(): void;
  game(info: GameInfo): GameTrack;
  loadError(run: string): void;
  action(a: ResultAction): void;
  revealed(): void;
  share(via: ShareVia): void;
  /** True once: right after the third finished game ever (R69). Marks the question asked. */
  feedbackDue(): boolean;
  feedback(yes: boolean): void;
  /** The page went to the background or is being left. */
  hidden(): void;
}

/**
 * Reports the exit when the page goes to the background or is left. Phones often never fire pagehide when an
 * app is swiped away, so visibility going hidden counts too; the events themselves go out once. The Umami
 * tracker sends with fetch keepalive, so a request made here survives the page closing.
 */
export function watchExit(an: Analytics, doc: EventTarget & { visibilityState: string }, win: EventTarget) {
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') an.hidden();
  });
  win.addEventListener('pagehide', () => an.hidden());
}

/** On the phone: games started (n), games finished (e), first-play day (f), feedback asked (q). */
const kept = cell<{ n: number; e: number; f: string; q: boolean }>('an', { n: 0, e: 0, f: '', q: false });
const QUEUE_MAX = 30;

export function createAnalytics(deps: AnalyticsDeps): Analytics {
  const queue: [string, Data][] = [];
  const inapp = inAppFrom(deps.ua);
  let visitGames = 0;
  let startedThisVisit = false;
  /** The game on screen (start screen or play), or the finished game whose result page is up. */
  let cur: { ctx: () => Data; quit(): void; done: boolean } | null = null;
  let result: { ctx: () => Data; at: number; revealed: boolean; sent: boolean } | null = null;

  const store = () => {
    const v = kept.get();
    return v && typeof v === 'object' ? v : { n: 0, e: 0, f: '', q: false };
  };
  const keep = (p: Partial<ReturnType<typeof store>>) => kept.set({ ...store(), ...p });

  function flush() {
    try {
      const u = deps.umami();
      if (!u || typeof u.track !== 'function') return null;
      while (queue.length) {
        const [n, d] = queue.shift()!;
        try {
          u.track(n, d);
        } catch {
          /* the tracker's own trouble is not the game's */
        }
      }
      return u;
    } catch {
      return null;
    }
  }

  function send(name: string, data: Data) {
    try {
      if (queue.length < QUEUE_MAX) queue.push([name, data]);
      flush();
    } catch {
      /* never */
    }
  }

  function safe<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
    return (...a) => {
      try {
        fn(...a);
      } catch {
        /* analytics never stops the game */
      }
    };
  }

  function game(info: GameInfo): GameTrack {
    const g = ++visitGames;
    let gt = '1';
    let dsf = '0';
    const ctx = (): Data => ({
      g, gt, dsf, entry: info.entry, kind: info.kind, run: info.run, inapp, snd: deps.sound() ? 'on' : 'off',
    });
    let started = false;
    let startAt = 0;
    let pausedTotal = 0;
    let pausedSince: number | null = null;
    const active = () => deps.now() - pausedTotal - (pausedSince === null ? 0 : deps.now() - pausedSince);
    let invested = true;
    let cashFrom = 0;
    let cashMs = 0;
    let redSeen = false;
    let forward = false;
    let step = 0;
    let sold = false;
    let firstSell: 'never' | 'before_red' | 'on_red' | 'after_red' = 'never';
    let firstSellPct = 0;
    let quitSent = false;

    const me = {
      ctx,
      done: false,
      quit() {
        if (quitSent || me.done) return;
        quitSent = true;
        const phase = !started ? 'start_screen' : forward ? 'fast_forward' : !invested ? 'in_cash' : redSeen ? 'holding' : 'before_red';
        send('game_quit', { ...ctx(), phase, pct: tens(info.progress(step)), sold });
      },
    };
    cur = me;
    result = null;

    return {
      frame: safe((f: Frame) => {
        if (me.done) return;
        if (!started) {
          started = true;
          startAt = active();
          const s = store();
          const n = (Number(s.n) || 0) + 1;
          const first = s.f || deps.today();
          keep({ n, f: first });
          gt = gamesBucket(n);
          dsf = daysBucket(daysBetween(first, deps.today()));
          const data = ctx();
          if (!startedThisVisit) data.ms_to_start = msToStartBucket(deps.now());
          startedThisVisit = true;
          send('game_start', data);
        }
        step = f.stepIndex;
        forward = f.forward;
        if (f.trade === 'sell' && !sold) {
          sold = true;
          firstSell = f.red ? 'on_red' : redSeen ? 'after_red' : 'before_red';
          firstSellPct = tens(info.progress(f.stepIndex));
        }
        if (f.invested !== invested) {
          if (invested) cashFrom = active();
          else cashMs += active() - cashFrom;
          invested = f.invested;
        }
        if (f.red) redSeen = true;
      }),
      pause: safe(() => {
        if (pausedSince === null) pausedSince = deps.now();
      }),
      resume: safe(() => {
        if (pausedSince !== null) pausedTotal += deps.now() - pausedSince;
        pausedSince = null;
      }),
      end: safe((r: { lead: number; trades: number; bust: boolean }) => {
        if (me.done) return;
        me.done = true;
        const now = active();
        if (!invested) cashMs += now - cashFrom;
        const ms = Math.max(1, now - startAt);
        const l = Math.round(r.lead) || 0;
        const data: Data = {
          ...ctx(),
          outcome: r.bust ? 'bust' : l > 0 ? 'win' : l < 0 ? 'loss' : 'draw',
          lead: leadBucket(r.lead),
          sec: secBucket(ms / 1000),
          trades: r.trades,
          first_sell: firstSell,
          cash_pct: tens((cashMs / ms) * 100),
          double: info.double,
        };
        if (sold) data.first_sell_pct = firstSellPct;
        keep({ e: (Number(store().e) || 0) + 1 });
        send('game_end', data);
        result = { ctx, at: deps.now(), revealed: false, sent: false };
      }),
    };
  }

  function resultAction(action: string) {
    if (!result || result.sent) return;
    result.sent = true;
    send('result_action', {
      ...result.ctx(), action, result_sec: resultSecBucket((deps.now() - result.at) / 1000), revealed: result.revealed,
    });
  }

  return {
    flush: safe(() => void flush()),
    game,
    loadError: safe((run: string) => send('load_error', { run, inapp })),
    action: safe((a: ResultAction) => resultAction(a)),
    revealed: safe(() => {
      if (result) result.revealed = true;
    }),
    share: safe((via: ShareVia) => {
      const ctx = result?.ctx ?? cur?.ctx;
      send('share', { ...(ctx ? ctx() : { inapp }), via });
    }),
    feedbackDue() {
      try {
        const s = store();
        if (s.q || (Number(s.e) || 0) < 3) return false;
        keep({ q: true });
        return true;
      } catch {
        return false;
      }
    },
    feedback: safe((yes: boolean) => send('feedback', { ...(result ? result.ctx() : { inapp }), answer: yes ? 'yes' : 'no' })),
    hidden: safe(() => {
      if (result) resultAction(result.revealed ? 'reveal_only' : 'left');
      else cur?.quit();
    }),
  };
}

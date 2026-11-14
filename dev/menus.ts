// Dev page: ?screen=pick | collection | fresh (an empty collection). Sample data only.
import { RUNS } from '../src/content/runs';
import { mountCollection, mountPickCrash } from '../src/ui/menus';

const root = document.getElementById('app')!;
const screen = new URLSearchParams(location.search).get('screen') ?? 'pick';
const noop = () => {};

if (screen === 'pick') {
  mountPickCrash(root, { runs: RUNS, onPick: (id) => console.log('pick', id), onBack: noop });
} else if (screen === 'fresh') {
  mountCollection(root, {
    record: { games: 0, wins: 0, soldTooEarly: 0 }, pot: 10000, busts: 0, bestStreak: 0,
    played: [], titles: [], runs: RUNS, unlocked: false, onBack: noop,
  });
} else {
  mountCollection(root, {
    record: { games: 9, wins: 3, soldTooEarly: 4 }, pot: 12300, busts: 1, bestStreak: 3,
    played: ['c1929', 'c2007', 'c2020', 's1998', 's2014'],
    titles: ['paper', 'diamond', 'nerves', 'shakenOut'],
    runs: RUNS, storageOk: true, unlocked: true, borrowed: false, onToggleBorrowed: (on) => console.log('borrowed', on), onBack: noop,
  });
}

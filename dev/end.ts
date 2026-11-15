// Dev page for the end screen (not part of the build): /dev/end.html?s=c2007|won|lost
import { runMeta } from '../src/content/runs';
import { mountEndScreen } from '../src/ui/endscreen';
import { c2007Sample, losingSample, winningSample } from '../tests/fixtures/sample-result';

const q = new URLSearchParams(location.search);
const samples = { c2007: c2007Sample, won: winningSample, lost: losingSample };
const make = samples[(q.get('s') ?? 'c2007') as keyof typeof samples] ?? c2007Sample;
const model = make();
const log = (what: string) => () => console.log(what);
let sound = true;
model.sound = { on: sound };
model.actions = {
  onNewMystery: log('new mystery'),
  onRematch: log('rematch'),
  onChallenge: log('challenge'),
  onDouble: log('double'),
  onBank: log('bank'),
  onPick: log('pick'),
  onCollection: log('collection'),
  onToggleSound: () => (sound = !sound),
};
// &scare=1 tries the long false-alarm reveal line.
if (q.get('scare')) model.run = { ...model.run, revealLine: runMeta('s1998')!.revealLine, kind: 'scare' };
mountEndScreen(document.getElementById('app')!, model);

// Lazily created recognizer shared by the Photo tab. Loading the module pulls in the label data and
// worker only when the user actually asks for suggestions.
import type { Recognizer } from '../../vision/recognizer';

let rec: Promise<Recognizer> | null = null;

export function getRecognizer(): Promise<Recognizer> {
  rec ??= import('../../vision/recognizer').then((m) => new m.Recognizer());
  return rec;
}

/** Drop the recognizer (after removal or a fatal error) so memory is freed and state resets. */
export async function resetRecognizer() {
  const r = rec;
  rec = null;
  if (r) (await r).cancel();
}

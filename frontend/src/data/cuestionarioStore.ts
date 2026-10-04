import { ref, get, update, onValue, type Unsubscribe } from 'firebase/database';
import { db } from './firebase';

const ANSWERS_PATH = 'desarrollo/cuestionario/answers';
const REGISTERED_PATH = 'desarrollo/cuestionario/registered';

export async function readCuestionarioAnswers(): Promise<Record<string, string>> {
  const snap = await get(ref(db, ANSWERS_PATH));
  return snap.exists() ? snap.val() : {};
}

/** Merge parcial — no borra las claves guardadas por los otros integrantes. */
export async function saveCuestionarioAnswers(patch: Record<string, string>): Promise<void> {
  await update(ref(db, ANSWERS_PATH), patch);
}

export function subscribeCuestionarioAnswers(callback: (answers: Record<string, string>) => void): Unsubscribe {
  return onValue(ref(db, ANSWERS_PATH), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

export async function isMemberRegistered(memberId: string): Promise<boolean> {
  const snap = await get(ref(db, `${REGISTERED_PATH}/${memberId}`));
  if (snap.exists() && snap.val() === true) return true;
  return false;
}

export async function markMemberRegistered(memberId: string): Promise<void> {
  await update(ref(db, REGISTERED_PATH), { [memberId]: true });
}

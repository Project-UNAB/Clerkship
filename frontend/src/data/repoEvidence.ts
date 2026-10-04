import { ref, set, remove, onValue, update, type Unsubscribe } from 'firebase/database';
import { db } from './firebase';

const EVIDENCE_PATH = 'desarrollo/cronograma/evidence';
const COMPLETED_PATH = 'desarrollo/cronograma/completedMap';

/**
 * Evidencia de commit asociada a un hito/entrega del Cronograma.
 * Se guarda con clave `${catId}-${actId}` (mismo formato que `itemKey`
 * en CronogramaTab.tsx) para poder resolverla desde ahí. Vive en Firebase
 * Realtime Database para que los 4 integrantes vean lo mismo.
 */
export interface RepoEvidence {
  repoId: string;
  sha: string;
  shortSha: string;
  branch: string;
  message: string;
  htmlUrl: string;
  author: string;
  date: string;
  milestoneLabel: string;
  description?: string;
  registeredBy: string;
  taggedAt: string;
}

export function subscribeEvidenceMap(callback: (map: Record<string, RepoEvidence>) => void): Unsubscribe {
  return onValue(ref(db, EVIDENCE_PATH), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

export async function saveEvidence(itemKey: string, evidence: RepoEvidence): Promise<void> {
  await set(ref(db, `${EVIDENCE_PATH}/${itemKey}`), evidence);
}

export async function removeEvidence(itemKey: string): Promise<void> {
  await remove(ref(db, `${EVIDENCE_PATH}/${itemKey}`));
}

export function subscribeCompletedMap(callback: (map: Record<string, boolean>) => void): Unsubscribe {
  return onValue(ref(db, COMPLETED_PATH), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

export async function setCompleted(itemKey: string, value: boolean): Promise<void> {
  await update(ref(db, COMPLETED_PATH), { [itemKey]: value });
}

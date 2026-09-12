export type Participant = {
  id: string;
  name: string;
  studentId: string;
  major: string;
  subMajor: string;
  /** A short free note shown under the name on the monitor. */
  note: string;
  workInterest: string;
  personalInterest: string;
  message: string;
  photos: string[];
  createdAt: string;
};

type ParticipantStore = typeof globalThis & {
  __cre8Participants?: Participant[];
};

const store = globalThis as ParticipantStore;

export function getParticipants() {
  return store.__cre8Participants ?? [];
}

export function addParticipant(
  input: Omit<Participant, "id" | "createdAt">,
) {
  const participant: Participant = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  store.__cre8Participants = [...getParticipants(), participant].slice(-100);
  return participant;
}

export function deleteParticipant(id: string) {
  const participants = getParticipants();
  const exists = participants.some((participant) => participant.id === id);

  if (exists) {
    store.__cre8Participants = participants.filter(
      (participant) => participant.id !== id,
    );
  }

  return exists;
}

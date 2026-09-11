export type Participant = {
  id: string;
  name: string;
  studentId: string;
  major: string;
  subMajor: string;
  workInterest: string;
  personalInterest: string;
  message: string;
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

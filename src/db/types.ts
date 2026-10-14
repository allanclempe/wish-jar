export type Kid = {
  id: number;
  name: string;
  photoUri: string | null;
  createdAt: number;
};

export type Icon = {
  emoji: string | null;
  photoUri: string | null;
};

export const PERIODS = ['morning', 'afternoon', 'evening'] as const;

export type Period = (typeof PERIODS)[number];

export type Task = {
  id: number;
  name: string;
  period: Period;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
};

export type PunishmentType = {
  id: number;
  name: string;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
};

export type Punishment = {
  id: number;
  kidId: number;
  punishmentTypeId: number | null;
  name: string;
  coinAmount: number;
  icon: Icon;
  dayKey: string;
  createdAt: number;
};

export type Wish = {
  id: number;
  kidId: number;
  name: string;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
  claimedAt: number | null;
};

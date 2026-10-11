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

export type Task = {
  id: number;
  name: string;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
};

export type Wish = {
  id: number;
  kidId: number;
  name: string;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
};

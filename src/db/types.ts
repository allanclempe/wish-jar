export type Kid = {
  id: number;
  name: string;
  photoUri: string | null;
  createdAt: number;
};

export type Task = {
  id: number;
  kidId: number;
  title: string;
  amountCents: number;
  createdAt: number;
};

export type Wish = {
  id: number;
  kidId: number;
  title: string;
  amountCents: number;
  createdAt: number;
};

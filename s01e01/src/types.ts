export const AVAILABLE_TAGS = [
  "IT",
  "transport",
  "edukacja",
  "medycyna",
  "praca z ludźmi",
  "praca z pojazdami",
  "praca fizyczna",
] as const;

export type Tag = (typeof AVAILABLE_TAGS)[number];

export interface RawPerson {
  name: string;
  surname: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  birthCountry: string;
  job: string;
}

export interface Person {
  name: string;
  surname: string;
  gender: string;
  born: number;
  city: string;
  job: string;
}

export interface TaggedPerson {
  name: string;
  surname: string;
  gender: string;
  born: number;
  city: string;
  tags: Tag[];
}

export interface TagResult {
  index: number;
  tags: Tag[];
}

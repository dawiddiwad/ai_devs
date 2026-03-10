export const TAGS = {
  "IT": "software development, programming, system administration, data engineering, cybersecurity, computers and technology",
  "transport": "logistics, shipping, freight, driving, fleet management, supply chain, moving goods or people between locations",
  "edukacja": "teaching, training, tutoring, academic work, education",
  "medycyna": "healthcare, medicine, nursing, pharmacy, diagnostics, medical research",
  "praca z ludźmi": "social work, customer service, HR, counseling, jobs focused on interacting with and helping people directly",
  "praca z pojazdami": "mechanic work, vehicle repair, vehicle maintenance, operating heavy machinery or vehicles",
  "praca fizyczna": "manual labor, construction, carpentry, plumbing, electrical work, physically demanding trades",
} as const;

export type Tag = keyof typeof TAGS;

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

import { Person } from "./types";

export class PersonFilter {
  private readonly currentYear: number;
  private readonly minAge: number;
  private readonly maxAge: number;
  private readonly requiredGender: string;
  private readonly requiredCity: string;

  constructor(
    currentYear: number,
    minAge: number,
    maxAge: number,
    requiredGender: string,
    requiredCity: string
  ) {
    this.currentYear = currentYear;
    this.minAge = minAge;
    this.maxAge = maxAge;
    this.requiredGender = requiredGender;
    this.requiredCity = requiredCity;
  }

  filter(people: Person[]): Person[] {
    return people.filter((person) => this.matches(person));
  }

  private matches(person: Person): boolean {
    const age = this.currentYear - person.born;
    return (
      person.gender === this.requiredGender &&
      person.city === this.requiredCity &&
      age >= this.minAge &&
      age <= this.maxAge
    );
  }
}

import * as fs from "fs";
import { RawPerson, Person } from "./types";

export class PersonReader {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  read(): Person[] {
    const content = fs.readFileSync(this.filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const rawPeople = this.parseCsv(lines);
    return rawPeople.map(this.toPerson);
  }

  private parseCsv(lines: string[]): RawPerson[] {
    const headers = this.parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        record[header.trim()] = (values[i] || "").trim();
      });
      return record as unknown as RawPerson;
    });
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private toPerson(raw: RawPerson): Person {
    const birthYear = new Date(raw.birthDate).getFullYear();
    return {
      name: raw.name,
      surname: raw.surname,
      gender: raw.gender,
      born: birthYear,
      city: raw.birthPlace,
      job: raw.job,
    };
  }
}

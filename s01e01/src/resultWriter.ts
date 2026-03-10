import * as fs from "fs";
import * as path from "path";
import { TaggedPerson } from "./types";

export class ResultWriter {
  private readonly outputPath: string;

  constructor(outputPath: string) {
    this.outputPath = outputPath;
  }

  write(people: TaggedPerson[]): void {
    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const header = "name,surname,gender,born,city,tags";
    const rows = people.map(
      (p) =>
        `${this.escapeCsv(p.name)},${this.escapeCsv(p.surname)},${p.gender},${p.born},${this.escapeCsv(p.city)},"${p.tags.join(",")}"`
    );

    const content = [header, ...rows].join("\n");
    fs.writeFileSync(this.outputPath, content, "utf-8");
  }

  writeJson(
    people: TaggedPerson[],
    outputPath: string,
    apiKey: string,
    taskName: string
  ): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = {
      apikey: apiKey,
      task: taskName,
      answer: people.map((p) => ({
        name: p.name,
        surname: p.surname,
        gender: p.gender,
        born: p.born,
        city: p.city,
        tags: p.tags,
      })),
    };

    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
  }

  private escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

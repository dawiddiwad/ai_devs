import OpenAI from "openai";
import { Person, Tag, TagResult } from "./types";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const TagResultSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      tags: z.array(
        z.enum([
          "IT",
          "transport",
          "edukacja",
          "medycyna",
          "praca z ludźmi",
          "praca z pojazdami",
          "praca fizyczna",
        ])
      ),
    })
  ),
});

export class JobTagger {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly batchSize: number;

  constructor(client: OpenAI, model: string, batchSize: number) {
    this.client = client;
    this.model = model;
    this.batchSize = batchSize;
  }

  async tagAll(people: Person[]): Promise<Tag[][]> {
    const allTags: Tag[][] = new Array(people.length);
    const batches = this.createBatches(people);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(
        `Tagging batch ${i + 1}/${batches.length} (${batch.length} records)...`
      );
      const results = await this.tagBatch(batch);
      for (const result of results) {
        allTags[result.index] = result.tags;
      }
    }

    return allTags;
  }

  private createBatches(
    people: Person[]
  ): { index: number; job: string }[][] {
    const items = people.map((p, i) => ({ index: i, job: p.job }));
    const batches: { index: number; job: string }[][] = [];

    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }

    return batches;
  }

  private async tagBatch(
    batch: { index: number; job: string }[]
  ): Promise<TagResult[]> {
    const jobList = batch
      .map((item, i) => `${i}. ${item.job}`)
      .join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: this.buildSystemPrompt(),
        },
        {
          role: "user",
          content: jobList,
        },
      ],
      response_format: zodResponseFormat(TagResultSchema, "tag_results"),
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = TagResultSchema.parse(JSON.parse(content));

    return parsed.results.map((r) => ({
      index: batch[r.index].index,
      tags: r.tags as Tag[],
    }));
  }

  private buildSystemPrompt(): string {
    return `You are a job classification expert. Given numbered job descriptions in Polish, assign one or more tags from the following list to each.

Available tags and their meanings:
- IT: software development, programming, system administration, data engineering, cybersecurity, anything related to computers and technology
- transport: logistics, shipping, freight, driving, fleet management, supply chain, moving goods or people between locations
- edukacja: teaching, training, tutoring, academic work, education
- medycyna: healthcare, medicine, nursing, pharmacy, diagnostics, medical research
- praca z ludźmi: social work, customer service, HR, counseling, any job focused on interacting with and helping people directly
- praca z pojazdami: mechanic work, vehicle repair, vehicle maintenance, operating heavy machinery or vehicles
- praca fizyczna: manual labor, construction, carpentry, plumbing, electrical work, any physically demanding trade

A job can have multiple tags. Respond with the index matching the input numbering and the assigned tags for each entry.`;
  }
}

import * as dotenv from "dotenv";
import * as path from "path";
import OpenAI from "openai";
import { PersonReader } from "./personReader";
import { PersonFilter } from "./personFilter";
import { JobTagger } from "./jobTagger";
import { ResultWriter } from "./resultWriter";
import { TaggedPerson, Tag } from "./types";

dotenv.config();

const CURRENT_YEAR = 2026;
const MIN_AGE = 20;
const MAX_AGE = 40;
const REQUIRED_GENDER = "M";
const REQUIRED_CITY = "Grudziądz";
const REQUIRED_TAG: Tag = "transport";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const baseURL = process.env.OPENAI_BASE_URL;
  if (baseURL) {
    console.log(`Using custom OpenAI base URL: ${baseURL}`);
  }

  const aiDevsApiKey = process.env.AI_DEVS_API_KEY;
  if (!aiDevsApiKey) {
    throw new Error("AI_DEVS_API_KEY is not set");
  }
  const aiDevsTaskName = process.env.AI_DEVS_TASK_NAME || "people";

  const batchSize = parseInt(process.env.BATCH_SIZE || "1000", 10);
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  const inputPath = path.resolve(__dirname, "../input/people.csv");
  const outputCsvPath = path.resolve(__dirname, "../output/transport.csv");
  const outputJsonPath = path.resolve(__dirname, "../output/transport.json");

  const reader = new PersonReader(inputPath);
  const people = reader.read();
  console.log(`Loaded ${people.length} records from CSV`);

  const filter = new PersonFilter(
    CURRENT_YEAR,
    MIN_AGE,
    MAX_AGE,
    REQUIRED_GENDER,
    REQUIRED_CITY
  );
  const candidates = filter.filter(people);
  console.log(`Filtered to ${candidates.length} candidates`);

  const openai = new OpenAI({ apiKey, baseURL: baseURL });
  const tagger = new JobTagger(openai, model, batchSize);
  const tags = await tagger.tagAll(candidates);

  const taggedPeople: TaggedPerson[] = candidates.map((person, i) => ({
    name: person.name,
    surname: person.surname,
    gender: person.gender,
    born: person.born,
    city: person.city,
    tags: tags[i] || [],
  }));

  const transportPeople = taggedPeople.filter((p) =>
    p.tags.includes(REQUIRED_TAG)
  );
  console.log(`Found ${transportPeople.length} people with transport tag`);

  const writer = new ResultWriter(outputCsvPath);
  writer.write(transportPeople);
  writer.writeJson(transportPeople, outputJsonPath, aiDevsApiKey, aiDevsTaskName);

  console.log(`Results written to ${outputCsvPath}`);
  console.log(`JSON output written to ${outputJsonPath}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

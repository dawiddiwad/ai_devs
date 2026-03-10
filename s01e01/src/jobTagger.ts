import OpenAI from "openai";
import { Person, Tag, TagResult, TAGS } from "./types";

interface TagResultItem {
    index: number;
    tags: Tag[];
}

interface TagResultResponse {
    results: TagResultItem[];
}

function buildTagResponseSchema(): OpenAI.ResponseFormatJSONSchema["json_schema"] {
    const tagEntries = (Object.keys(TAGS) as Tag[]).map(
        (tag) => `${tag}: ${TAGS[tag]}`
    );

    return {
        name: "tag_results",
        strict: true,
        schema: {
            type: "object",
            properties: {
                results: {
                    type: "array",
                    description:
                        "One entry per input job description, matched by index.",
                    items: {
                        type: "object",
                        properties: {
                            index: {
                                type: "number",
                                description:
                                    "Zero-based index matching the input job numbering.",
                            },
                            tags: {
                                type: "array",
                                description:
                                    "One or more tags that best classify the job description.",
                                items: {
                                    type: "string",
                                    enum: Object.keys(TAGS),
                                    description: `${tagEntries.join(": ")}.`,
                                },
                            },
                        },
                        required: ["index", "tags"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["results"],
            additionalProperties: false,
        },
    };
}

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
            temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE)
                : undefined,
            messages: [
                {
                    role: "system",
                    content:
                        "You are a job classification expert. Given numbered job descriptions in Polish, assign one or more tags to each. A job can have multiple tags.",
                },
                {
                    role: "user",
                    content: jobList,
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: buildTagResponseSchema(),
            },
        });

        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error("Empty response from OpenAI");
        }

        const parsed: TagResultResponse = JSON.parse(content);

        return parsed.results.map((r) => ({
            index: batch[r.index].index,
            tags: r.tags,
        }));
    }
}

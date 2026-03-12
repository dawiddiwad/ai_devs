import axios from "axios"
import OpenAI from "openai"
import { VERIFY_URL, TASK_NAME, DOCUMENTATION_BASE_URL } from "./prompts"
import { model } from "./agent"

const openai = new OpenAI()

const imageCache = new Map<string, { base64: string; mimeType: string }>()

export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetches the content of a remote URL. Returns text for text-based files (md, html, txt, json). For images it stores them internally and returns a notice — you must then call analyze_image with the same URL to extract content from the image.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL to fetch.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_image",
      description:
        "Analyzes a previously fetched image URL using a vision-capable model. The image must have been fetched first with fetch_url. Returns extracted text / description.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the image (must have been fetched previously with fetch_url).",
          },
          question: {
            type: "string",
            description:
              "A question or instruction for the vision model, e.g. 'Extract all text and tables from this image verbatim.'",
          },
        },
        required: ["url", "question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_declaration",
      description:
        "Submits the completed declaration text to the Hub verification endpoint. Returns the Hub's response (flag or error with hints).",
      parameters: {
        type: "object",
        properties: {
          declaration: {
            type: "string",
            description:
              "The full text of the filled declaration, formatted exactly as the template requires.",
          },
        },
        required: ["declaration"],
      },
    },
  },
]

function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  return new URL(url, DOCUMENTATION_BASE_URL).href
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i
const IMAGE_CONTENT_TYPES = /^image\//

export async function fetchUrl(url: string): Promise<string> {
  const resolvedUrl = resolveUrl(url)
  console.log(`  [fetch_url] ${resolvedUrl}`)

  try {
    const isImageByExt = IMAGE_EXTENSIONS.test(resolvedUrl)

    const response = await axios.get(resolvedUrl, {
      responseType: isImageByExt ? "arraybuffer" : "text",
      timeout: 30000,
      validateStatus: () => true,
    })

    if (response.status >= 400) {
      return JSON.stringify({
        error: `HTTP ${response.status}`,
        url: resolvedUrl,
      })
    }

    const contentType: string =
      response.headers["content-type"] || "application/octet-stream"
    const isImage =
      IMAGE_CONTENT_TYPES.test(contentType) || isImageByExt

    if (isImage) {
      const buffer = Buffer.from(response.data)
      const base64 = buffer.toString("base64")
      imageCache.set(resolvedUrl, { base64, mimeType: contentType })
      return JSON.stringify({
        isImage: true,
        url: resolvedUrl,
        message: `Image fetched and stored (${contentType}, ${buffer.length} bytes). Use analyze_image with url="${resolvedUrl}" to extract text/data from it.`,
      })
    }

    return JSON.stringify({
      contentType,
      content: response.data,
      isImage: false,
      url: resolvedUrl,
    })
  } catch (err: any) {
    return JSON.stringify({
      error: err.message || "Unknown fetch error",
      url: resolvedUrl,
    })
  }
}

export async function analyzeImage(
  url: string,
  question: string
): Promise<string> {
  const resolvedUrl = resolveUrl(url)
  console.log(`  [analyze_image] url=${resolvedUrl}, question=${question.slice(0, 80)}...`)

  let cached = imageCache.get(resolvedUrl)
  if (!cached) {
    console.log(`  [analyze_image] Image not in cache, fetching...`)
    try {
      const resp = await axios.get(resolvedUrl, { responseType: "arraybuffer", timeout: 30000 })
      const buffer = Buffer.from(resp.data)
      const mimeType = resp.headers["content-type"] || "image/png"
      cached = { base64: buffer.toString("base64"), mimeType }
      imageCache.set(resolvedUrl, cached)
    } catch (err: any) {
      return JSON.stringify({ error: `Failed to fetch image: ${err.message}` })
    }
  }

  const response = await openai.chat.completions.create({
    model: model,
    max_completion_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${cached.mimeType};base64,${cached.base64}`,
            },
          },
          { type: "text", text: question },
        ],
      },
    ],
  })

  const analysis = response.choices[0]?.message?.content || "(no response)"
  return JSON.stringify({ analysis })
}

export async function submitDeclaration(declaration: string): Promise<string> {
  const apiKey = process.env.AI_DEVS_API_KEY || process.env.HUB_API_KEY || ""
  console.log(`  [submit_declaration] Submitting to ${VERIFY_URL}...`)
  console.log(`  Declaration preview:\n${declaration.slice(0, 300)}...`)

  try {
    const response = await axios.post(
      VERIFY_URL,
      {
        apikey: apiKey,
        task: TASK_NAME,
        answer: { declaration },
      },
      { timeout: 30000 }
    )

    console.log(`  [submit_declaration] Response: ${JSON.stringify(response.data)}`)
    return JSON.stringify({ response: response.data })
  } catch (err: any) {
    const errData = err.response?.data || err.message
    console.log(`  [submit_declaration] Error: ${JSON.stringify(errData)}`)
    return JSON.stringify({ response: errData })
  }
}

export async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<string> {
  switch (name) {
    case "fetch_url":
      return fetchUrl(args.url)
    case "analyze_image":
      return analyzeImage(args.url, args.question)
    case "submit_declaration":
      return submitDeclaration(args.declaration)
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

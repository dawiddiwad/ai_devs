import OpenAI from "openai"

export const TOOL_DEFINITIONS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "callRailwayApi",
      description:
        "Sends a POST request to the railway API endpoint with the given action and optional parameters.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              "The API action to invoke (e.g. 'help', or any action discovered from the help response)",
          },
          params: {
            type: "object",
            description:
              "Optional additional parameters for the action, as key-value pairs discovered from API documentation",
          },
        },
        required: ["action"],
      },
    },
  },
]

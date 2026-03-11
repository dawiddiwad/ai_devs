import type { ChatCompletionTool } from "openai/resources/chat/completions"

export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_package",
      description: "Sprawdza status i lokalizację paczki na podstawie jej identyfikatora.",
      parameters: {
        type: "object",
        properties: {
          packageid: {
            type: "string",
            description: "Identyfikator paczki, np. PKG12345678",
          },
        },
        required: ["packageid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "redirect_package",
      description: "Przekierowuje paczkę do nowej lokalizacji docelowej. Wymaga kodu zabezpieczającego.",
      parameters: {
        type: "object",
        properties: {
          packageid: {
            type: "string",
            description: "Identyfikator paczki do przekierowania",
          },
          destination: {
            type: "string",
            description: "Kod lokalizacji docelowej",
          },
          code: {
            type: "string",
            description: "Kod zabezpieczający wymagany do przekierowania",
          },
        },
        required: ["packageid", "destination", "code"],
      },
    },
  },
]

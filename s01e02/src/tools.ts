import type OpenAI from "openai"

export const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "load_suspects",
      description: "Load the list of suspects from the local input/suspects.json file. Returns an array of suspect objects with name, surname, gender, born (year), city, and tags.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_power_plants",
      description: "Fetch the list of nuclear power plants with their codes and coordinates from the remote API. Returns an array of power plant objects with code, city, latitude, and longitude.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_suspect_locations",
      description: "Fetch the coordinates where one or more suspects were seen. Accepts an array of suspects. Returns an array of results, each containing the suspect's name/surname and their locations.",
      parameters: {
        type: "object",
        properties: {
          suspects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "First name of the suspect" },
                surname: { type: "string", description: "Last name of the suspect" },
              },
              required: ["name", "surname"],
            },
            description: "Array of suspects to fetch locations for",
          },
        },
        required: ["suspects"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_distances",
      description: "Calculate haversine distances in kilometers for one or more coordinate pairs. Accepts an array of pairs. Returns an array of results with the computed distance for each pair.",
      parameters: {
        type: "object",
        properties: {
          pairs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Optional label for this pair (e.g. suspect name + plant code)" },
                lat1: { type: "number", description: "Latitude of point A" },
                lon1: { type: "number", description: "Longitude of point A" },
                lat2: { type: "number", description: "Latitude of point B" },
                lon2: { type: "number", description: "Longitude of point B" },
              },
              required: ["lat1", "lon1", "lat2", "lon2"],
            },
            description: "Array of coordinate pairs to calculate distances for",
          },
        },
        required: ["pairs"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_nearest_suspect_to_plant",
      description: "Given an array of suspects (each with an array of locations) and an array of power plants, compute the haversine distance from EVERY suspect location to EVERY plant. Returns the single best match: the suspect and plant with the smallest distance, along with the distance in km. This checks ALL locations for ALL suspects.",
      parameters: {
        type: "object",
        properties: {
          suspects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                surname: { type: "string" },
                locations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      latitude: { type: "number" },
                      longitude: { type: "number" },
                    },
                    required: ["latitude", "longitude"],
                  },
                },
              },
              required: ["name", "surname", "locations"],
            },
          },
          plants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                city: { type: "string" },
                latitude: { type: "number" },
                longitude: { type: "number" },
              },
              required: ["code", "latitude", "longitude"],
            },
          },
        },
        required: ["suspects", "plants"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_access_level",
      description: "Fetch the access level for a specific suspect from the remote API. Requires birth year as an integer.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "First name of the suspect" },
          surname: { type: "string", description: "Last name of the suspect" },
          birthYear: { type: "integer", description: "Year of birth of the suspect" },
        },
        required: ["name", "surname", "birthYear"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_and_verify",
      description: "Save the matched suspect result to output/matched-suspect.json and submit it for verification. Returns the verification response.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "First name of the matched suspect" },
          surname: { type: "string", description: "Last name of the matched suspect" },
          accessLevel: { type: "integer", description: "Access level of the suspect" },
          powerPlant: { type: "string", description: "Power plant code (e.g. PWR1234PL)" },
        },
        required: ["name", "surname", "accessLevel", "powerPlant"],
      },
    },
  },
]

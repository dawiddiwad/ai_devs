## Coding Standards
 -  Write all code (including variable names and functions) in English
 -  Organize the code into logical modules; do not put everything in a single index.ts file
 -  Use TypeScript for the tech stack
 -  Use the dotenv package to manage environment variables
 -  Apply SOLID principles throughout the codebase
 -  Write self-explanatory code and avoid inline comments
 -  Do not use semicolons at the end of lines
 -  Use package.json as a baseline; extend it if needed

## Observability
 -  add 3 types of logging:
    -  agent: logs related to the agent's decision-making process, such as which tools it chooses to use and why
    -  tool: logs related to the execution of tools, including input parameters and results
    -  api: logs related to interactions with external APIs, including request details and responses
 -  Ensure that logs are structured and include timestamps, log levels, and relevant context to facilitate debugging and monitoring.

## OpenAI API Usage
 -  Use the OpenAI API for any natural language processing tasks, ensuring that all interactions with the API are well-structured and error-handled.
 -  Ensure that API keys and sensitive information are stored securely using environment variables, follow `.env.example` for reference.
 -  Gracefully handle API rate limits and errors, implementing retry logic where appropriate.
 -  When using tools, use `ChatCompletionTool` type form chat completions and use `zod` for any input/output schema validation to ensure data integrity and robustness of the agent's interactions with tools and APIs.
 -  [reference OpenAI API documentation](https://platform.openai.com/docs/api-reference) for best practices and guidelines on using the API effectively.


## Documentation
 - Whenever you do a functional change to existing code, update any documentation within the project, in particular `spec.md` or `README.md` to reflect the change and ensure that it is up to date.

## Flag Capturing
 - If task requeires to capture a flag, make sure it is captured programatically by parsing in from text and not through LLM interactions.
 - Whenver the flag is captured, ensure it is imidiately logged in the agent logs and the process is terminated with `0` exit code.


import OpenAI from 'openai';
import type { AIGenerationParams, AIGenerationResult } from './types';

export async function generateWithOpenAI(
  apiKey: string,
  params: AIGenerationParams
): Promise<AIGenerationResult> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.responses.create({
    model: params.model,
    max_output_tokens: params.maxTokens,
    reasoning: {
      effort: params.effort,
    },
    // instructions: params.systemPrompt,
    // input: [
    //   { role: 'user', content: params.userPrompt },
    // ],
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: params.systemPrompt }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: params.userPrompt }]
      }
    ]
  });

  const content = response.output_text || '';

  console.log("Response from the chat: ", response)

  return {
    content,
    model: params.model,
    provider: 'openai',
    usage: response.usage
      ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined,
  };
}

export async function streamWithOpenAI(
  apiKey: string,
  params: AIGenerationParams,
  onTextDelta: (delta: string) => void,
): Promise<AIGenerationResult> {
  const openai = new OpenAI({ apiKey });

  const stream = openai.responses.stream({
    model: params.model,
    max_output_tokens: params.maxTokens,
    reasoning: {
      effort: params.effort,
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: params.systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: params.userPrompt }],
      },
    ],
  });

  /** Deltas streamed to the client; also used if finalResponse.output_text is empty (GPT-5 / reasoning streams). */
  let accumulatedText = "";
  /** Full text from response.output_text.done when the API emits it. */
  let outputTextFromDoneEvent = "";

  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && event.delta) {
      accumulatedText += event.delta;
      onTextDelta(event.delta);
    }
    if (event.type === "response.output_text.done" && event.text) {
      outputTextFromDoneEvent = event.text;
    }
  }

  const finalResponse = await stream.finalResponse();
  const fromFinal = finalResponse.output_text ?? "";
  const content =
    fromFinal ||
    outputTextFromDoneEvent ||
    accumulatedText;

  return {
    content,
    model: params.model,
    provider: "openai",
    usage: finalResponse.usage
      ? {
          promptTokens: finalResponse.usage.input_tokens,
          completionTokens: finalResponse.usage.output_tokens,
          totalTokens: finalResponse.usage.total_tokens,
        }
      : undefined,
  };
}


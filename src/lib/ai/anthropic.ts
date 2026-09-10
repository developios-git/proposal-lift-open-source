import Anthropic from '@anthropic-ai/sdk';
import type { AIGenerationParams, AIGenerationResult } from './types';

export async function generateWithAnthropic(
  apiKey: string,
  params: AIGenerationParams
): Promise<AIGenerationResult> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({   
     model: params.model,
    max_tokens: params.maxTokens,
    // `temperature` used to sit here. Anthropic rejects it from Claude Opus 4.7
    // onward — `400 invalid_request_error: 'temperature' is deprecated for this
    // model` — which is most of what the model picker offers. `effort` is the
    // supported equivalent.
    output_config: { effort: params.effort },
    // system: params.systemPrompt,
    system: [{ type: "text", text: params.systemPrompt, cache_control: {type: "ephemeral"} }],
    messages: [
      { role: 'user', content: params.userPrompt },
    ],
  });

  const content = response.content
    .filter((block) => block.type === 'text')
    .map((block) => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .join('');

    console.log("Response from anthropic the chat: ", response)

  return {
    content,
    model: params.model,
    provider: 'anthropic',
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}

export async function streamWithAnthropic(
  apiKey: string,
  params: AIGenerationParams,
  onTextDelta: (delta: string) => void,
): Promise<AIGenerationResult> {
  const anthropic = new Anthropic({ apiKey });

  const stream = anthropic.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens,
    output_config: { effort: params.effort },
    system: [
      { type: "text", text: params.systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: params.userPrompt }],
  });

  stream.on("text", (textDelta: string) => {
    onTextDelta(textDelta);
  });

  const message = await stream.finalMessage();

  const content = message.content
    .filter((block) => block.type === "text")
    .map((block) => {
      if (block.type === "text") return block.text;
      return "";
    })
    .join("");

  return {
    content,
    model: params.model,
    provider: "anthropic",
    usage: {
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
    },
  };
}

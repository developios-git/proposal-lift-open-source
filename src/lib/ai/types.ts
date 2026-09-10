import type { AiEffort } from "./effort";

export interface AIGenerationParams {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  /**
   * How hard the model should work. Replaced `temperature`, which the current
   * generations of both providers reject — see `./effort`.
   */
  effort: AiEffort;
  maxTokens: number;
}

export interface AIGenerationResult {
  content: string;
  model: string;
  provider: 'openai' | 'anthropic';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

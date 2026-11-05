import { BACKEND_BASE_URL } from './appConfig.ts';
import { KILO_API_BASE_URL } from './providerEndpoints.ts';
import type { ProviderKind } from '../core/state.ts';
export type ProviderPreset = { id: string; name: string; initials: string; kind: ProviderKind; baseUrl: string; keyRequired: boolean; description: string };
// Official API roots are editable defaults, never guessed local addresses or model choices.
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'kilo', name: 'Kilo AI Gateway', initials: 'K', kind: 'openai', baseUrl: KILO_API_BASE_URL, keyRequired: false, description: 'Optional gateway key; free routes have rate limits' },
  { id: 'openrouter', name: 'OpenRouter', initials: 'OR', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', keyRequired: true, description: 'Many models, one account' },
  { id: 'openai', name: 'OpenAI', initials: 'AI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', keyRequired: true, description: 'Your OpenAI API account' },
  { id: 'anthropic', name: 'Anthropic', initials: 'A', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', keyRequired: true, description: 'Claude, directly from Anthropic' },
  { id: 'groq', name: 'Groq', initials: 'G', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyRequired: true, description: 'Fast inference with your API key' },
  { id: 'ollama', name: 'Ollama', initials: 'O', kind: 'openai', baseUrl: '', keyRequired: false, description: 'Models on your own computer' },
  { id: 'custom', name: 'Custom provider', initials: '+', kind: 'openai', baseUrl: '', keyRequired: false, description: 'Any compatible API endpoint' },
  { id: 'chief', name: 'Chief server', initials: 'C', kind: 'chief', baseUrl: BACKEND_BASE_URL, keyRequired: false, description: 'Your own /chat and /health API' },
];

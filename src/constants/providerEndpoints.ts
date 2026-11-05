// API root URLs: Kilo's documented endpoint and the exact former preset accepted for saved-data migration.
export const KILO_API_BASE_URL = 'https://ai-gateway.kilo.ai/api/v1';
const LEGACY_KILO_API_BASE_URL = 'https://api.kilo.ai/api/gateway';

export function migrateLegacyProviderEndpoint(baseUrl: string): string {
  const comparable = baseUrl.trim().replace(/\/+$/, '');
  return comparable === LEGACY_KILO_API_BASE_URL ? KILO_API_BASE_URL : baseUrl;
}

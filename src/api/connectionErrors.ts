const MESSAGES = {
  relay_unavailable: 'The app connection is unavailable. Start the Ankita web server, reopen the address it prints, then retry. Your provider details are kept.',
  relay_timeout: 'The app connection took too long to respond. Check that the Ankita web server is running, then retry.',
  relay_session: 'The app connection changed while checking. Retry the connection. Your provider details are kept.',
  catalogue_timeout: 'Connection timed out while finding models. Check the server address and retry.',
  catalogue_format: 'The endpoint did not return a compatible model list. Enter a model manually.',
  probe_timeout: 'Connection timed out while testing generation. Retry later or choose another model.',
  network: 'Could not reach this provider. Check your connection and API base URL. For local models, use your computer’s network address.',
} as const;

export class ConnectionError extends Error {
  readonly code: keyof typeof MESSAGES;
  constructor(code: keyof typeof MESSAGES) {
    super(MESSAGES[code]);
    this.name = 'ConnectionError';
    this.code = code;
  }
}

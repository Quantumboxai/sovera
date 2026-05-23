// Expose the scope catalog for the Studio UI.
import { app, HttpResponseInit } from '@azure/functions';
import { SCOPE_CATALOG } from './auth.js';

app.http('scopes', {
  route: 'scopes',
  methods: ['GET'],
  authLevel: 'function',
  handler: async (): Promise<HttpResponseInit> => ({
    status: 200,
    jsonBody: { scopes: SCOPE_CATALOG },
  }),
});

// Test-only identity injection. This entrypoint is never deployed.
import { createImageApi } from '../../worker/images.js';
const api = createImageApi({ authenticate: async (request) => {
  const sub = request.headers.get('x-test-user'); if (!sub) throw new Error('no test user');
  return { sub,email:`${sub}@example.test` };
} });
export default { fetch: api };

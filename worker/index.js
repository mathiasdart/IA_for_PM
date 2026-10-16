import { authenticate, accessConfigured } from './auth.js';
import { createImageApi } from './images.js';

const imageApi = createImageApi({ authenticate, configured: (env) => Boolean(env.DB && env.IMAGES && accessConfigured(env)) });

export default {
  fetch(request,env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return imageApi(request,env);
    return env.ASSETS.fetch(request);
  },
};

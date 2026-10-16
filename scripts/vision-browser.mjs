import { chromium } from '@playwright/test';

// Chromium does not inherit HTTP(S)_PROXY itself. Keep model downloads on the
// environment's configured proxy, while Vite remains reachable on loopback.
export function launchVisionBrowser() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}),
  });
}

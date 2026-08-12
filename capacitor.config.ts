import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cinebook.app',
  appName: 'CineBook',
  webDir: 'public',
  server: {
    url: 'https://dhrub-talkies.vercel.app' // Deployed app URL (HTTPS — keep cleartext disabled)
  }
};

export default config;

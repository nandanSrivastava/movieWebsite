import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cinebook.app',
  appName: 'Dhrub Cineplex',
  webDir: 'public',
  server: {
    url: 'https://www.dhrubcineplex.in' // Deployed app URL (HTTPS — keep cleartext disabled)
  }
};

export default config;

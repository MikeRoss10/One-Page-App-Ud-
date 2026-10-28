import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'au.com.utilitydeals.app',
  appName: 'Utility Deals',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;

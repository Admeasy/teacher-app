import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "in.admeasy.teacher",
  appName: "Admeasy Teacher",

  server: {
    url: "https://teacher.admeasy.in",
    cleartext: true,
  },

  android: {
    allowMixedContent: true,
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: "#0a0a0f",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
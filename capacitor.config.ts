import type { CapacitorConfig } from "@capacitor/cli";

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
};

export default config;
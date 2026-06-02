"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";

export default function CapacitorApp() {
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        // Configure Status Bar
        const setupStatusBar = async () => {
            try {
                await StatusBar.setStyle({ style: Style.Dark });
                await StatusBar.setBackgroundColor({ color: "#0a0a0f" });
                await StatusBar.setOverlaysWebView({ overlay: false });
            } catch (e) {
                console.warn("StatusBar setup failed", e);
            }
        };

        // Configure Keyboard logic (if any specific event handling needed)
        // The resize mode is already handled in capacitor.config.ts

        // Progressive loading: hide splash only after a short delay to ensure React is ready
        const setupSplash = async () => {
            try {
                setTimeout(async () => {
                    await SplashScreen.hide();
                }, 1500);
            } catch (e) {
                console.warn("SplashScreen setup failed", e);
            }
        };

        setupStatusBar();
        setupSplash();
    }, []);

    return null;
}

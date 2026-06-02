"use client";

import { useEffect } from "react";

export default function MobileViewport() {
    useEffect(() => {
        const updateHeight = () => {
            // Use window.innerHeight to set a CSS variable for the actual viewport height
            // This is more reliable than 100vh on mobile devices when keyboards/toolbars appear
            const height = window.innerHeight;
            document.documentElement.style.setProperty("--app-height", `${height}px`);
        };

        window.addEventListener("resize", updateHeight);
        window.addEventListener("orientationchange", updateHeight);

        // Initial call
        updateHeight();

        return () => {
            window.removeEventListener("resize", updateHeight);
            window.removeEventListener("orientationchange", updateHeight);
        };
    }, []);

    return null;
}

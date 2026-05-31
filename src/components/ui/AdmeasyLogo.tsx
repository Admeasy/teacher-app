"use client";

import { motion } from "framer-motion";

const logoMark = "/admeasy-mark.png";
const logoLoader = "/admeasy-loader.gif";

export type LogoState =
  | "idle"
  | "listening"
  | "thinking"
  | "processing"
  | "executing"
  | "speaking"
  | "error";

interface Props {
  state?: LogoState;
  size?: number;
  className?: string;
}

const ANIMATING: LogoState[] = ["listening", "thinking", "processing", "executing", "speaking"];

export default function AdmeasyLogo({ state = "idle", size = 56, className = "" }: Props) {
  const animating = ANIMATING.includes(state);

  const glow =
    state === "speaking" ? "0 0 60px hsl(263 90% 70% / 0.7)" :
    state === "listening" ? "0 0 50px hsl(263 90% 70% / 0.55)" :
    state === "error" ? "0 0 40px hsl(0 80% 60% / 0.5)" :
    animating ? "0 0 45px hsl(263 80% 65% / 0.55)" :
    "0 0 18px hsl(263 70% 60% / 0.2)";

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size, filter: `drop-shadow(${glow})` }}
    >
      {/* Static mark (idle) */}
      <motion.img
        src={logoMark}
        alt="Admeasy"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain select-none"
        animate={{ opacity: animating ? 0 : 1 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
      />

      {/* Animated GIF (active states) */}
      <motion.img
        src={logoLoader}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        animate={{ opacity: animating ? 1 : 0 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
      />
    </div>
  );
}

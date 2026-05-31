"use client";

import { toast as sonnerToast } from "sonner";

type ToastInput =
  | string
  | {
      title?: string;
      description?: string;
      variant?: "default" | "destructive";
    };

export function toast(input: ToastInput) {
  if (typeof input === "string") {
    return sonnerToast(input);
  }

  const message = input.title ?? input.description ?? "";
  const options = { description: input.title ? input.description : undefined };

  if (input.variant === "destructive") {
    return sonnerToast.error(message, options);
  }

  return sonnerToast(message, options);
}

export function useToast() {
  return { toast, toasts: [] };
}

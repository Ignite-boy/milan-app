"use client";

import { FadeIn } from "../ui/Motion";

export default function SectionReveal({ children }) {
  return <FadeIn>{children}</FadeIn>;
}

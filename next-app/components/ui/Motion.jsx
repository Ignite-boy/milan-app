"use client";

import { motion } from "framer-motion";

export function FadeIn({ children, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function Pressable({ children, className = "", ...props }) {
  return (
    <motion.button
      className={className}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.08 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

"use client";

import type { ReactNode } from "react";

export function DruckKnopf({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {children}
    </button>
  );
}

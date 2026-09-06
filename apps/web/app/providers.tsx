"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WorkspaceProvider } from "@/lib/workspace-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </QueryClientProvider>
  );
}

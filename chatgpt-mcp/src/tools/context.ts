import type { AuthedSession } from "../oauth/tokens.js";

export type ToolContext = {
  session: AuthedSession;
  ip?: string | null;
};

export function naira(amount: number): string {
  return `₦${Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
    structuredContent: { success: false, error: message },
  };
}

export function toolOk(params: {
  text: string;
  structured: Record<string, unknown>;
  widgetUri?: string;
}) {
  return {
    content: [{ type: "text" as const, text: params.text }],
    structuredContent: params.structured,
    _meta: params.widgetUri
      ? {
          ui: { resourceUri: params.widgetUri },
        }
      : undefined,
  };
}

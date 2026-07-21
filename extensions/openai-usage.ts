import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openai-codex";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const WEEK_SECONDS = 7 * 24 * 60 * 60;

type UsageWindow = {
  used_percent: number;
  limit_window_seconds: number;
  reset_at: number;
};

type UsageResponse = {
  rate_limit?: {
    primary_window?: UsageWindow | null;
    secondary_window?: UsageWindow | null;
  } | null;
};

function getAccountId(token: string) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return undefined;

    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      "https://api.openai.com/auth"?: { chatgpt_account_id?: string };
    };
    return payload["https://api.openai.com/auth"]?.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

function getWeeklyWindow(payload: UsageResponse) {
  const windows = [payload.rate_limit?.primary_window, payload.rate_limit?.secondary_window];
  return windows.find(
    (window): window is UsageWindow =>
      window != null && Math.abs(window.limit_window_seconds - WEEK_SECONDS) <= 24 * 60 * 60,
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show OpenAI Codex weekly usage",
    handler: async (_args, ctx) => {
      try {
        const model = ctx.modelRegistry
          .getAll()
          .find((candidate) => candidate.provider === PROVIDER);
        if (!model) throw new Error("OpenAI Codex is not available in this Pi installation.");

        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok || !auth.apiKey) {
          throw new Error("OpenAI Codex is not logged in. Run /login and select OpenAI.");
        }

        const accountId = getAccountId(auth.apiKey);
        if (!accountId)
          throw new Error("Could not read the ChatGPT account ID from the OpenAI login.");

        const response = await fetch(USAGE_URL, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${auth.apiKey}`,
            "ChatGPT-Account-Id": accountId,
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`OpenAI usage request failed (${response.status}).`);

        const weekly = getWeeklyWindow((await response.json()) as UsageResponse);
        if (!weekly) throw new Error("OpenAI did not return a weekly usage window.");

        const used = Math.round(weekly.used_percent);
        const remaining = Math.max(0, 100 - used);
        const reset = new Date(weekly.reset_at * 1000).toLocaleString();
        ctx.ui.notify(
          `OpenAI weekly: ${used}% used · ${remaining}% remaining · resets ${reset}`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CancellableLoader } from "@earendil-works/pi-tui";

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
    description: "Show OpenAI weekly usage",
    handler: async (_args, ctx) => {
      const fetchUsage = async (signal: AbortSignal) => {
        const model = ctx.modelRegistry
          .getAll()
          .find((candidate) => candidate.provider === PROVIDER);
        if (!model) throw new Error("OpenAI is not available in this Pi installation.");

        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok || !auth.apiKey) {
          throw new Error("OpenAI is not logged in. Run /login and select OpenAI.");
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
          signal,
        });
        if (!response.ok) throw new Error(`OpenAI usage request failed (${response.status}).`);

        const weekly = getWeeklyWindow((await response.json()) as UsageResponse);
        if (!weekly) throw new Error("OpenAI did not return a weekly usage window.");
        return weekly;
      };

      try {
        let weekly: UsageWindow;

        if (ctx.mode === "tui") {
          const result = await ctx.ui.custom<UsageWindow | Error | null>(
            (tui, theme, _keybindings, done) => {
              const loader = new CancellableLoader(
                tui,
                (text) => theme.fg("accent", text),
                (text) => theme.fg("muted", text),
                "Fetching usage...",
              );
              loader.setIndicator({ frames: ["|", "/", "-", "\\"], intervalMs: 100 });
              loader.onAbort = () => done(null);

              void fetchUsage(AbortSignal.any([loader.signal, AbortSignal.timeout(10_000)])).then(
                done,
                (error: unknown) => {
                  if (!loader.signal.aborted) {
                    done(error instanceof Error ? error : new Error(String(error)));
                  }
                },
              );

              return loader;
            },
          );

          if (result === null) {
            ctx.ui.notify("Cancelled", "info");
            return;
          }
          if (result instanceof Error) throw result;
          weekly = result;
        } else {
          weekly = await fetchUsage(AbortSignal.timeout(10_000));
        }

        const used = Math.round(weekly.used_percent);
        const remaining = Math.max(0, 100 - used);
        const reset = new Date(weekly.reset_at * 1000).toLocaleString();
        ctx.ui.notify(`Weekly: ${used}% used · ${remaining}% remaining · resets ${reset}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}

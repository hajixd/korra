import { createCopytradeDashboardResponse } from "../../copytradeEmbeddedResponse";

const buildMt5PopupFallbackHtml = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connecting MT5</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #e2e8f0;
        font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        padding: 24px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.24);
        box-shadow: 0 20px 60px rgba(2, 6, 23, 0.45);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      p {
        margin: 0;
        color: #cbd5e1;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Connecting MT5...</h1>
      <p id="status">Return to the Korra tab if this window does not close automatically.</p>
    </main>
    <script>
      (async function run() {
        var statusNode = document.getElementById("status");
        try {
          if (window.opener && typeof window.opener.__korraRunInlineMt5Connect === "function") {
            statusNode.textContent = "Sending the MT5 connection back to Korra...";
            await window.opener.__korraRunInlineMt5Connect();
            statusNode.textContent = "Connected. Closing this tab...";
            if (window.opener && typeof window.opener.focus === "function") {
              window.opener.focus();
            }
            window.setTimeout(function () {
              window.close();
            }, 300);
            return;
          }

          statusNode.textContent = "Return to the Korra tab to finish connecting MT5.";
        } catch (error) {
          statusNode.textContent =
            error && error.message ? error.message : "MT5 connection failed. Return to Korra to try again.";
        }
      })();
    </script>
  </body>
</html>`;

export async function GET(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.includes("/connect-to-broker/callback/mt5")) {
    return new Response(buildMt5PopupFallbackHtml(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  return createCopytradeDashboardResponse();
}

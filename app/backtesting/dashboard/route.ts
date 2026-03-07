export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en" style="height:100%">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Copy Trade Dashboard</title>
    <link rel="stylesheet" href="/copytrade/dashboard.css" />
  </head>
  <body style="margin:0;height:100%;overflow:hidden">
    <div id="root" style="height:100%"></div>
    <script src="/copytrade/dashboard.js" defer></script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

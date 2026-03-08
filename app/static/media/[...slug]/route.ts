const TRANSPARENT_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
  0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99,
  248, 15, 4, 0, 9, 251, 3, 253, 167, 93, 219, 114, 0, 0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130
]);

const BLANK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>';

const CACHE_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable"
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> }
) {
  const { slug = [] } = await context.params;
  const pathname = slug.join("/");
  const extension = pathname.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "png") {
    return new Response(TRANSPARENT_PNG, {
      headers: {
        ...CACHE_HEADERS,
        "content-type": "image/png"
      }
    });
  }

  if (extension === "svg") {
    return new Response(BLANK_SVG, {
      headers: {
        ...CACHE_HEADERS,
        "content-type": "image/svg+xml; charset=utf-8"
      }
    });
  }

  return new Response(null, {
    status: 204,
    headers: CACHE_HEADERS
  });
}

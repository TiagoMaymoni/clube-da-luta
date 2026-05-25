import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("missing url", { status: 400 });

  try {
    const res = await fetch(url);
    if (!res.ok) return new Response("upstream error", { status: 502 });
    const data = await res.arrayBuffer();
    return new Response(data, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("fetch failed", { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT || "https://dev.sv.haha.me/graphql";

const API_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": process.env.DEPOSIT_INTENT_ADMIN_API_KEY || "",
};

export async function POST(request: NextRequest) {
  if (!API_HEADERS["x-api-key"]) {
    return NextResponse.json(
      { error: "DEPOSIT_INTENT_ADMIN_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _raw: text };
    }

    if (!response.ok) {
      return NextResponse.json(
        parsed ?? { error: `GraphQL request failed: ${response.statusText}` },
        { status: response.status },
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("GraphQL admin proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

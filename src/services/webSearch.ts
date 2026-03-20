import { getEnv } from "../utils/env.js";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

/**
 * Search the web for better deals on a service/product.
 * Returns a concise summary of search results for AI consumption.
 */
export async function searchBetterDeals(
  serviceName: string,
  currentPrice: number,
  city: string,
): Promise<string | null> {
  const env = getEnv();
  if (!env.TAVILY_API_KEY) return null;

  const query = `best cheap ${serviceName} plans ${city} ${new Date().getFullYear()} price`;

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query,
        max_results: 5,
        include_answer: false,
        search_depth: "basic",
      }),
    });

    if (!response.ok) {
      console.error(`Tavily search failed: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as TavilyResponse;

    if (!data.results || data.results.length === 0) return null;

    // Build a concise summary for AI
    const snippets = data.results
      .slice(0, 3)
      .map((r) => `[${r.title}]: ${r.content.slice(0, 300)}`)
      .join("\n\n");

    return `Current user expense: ${serviceName} at $${currentPrice}/mo in ${city}.\n\nWeb search results:\n${snippets}`;
  } catch (error) {
    console.error("Web search error:", error);
    return null;
  }
}

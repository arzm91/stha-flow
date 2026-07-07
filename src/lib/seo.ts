type PageHeadOptions = {
  title: string;
  description: string;
  path?: string | ((params: Record<string, string>) => string);
};

/**
 * Returns a TanStack Router `head` function with unique page metadata and a
 * self-referencing canonical link. Use it in leaf routes so every page has
 * its own title/description instead of inheriting the root defaults.
 */
export function pageHead({ title, description, path }: PageHeadOptions) {
  return ({ params }: { params?: Record<string, string> }) => {
    const canonicalPath =
      typeof path === "function" ? path(params ?? ({} as Record<string, string>)) : path;
    const baseUrl = "https://sthapc.cloud";
    const canonical = canonicalPath ? `${baseUrl}${canonicalPath}` : undefined;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical ?? `${baseUrl}/` },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: canonical ? [{ rel: "canonical", href: canonical }] : [],
    };
  };
}

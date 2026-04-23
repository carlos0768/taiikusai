type PrefetchRouter = {
  prefetch: (href: string) => void | Promise<void>;
};

export function prefetchRoutes(
  router: PrefetchRouter,
  hrefs: Array<string | null | undefined>
) {
  const uniqueHrefs = [...new Set(hrefs.filter(Boolean))] as string[];

  for (const href of uniqueHrefs) {
    try {
      void router.prefetch(href);
    } catch {
      // Ignore best-effort prefetch failures.
    }
  }
}

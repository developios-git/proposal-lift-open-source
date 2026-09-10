import { Suspense } from "react";
import ResourcesPageClient from "./ResourcesPageClient";
import { Loader2 } from "lucide-react";

/**
 * The client reads `?video=` through `useSearchParams`, which suspends during
 * prerender. Without this boundary the whole route opts out of static
 * rendering and the build warns about it.
 */
function ResourcesFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2
        className="size-8 animate-spin text-muted-foreground"
        aria-hidden
      />
      <span className="sr-only">Loading resources</span>
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense fallback={<ResourcesFallback />}>
      <ResourcesPageClient />
    </Suspense>
  );
}

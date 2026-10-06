import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside the shell while a page chunk loads, so the navbar and tab bar never blink away. */
const PageSkeleton = () => (
  <div className="container mx-auto px-4 pt-24 pb-10 space-y-4" aria-busy="true" aria-live="polite">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-72 max-w-full" />
    <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  </div>
);

export default PageSkeleton;

import { homeRouteFor } from "@handyfix/shared";
import { Redirect } from "expo-router";
import { useSession } from "@/features/auth/session-provider";

/** Entry point: send each state to its home. (Guards in the root layout enforce the same rules.) */
export default function Index() {
  const { status, role } = useSession();
  if (status !== "ready") return <Redirect href="/sign-in" />;
  return <Redirect href={homeRouteFor(role)} />;
}

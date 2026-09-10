import { redirect } from "next/navigation";

/**
 * There is no marketing site in this build, so `/` is not a page, it is a
 * doorway. Signed-in users are bounced onward from /login by the proxy, so a
 * single unconditional redirect covers both cases.
 */
export default function RootPage() {
  redirect("/login");
}

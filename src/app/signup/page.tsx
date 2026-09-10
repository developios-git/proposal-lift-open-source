import { SignupPageClient } from "./SignupPageClient";
import { isGoogleAuthEnabled } from "@/lib/auth/google-auth-enabled";

export default function SignupPage() {
  return <SignupPageClient googleEnabled={isGoogleAuthEnabled()} />;
}

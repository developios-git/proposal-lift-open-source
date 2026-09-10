import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";

function ProfileEditFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function ProfileEditPage() {
  return (
    <Suspense fallback={<ProfileEditFallback />}>
      <ProfileEditForm />
    </Suspense>
  );
}

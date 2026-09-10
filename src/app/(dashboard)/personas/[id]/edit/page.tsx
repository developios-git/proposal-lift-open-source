"use client";

import { apiFetch } from "@/lib/api-fetch";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonaForm } from "@/components/personas/PersonaForm";
import { useEffect, useState } from "react";
import type { Persona } from "@/types";
import { toast } from "sonner";

export default function EditPersonaPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        const res = await apiFetch(`/api/personas/${id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Not found");
        }
        setPersona(data.persona);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
        router.push("/personas");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, router]);

  return (
    // w-full is load-bearing: the dashboard shell is a column flex container,
    // and mx-auto on a flex item overrides align-items:stretch, so without it
    // the page shrinks to fit its content. While loading that is just the
    // header and a spinner, which collapsed the page to a narrow centered
    // column that then jumped wide once the form arrived.
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/personas" aria-label="Back to personas">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit persona</h1>
          <p className="text-sm text-muted-foreground">
            Update the profile the AI uses for this identity.
          </p>
        </div>
      </div>


      {loading ? (
        // Mirrors PersonaForm's two-column layout so the page does not reflow
        // when the data lands.
        <div
          className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3"
          role="status"
          aria-busy="true"
          aria-label="Loading persona"
        >
          <div className="space-y-6 lg:col-span-2">
            {[0, 1, 2].map((section) => (
              <div
                key={section}
                className="overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-border/60"
              >
                <div className="border-b border-border/70 bg-muted/30 px-5 py-4 sm:px-6">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </div>
                <div className="space-y-4 p-5 sm:p-6">
                  <Skeleton className="h-11 w-full" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="border-b bg-muted/50 p-6">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
              <div className="flex flex-col items-center p-8">
                <Skeleton className="size-40 rounded-full" />
                <div className="mt-10 w-full space-y-4">
                  {[0, 1, 2, 3, 4, 5].map((row) => (
                    <Skeleton key={row} className="h-5 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : persona ? (
        <PersonaForm
          mode="edit"
          personaId={persona.id}
          initial={persona}
          onSuccess={() => router.push("/personas")}
          onCancel={() => router.push("/personas")}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  filterCountriesBySearch,
} from "@/lib/country-filter";


function CountryPickerBlock({
  label,
  description,
  variant,
  selected,
  onChange,
}: {
  label: string;
  /** Rendered under the label. Upstream took this prop and never used it. */
  description: string;
  variant: "include" | "exclude";
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => filterCountriesBySearch(search), [search]);

  const toggle = (canonical: string) => {
    if (selected.includes(canonical)) {
      onChange(selected.filter((c) => c !== canonical));
    } else {
      onChange([...selected, canonical]);
    }
  };

  const remove = (canonical: string) => {
    onChange(selected.filter((c) => c !== canonical));
  };


  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-xs font-semibold tracking-normal text-foreground">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-10 w-full flex-col items-stretch gap-0.5 border-border bg-white px-3 py-2 text-left shadow-xs hover:bg-accent/40"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                {variant === "include"
                  ? "Select countries to include"
                  : "Select countries to exclude"}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <div className="border-b border-border px-3 py-2">
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
              aria-label={`Search countries for ${label}`}
            />
          </div>
          <ul
            className="max-h-56 overflow-y-auto p-1.5"
            role="listbox"
            aria-label={label}
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                No countries match your search.
              </li>
            ) : (
              filtered.map((c) => {
                const isOn = selected.includes(c);
                return (
                  <li key={c}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isOn}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-accent",
                        isOn && "bg-accent/70",
                      )}
                      onClick={() => toggle(c)}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {c}
                      </span>
                      {isOn ? (
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden
                        />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {selected.map((c) => {
            return (
              <Badge
                key={c}
                variant="outline"
                className="h-7 max-w-full gap-1.5 border-border py-0 pl-1.5 pr-0.5 font-normal"
              >
                <span className="max-w-[140px] truncate text-[11px]">{c}</span>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${c}`}
                  onClick={() => remove(c)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ClientCountryFilterControls({
  includeCountries,
  excludeCountries,
  onIncludeChange,
  onExcludeChange,
}: {
  includeCountries: string[];
  excludeCountries: string[];
  onIncludeChange: (next: string[]) => void;
  onExcludeChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-5">
      <CountryPickerBlock
        label="Include"
        description="Only show jobs whose client location matches one of these countries. Jobs with no country are hidden when this list is non-empty."
        variant="include"
        selected={includeCountries}
        onChange={onIncludeChange}
      />
      <CountryPickerBlock
        label="Exclude"
        description="Hide jobs from these client countries. Applied after include, so overlaps are removed from the result set."
        variant="exclude"
        selected={excludeCountries}
        onChange={onExcludeChange}
      />
    </div>
  );
}

"use client";

import * as React from "react"
import { ResponsiveContainer, Tooltip } from "recharts"

import { cn } from "@/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
  }
>

const ChartConfigContext = React.createContext<ChartConfig | null>(null)

function ChartContainer({
  id,
  className,
  config,
  children,
}: React.ComponentProps<"div"> & {
  config: ChartConfig
}) {
  const chartId = React.useId()
  const resolvedId = id ?? chartId
  const style = React.useMemo(() => {
    const vars: Record<string, string> = {}
    for (const [key, item] of Object.entries(config)) {
      if (!item.color) continue
      vars[`--color-${key}`] = item.color
    }
    return vars as React.CSSProperties
  }, [config])

  return (
    <ChartConfigContext.Provider value={config}>
      <div
        data-chart={resolvedId}
        className={cn(
          "text-foreground flex aspect-video justify-center rounded-lg [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-layer]:outline-none",
          className
        )}
        style={style}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartConfigContext.Provider>
  )
}

function useChartConfig() {
  const ctx = React.useContext(ChartConfigContext)
  return ctx ?? {}
}

function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  className,
  formatter,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string
    name?: string
    value?: unknown
  }>
  label?: unknown
  formatter?: (value: unknown) => React.ReactNode
  className?: string
  labelFormatter?: (label: unknown) => React.ReactNode
}) {
  const config = useChartConfig()

  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        "bg-popover text-popover-foreground rounded-lg border shadow-md px-3 py-2 text-xs min-w-40",
        className
      )}
    >
      <div className="text-muted-foreground mb-2 font-medium">
        {labelFormatter ? labelFormatter(label) : (label as React.ReactNode)}
      </div>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry, i) => {
          const key = (entry.dataKey ?? entry.name ?? "") as string
          const item = config[key]
          const value = entry.value
          return (
            <div
              key={`${String(key)}-${i}`}
              className="flex items-baseline justify-between gap-4"
            >
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      item?.color ?? `var(--color-${String(key)})`,
                  }}
                />
                <span>{(item?.label ?? key) as React.ReactNode}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {formatter ? formatter(value) : (value as React.ReactNode)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ChartContainer, ChartTooltipContent, Tooltip as ChartTooltip }


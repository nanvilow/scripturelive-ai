"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"
import { setBroadcastSuppressed } from "@/lib/broadcast-gate"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onPointerDown: onPointerDownProp,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  // v0.7.234 — Pause the OutputBroadcaster while the user is actively
  // dragging the thumb so we do not fan out 60 POST/s + 60 receiver
  // re-renders. Release on the FIRST window-level pointerup or
  // pointercancel after pointerdown — covers the common case (thumb
  // release outside the track) and the keyboard-arrow nudge case
  // (pointerdown fires from synthetic pointer events on some browsers,
  // pointerup fires on the same tick → gate flips off immediately).
  // Cleanup on unmount is a belt-and-brace against mid-drag teardown.
  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setBroadcastSuppressed(true)
      const release = () => {
        setBroadcastSuppressed(false)
        window.removeEventListener('pointerup', release)
        window.removeEventListener('pointercancel', release)
      }
      window.addEventListener('pointerup', release)
      window.addEventListener('pointercancel', release)
      onPointerDownProp?.(e)
    },
    [onPointerDownProp]
  )

  React.useEffect(() => {
    return () => {
      // If the component unmounts while suppressed (e.g. operator
      // navigates away from Settings mid-drag), guarantee the gate is
      // released. A stuck-true gate would silently freeze every SSE
      // broadcast.
      setBroadcastSuppressed(false)
    }
  }, [])

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      onPointerDown={handlePointerDown}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }

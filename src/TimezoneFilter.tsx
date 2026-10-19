import { lazy, Suspense, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Slider } from "@base-ui/react/slider";
import { Button } from "./ui.tsx";
import {
  formatUtcOffset,
  formatRotatedTimezoneRange,
  timezoneBounds,
  type TimezoneRange,
} from "../core/timezone-range.ts";
const TimezoneMap = lazy(() =>
  import("./TimezoneMap.tsx").then((module) => ({
    default: module.TimezoneMap,
  })),
);

export function TimezoneFilter({
  value,
  offset,
  onChange,
  offsets,
  mapError,
  onRetryMap,
}: {
  value: TimezoneRange | null;
  offset: number;
  onChange: (value: TimezoneRange | null, offset: number) => void;
  offsets?: Record<string, number[]>;
  mapError: boolean;
  onRetryMap: () => void;
}) {
  const [draft, setDraft] = useState<TimezoneRange>(
    value || [...timezoneBounds],
  );
  const [draftOffset, setDraftOffset] = useState(offset);
  const labels = formatRotatedTimezoneRange(draft, draftOffset);
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) {
          setDraft(value || [...timezoneBounds]);
          setDraftOffset(offset);
        }
      }}
    >
      <Popover.Trigger
        className="ui-select timezone-filter"
        aria-label="Timezone"
      >
        {value
          ? formatRotatedTimezoneRange(value, offset).join(" – ")
          : "Any timezone"}
        <span aria-hidden>⌄</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={4}
          align="start"
          className="ui-positioner"
        >
          <Popover.Popup className="ui-menu timezone-options">
            <Popover.Title className="timezone-title">Timezone</Popover.Title>
            <Suspense
              fallback={
                <p className="timezone-map-status" role="status">
                  Loading map…
                </p>
              }
            >
              <TimezoneMap
                range={draft}
                rotation={draftOffset}
                offsets={offsets}
                error={mapError}
                onRetry={onRetryMap}
              />
            </Suspense>
            <div className="timezone-values">
              <span>{labels[0]}</span>
              <span>{labels[1]}</span>
            </div>
            <Slider.Root
              value={draft}
              min={timezoneBounds[0]}
              max={timezoneBounds[1]}
              step={15}
              largeStep={60}
              thumbCollisionBehavior="none"
              onValueChange={(next) => {
                setDraft(next as TimezoneRange);
              }}
              onValueCommitted={(next) =>
                onChange(next as TimezoneRange, draftOffset)
              }
            >
              <Slider.Control className="timezone-slider">
                <Slider.Track className="timezone-track">
                  <Slider.Indicator className="timezone-indicator" />
                  {[0, 1].map((index) => (
                    <Slider.Thumb
                      key={index}
                      index={index}
                      className="timezone-thumb"
                      aria-label={
                        index === 0
                          ? "Minimum UTC offset"
                          : "Maximum UTC offset"
                      }
                      getAriaValueText={() => labels[index]}
                    />
                  ))}
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <div className="timezone-values">
              <span>Offset</span>
              <span>{formatUtcOffset(draftOffset).replace("UTC", "")}</span>
            </div>
            <Slider.Root
              value={draftOffset}
              min={-720}
              max={720}
              step={15}
              largeStep={60}
              onValueChange={(next) => setDraftOffset(next as number)}
              onValueCommitted={(next) =>
                onChange(value === null ? null : draft, next as number)
              }
            >
              <Slider.Control className="timezone-slider">
                <Slider.Track className="timezone-track">
                  <Slider.Thumb
                    className="timezone-thumb"
                    aria-label="Timezone window offset"
                    getAriaValueText={(_, n) =>
                      formatUtcOffset(n).replace("UTC", "")
                    }
                  />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <Popover.Description className="timezone-description">
              Matches any current timezone in a listed country, including
              daylight saving time. Offset rotates the map and matching window
              around a 24-hour clock. Unknown countries are excluded.
            </Popover.Description>
            <Button
              variant="ghost"
              disabled={!value && offset === 0}
              onClick={() => {
                onChange(null, 0);
                setDraft([...timezoneBounds]);
                setDraftOffset(0);
              }}
            >
              Clear timezone
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

import countries from "./timezone-map.json";
import { Button } from "./ui.tsx";
import {
  formatUtcOffset,
  formatRotatedTimezoneRange,
  offsetsMatchRange,
  wrapTimezoneMinutes,
  timezoneCycle,
  type TimezoneRange,
} from "../core/timezone-range.ts";

export function TimezoneMap({
  range,
  rotation,
  offsets,
  error,
  onRetry,
}: {
  range: TimezoneRange;
  rotation: number;
  offsets?: Record<string, number[]>;
  error: boolean;
  onRetry: () => void;
}) {
  const shift = (wrapTimezoneMinutes(rotation) / timezoneCycle) * 720;
  const labels = formatRotatedTimezoneRange(range, rotation);
  if (!offsets || error)
    return (
      <div className="timezone-map-status" role="status">
        {error ? "Country map unavailable." : "Loading country timezones…"}
        {error && (
          <Button variant="ghost" onClick={onRetry}>
            Retry map
          </Button>
        )}
      </div>
    );
  const matching = countries.countries.filter((country) =>
    offsetsMatchRange(offsets[country.code] || [], range, rotation),
  );
  return (
    <figure className="timezone-map">
      <svg
        viewBox="0 0 720 360"
        role="img"
        aria-label={`Countries matching ${labels[0]} to ${labels[1]}`}
      >
        <desc>
          {matching.map((country) => country.name).join(", ") ||
            "No matching countries"}
        </desc>
        <g className="timezone-map-world" data-rotation={rotation}>
          {[0, 720].map((copy) => (
            <g key={copy} transform={`translate(${copy - shift} 0)`}>
              {countries.countries.map((country) => {
                const values = offsets[country.code] || [];
                const matches = offsetsMatchRange(values, range, rotation);
                return (
                  <g
                    key={country.name}
                    data-country={country.code}
                    data-matches={matches}
                  >
                    <title>
                      {country.name}:{" "}
                      {values.length
                        ? [...values]
                            .sort((a, b) => a - b)
                            .map(formatUtcOffset)
                            .join(", ")
                        : "Timezone unavailable"}
                      {matches ? " — matches range" : ""}
                    </title>
                    <path d={country.path} fillRule="evenodd" />
                    {country.marker && (
                      <circle
                        cx={country.marker[0]}
                        cy={country.marker[1]}
                        r="2.5"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </g>
      </svg>
      <figcaption>{matching.length} countries and territories match</figcaption>
    </figure>
  );
}

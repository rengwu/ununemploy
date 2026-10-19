// Regenerate from Natural Earth's public-domain 1:50m admin_0_countries GeoJSON.
// Usage: node scripts/build-timezone-map.mjs /path/to/ne_50m_admin_0_countries.geojson
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const input = readFileSync(process.argv[2]);
function simplify(points, tolerance = 0.16) {
  if (points.length <= 2) return points;
  const [x, y] = points[0];
  const [endX, endY] = points.at(-1);
  const dx = endX - x,
    dy = endY - y,
    length = dx * dx + dy * dy;
  let farthest = 0,
    distance = tolerance * tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((points[i][0] - x) * dx + (points[i][1] - y) * dy) / length,
          ),
        )
      : 0;
    const d =
      (points[i][0] - x - t * dx) ** 2 + (points[i][1] - y - t * dy) ** 2;
    if (d > distance) {
      farthest = i;
      distance = d;
    }
  }
  return farthest
    ? [
        ...simplify(points.slice(0, farthest + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(farthest), tolerance),
      ]
    : [points[0], points.at(-1)];
}
const point = ([x, y]) => [
  Number(((x + 180) * 2).toFixed(1)),
  Number(((90 - y) * 2).toFixed(1)),
];
const countries = JSON.parse(input).features.map(
  ({ properties: p, geometry }) => {
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    const rings = polygons.flat();
    const coordinates = rings.flat();
    const width =
      Math.max(...coordinates.map((p) => p[0])) -
      Math.min(...coordinates.map((p) => p[0]));
    const height =
      Math.max(...coordinates.map((p) => p[1])) -
      Math.min(...coordinates.map((p) => p[1]));
    return {
      code: /^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH : "",
      name: p.ADMIN,
      path: rings
        .map((ring) => simplify(ring))
        .filter((ring) => ring.length >= 4)
        .map(
          (ring) =>
            "M" +
            ring
              .slice(0, -1)
              .map((p) => point(p).join(","))
              .join("L") +
            "Z",
        )
        .join(""),
      // Keep small islands and microstates visible at popover scale.
      marker:
        Math.max(width, height) < 1.5 ? point([p.LABEL_X, p.LABEL_Y]) : null,
    };
  },
);
const output = {
  sourceSha256: createHash("sha256").update(input).digest("hex"),
  countries,
};
writeFileSync(
  new URL("../src/timezone-map.json", import.meta.url),
  JSON.stringify(output) + "\n",
);
console.log(
  `Wrote ${countries.length} country outlines (${JSON.stringify(output).length} bytes)`,
);

import { useEffect, useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "./ui.tsx";
import { searchLocation, type LocationOption } from "../core/locations.ts";
import { locationRegions } from "../core/location-regions.ts";

const countryLabels = new Intl.DisplayNames(["en"], { type: "region" });
const storedLabel = (id: string) =>
  id.startsWith("region:")
    ? locationRegions.find((r) => `region:${r.id}` === id)?.label || "Region"
    : /^country:[A-Z]{2}$/.test(id)
      ? countryLabels.of(id.slice(8)) || "Country"
      : id;

export function LocationFilter({
  options,
  value,
  onChange,
}: {
  options: LocationOption[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const normalized = value.map(
      (id) => options.find((o) => o.legacyValues?.includes(id))?.value || id,
    );
    if (normalized.some((id, index) => id !== value[index]))
      onChange([...new Set(normalized)]);
  }, [options, value, onChange]);
  const selected = value.map(
    (id) =>
      options.find((item) => item.value === id) || {
        value: id,
        label: storedLabel(id),
      },
  );
  const allItems = [
    ...options,
    ...selected.filter((s) => !options.some((o) => o.value === s.value)),
  ];
  const groups = useMemo(() => {
    const result = new Map<string, LocationOption[]>();
    for (const item of allItems) {
      if (
        query.trim()
          ? !searchLocation(item, query)
          : item.kind === "place" && !value.includes(item.value)
      )
        continue;
      const group = item.group || "Cities and other locations";
      const items = result.get(group) || [];
      items.push(item);
      result.set(group, items);
    }
    return [...result].map(([value, items]) => ({ value, items }));
  }, [options, value, query]);
  return (
    <Combobox.Root
      multiple
      items={groups}
      value={selected}
      onValueChange={(items) => onChange(items.map((item) => item.value))}
      isItemEqualToValue={(a, b) => a.value === b.value}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      filter={null}
    >
      <Combobox.Trigger
        className="ui-select location-filter"
        aria-label="Location"
        title={selected.map((item) => item.label).join(", ") || "Any location"}
      >
        {value.length === 0
          ? "Any location"
          : value.length === 1
            ? selected[0].label
            : `Locations (${value.length})`}
        <span aria-hidden>⌄</span>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={4}
          align="start"
          className="ui-positioner"
        >
          <Combobox.Popup className="ui-menu location-options">
            <Combobox.Input
              className="ui-input"
              aria-label="Search locations"
              placeholder="Search city, country, or region"
            />
            <Combobox.Empty className="ui-menu-empty">
              No locations found
            </Combobox.Empty>
            <Combobox.List className="location-list">
              {(group: { value: string; items: LocationOption[] }) => (
                <Combobox.Group key={group.value} items={group.items}>
                  <Combobox.GroupLabel className="ui-group-label">
                    {group.value}
                  </Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(item: LocationOption) => (
                      <Combobox.Item
                        className="ui-option"
                        key={item.value}
                        value={item}
                      >
                        {item.kind === "region" &&
                        item.group !== "Regions" &&
                        item.group !== "Other regions"
                          ? `All ${item.label}`
                          : item.label}
                        <Combobox.ItemIndicator>✓</Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
            {value.length > 0 && (
              <div className="location-filter-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    onChange([]);
                    setQuery("");
                  }}
                >
                  Clear locations
                </Button>
              </div>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

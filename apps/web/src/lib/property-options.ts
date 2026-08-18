/**
 * Human labels for the structured property enums.
 *
 * One source for the seller form, the buyer detail page, the comparison table
 * and the search filters. Defining them per screen is how "Semi furnished",
 * "Semi-Furnished" and "SEMI_FURNISHED" end up on three different pages of the
 * same product.
 */

export interface Option {
  value: string;
  label: string;
}

export const POSSESSION_OPTIONS: readonly Option[] = [
  { value: 'READY_TO_MOVE', label: 'Ready to move' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction' },
];

export const FURNISHING_OPTIONS: readonly Option[] = [
  { value: 'UNFURNISHED', label: 'Unfurnished' },
  { value: 'SEMI_FURNISHED', label: 'Semi furnished' },
  { value: 'FULLY_FURNISHED', label: 'Fully furnished' },
];

export const FACING_OPTIONS: readonly Option[] = [
  { value: 'NORTH', label: 'North' },
  { value: 'SOUTH', label: 'South' },
  { value: 'EAST', label: 'East' },
  { value: 'WEST', label: 'West' },
  { value: 'NORTH_EAST', label: 'North-east' },
  { value: 'NORTH_WEST', label: 'North-west' },
  { value: 'SOUTH_EAST', label: 'South-east' },
  { value: 'SOUTH_WEST', label: 'South-west' },
];

export const OWNERSHIP_OPTIONS: readonly Option[] = [
  { value: 'FREEHOLD', label: 'Freehold' },
  { value: 'LEASEHOLD', label: 'Leasehold' },
  { value: 'CO_OPERATIVE_SOCIETY', label: 'Co-operative society' },
  { value: 'POWER_OF_ATTORNEY', label: 'Power of attorney' },
];

/** Left as acronyms — every Telangana seller and buyer knows them. */
export const APPROVING_AUTHORITY_OPTIONS: readonly Option[] = [
  { value: 'GHMC', label: 'GHMC' },
  { value: 'HMDA', label: 'HMDA' },
  { value: 'DTCP', label: 'DTCP' },
  { value: 'OTHER', label: 'Other' },
];

export const AMENITY_OPTIONS: readonly Option[] = [
  { value: 'LIFT', label: 'Lift' },
  { value: 'POWER_BACKUP', label: 'Power backup' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'CCTV', label: 'CCTV' },
  { value: 'GATED_COMMUNITY', label: 'Gated community' },
  { value: 'GYM', label: 'Gym' },
  { value: 'SWIMMING_POOL', label: 'Swimming pool' },
  { value: 'CLUBHOUSE', label: 'Clubhouse' },
  { value: 'CHILDRENS_PLAY_AREA', label: "Children's play area" },
  { value: 'PARK', label: 'Park' },
  { value: 'WATER_SUPPLY_24_7', label: '24/7 water' },
  { value: 'BOREWELL', label: 'Borewell' },
  { value: 'RAINWATER_HARVESTING', label: 'Rainwater harvesting' },
  { value: 'SOLAR_WATER_HEATER', label: 'Solar water heater' },
  { value: 'INTERCOM', label: 'Intercom' },
  { value: 'FIRE_SAFETY', label: 'Fire safety' },
  { value: 'VISITOR_PARKING', label: 'Visitor parking' },
  { value: 'MAINTENANCE_STAFF', label: 'Maintenance staff' },
  { value: 'WASTE_DISPOSAL', label: 'Waste disposal' },
  { value: 'VAASTU_COMPLIANT', label: 'Vaastu compliant' },
];

/** Builds a value → label lookup for rendering stored enum values. */
function toLookup(options: readonly Option[]): Record<string, string> {
  return Object.fromEntries(options.map((option) => [option.value, option.label]));
}

const LOOKUPS: Record<string, Record<string, string>> = {
  possession: toLookup(POSSESSION_OPTIONS),
  furnishing: toLookup(FURNISHING_OPTIONS),
  facing: toLookup(FACING_OPTIONS),
  ownership: toLookup(OWNERSHIP_OPTIONS),
  approvingAuthority: toLookup(APPROVING_AUTHORITY_OPTIONS),
  amenity: toLookup(AMENITY_OPTIONS),
};

/**
 * Renders a stored enum value.
 *
 * Falls back to a de-underscored version of the raw value rather than showing
 * nothing, so a value added to the database before this file is updated still
 * reads sensibly instead of leaving a blank cell.
 */
export function labelFor(
  group: keyof typeof LOOKUPS | string,
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const lookup = LOOKUPS[group];
  if (lookup?.[value]) {
    return lookup[value]!;
  }
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

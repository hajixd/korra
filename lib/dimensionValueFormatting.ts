export type DimensionRawValueFormat =
  | "number"
  | "signed_number"
  | "percent"
  | "signed_percent"
  | "ratio"
  | "flag"
  | "zscore"
  | "month_phase"
  | "weekday_phase"
  | "hour_phase"
  | "minute_phase"
  | "day_of_year_phase"
  | "week_of_year_phase";

export type DimensionRawDisplayDescriptor = {
  format: DimensionRawValueFormat;
  groupId?: string | null;
  groupLabel?: string | null;
  pairFeatureIndex?: number | null;
  phaseRole?: "sin" | "cos" | null;
  groupLeader?: boolean;
  cycle?: number | null;
  offset?: number;
};

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
] as const;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const RAW_DISPLAY_METADATA: Record<string, DimensionRawDisplayDescriptor[]> = {
  pricePath: [
    { format: "signed_percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "number" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" }
  ],
  rangeTrend: [
    { format: "number" },
    { format: "signed_percent" },
    { format: "ratio" },
    { format: "ratio" },
    { format: "signed_percent" },
    { format: "percent" }
  ],
  wicks: [
    { format: "ratio" },
    { format: "percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "percent" }
  ],
  time: [
    {
      format: "hour_phase",
      groupId: "hour",
      groupLabel: "Hour",
      pairFeatureIndex: 1,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 24,
      offset: 0
    },
    {
      format: "hour_phase",
      groupId: "hour",
      groupLabel: "Hour",
      pairFeatureIndex: 0,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 24,
      offset: 0
    },
    {
      format: "minute_phase",
      groupId: "minute",
      groupLabel: "Minute",
      pairFeatureIndex: 3,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 60,
      offset: 0
    },
    {
      format: "minute_phase",
      groupId: "minute",
      groupLabel: "Minute",
      pairFeatureIndex: 2,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 60,
      offset: 0
    }
  ],
  temporal: [
    { format: "percent" },
    {
      format: "month_phase",
      groupId: "month",
      groupLabel: "Month",
      pairFeatureIndex: 2,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 12,
      offset: 1
    },
    {
      format: "month_phase",
      groupId: "month",
      groupLabel: "Month",
      pairFeatureIndex: 1,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 12,
      offset: 1
    },
    {
      format: "weekday_phase",
      groupId: "weekday",
      groupLabel: "Weekday",
      pairFeatureIndex: 4,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 7,
      offset: 0
    },
    {
      format: "weekday_phase",
      groupId: "weekday",
      groupLabel: "Weekday",
      pairFeatureIndex: 3,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 7,
      offset: 0
    },
    {
      format: "hour_phase",
      groupId: "hour",
      groupLabel: "Hour",
      pairFeatureIndex: 6,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 24,
      offset: 0
    },
    {
      format: "hour_phase",
      groupId: "hour",
      groupLabel: "Hour",
      pairFeatureIndex: 5,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 24,
      offset: 0
    },
    {
      format: "day_of_year_phase",
      groupId: "day_of_year",
      groupLabel: "Day Of Year",
      pairFeatureIndex: 8,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 366,
      offset: 1
    },
    {
      format: "day_of_year_phase",
      groupId: "day_of_year",
      groupLabel: "Day Of Year",
      pairFeatureIndex: 7,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 366,
      offset: 1
    },
    {
      format: "week_of_year_phase",
      groupId: "week_of_year",
      groupLabel: "Week Of Year",
      pairFeatureIndex: 10,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 53,
      offset: 1
    },
    {
      format: "week_of_year_phase",
      groupId: "week_of_year",
      groupLabel: "Week Of Year",
      pairFeatureIndex: 9,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 53,
      offset: 1
    }
  ],
  position: [
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" }
  ],
  topography: [
    { format: "percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "ratio" },
    { format: "percent" }
  ],
  mf__momentum__core: [
    { format: "signed_percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "number" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_number" }
  ],
  mf__mean_reversion__core: [
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "percent" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "zscore" },
    { format: "ratio" },
    { format: "ratio" },
    { format: "number" },
    { format: "signed_percent" }
  ],
  mf__seasons__core: [
    {
      format: "month_phase",
      groupId: "season_month",
      groupLabel: "Month",
      pairFeatureIndex: 1,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 12,
      offset: 1
    },
    {
      format: "month_phase",
      groupId: "season_month",
      groupLabel: "Month",
      pairFeatureIndex: 0,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 12,
      offset: 1
    },
    {
      format: "day_of_year_phase",
      groupId: "season_day_of_year",
      groupLabel: "Day Of Year",
      pairFeatureIndex: 3,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 366,
      offset: 1
    },
    {
      format: "day_of_year_phase",
      groupId: "season_day_of_year",
      groupLabel: "Day Of Year",
      pairFeatureIndex: 2,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 366,
      offset: 1
    },
    {
      format: "week_of_year_phase",
      groupId: "season_week_of_year",
      groupLabel: "Week Of Year",
      pairFeatureIndex: 5,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 53,
      offset: 1
    },
    {
      format: "week_of_year_phase",
      groupId: "season_week_of_year",
      groupLabel: "Week Of Year",
      pairFeatureIndex: 4,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 53,
      offset: 1
    },
    { format: "number" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "ratio" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" }
  ],
  mf__time_of_day__core: [
    {
      format: "hour_phase",
      groupId: "intraday_hour",
      groupLabel: "Hour",
      pairFeatureIndex: 1,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 24,
      offset: 0
    },
    {
      format: "hour_phase",
      groupId: "intraday_hour",
      groupLabel: "Hour",
      pairFeatureIndex: 0,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 24,
      offset: 0
    },
    {
      format: "minute_phase",
      groupId: "intraday_minute",
      groupLabel: "Minute",
      pairFeatureIndex: 3,
      phaseRole: "sin",
      groupLeader: true,
      cycle: 60,
      offset: 0
    },
    {
      format: "minute_phase",
      groupId: "intraday_minute",
      groupLabel: "Minute",
      pairFeatureIndex: 2,
      phaseRole: "cos",
      groupLeader: false,
      cycle: 60,
      offset: 0
    },
    { format: "number" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "ratio" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "signed_percent" }
  ],
  mf__fibonacci__core: [
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "signed_percent" },
    { format: "number" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" }
  ],
  mf__support_resistance__core: [
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "flag" },
    { format: "flag" },
    { format: "number" },
    { format: "signed_percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" },
    { format: "ratio" },
    { format: "ratio" },
    { format: "percent" },
    { format: "percent" },
    { format: "percent" }
  ]
};

const getDefaultDescriptor = (): DimensionRawDisplayDescriptor => ({
  format: "number",
  groupId: null,
  groupLabel: null,
  pairFeatureIndex: null,
  phaseRole: null,
  groupLeader: false,
  cycle: null,
  offset: 0
});

export const getDimensionRawDisplayDescriptor = (
  featureId: string,
  featureIndex: number
): DimensionRawDisplayDescriptor => {
  const descriptor = RAW_DISPLAY_METADATA[featureId]?.[featureIndex];
  return descriptor ? { ...getDefaultDescriptor(), ...descriptor } : getDefaultDescriptor();
};

export const hasDimensionRawDisplayDescriptor = (
  featureId: string,
  featureIndex: number
): boolean => {
  return RAW_DISPLAY_METADATA[featureId]?.[featureIndex] != null;
};

export const isCyclicalDimensionRawDisplay = (
  descriptor: Pick<
    DimensionRawDisplayDescriptor,
    "pairFeatureIndex" | "phaseRole" | "cycle"
  >
): boolean => {
  return (
    descriptor.pairFeatureIndex != null &&
    descriptor.phaseRole != null &&
    Number.isFinite(Number(descriptor.cycle ?? NaN)) &&
    Number(descriptor.cycle) > 0
  );
};

export const normalizeWrappedDimensionValue = (
  value: number,
  cycle: number,
  offset = 0
): number => {
  if (!Number.isFinite(value) || !Number.isFinite(cycle) || cycle <= 0) {
    return Number.NaN;
  }

  let normalized = value;
  while (normalized < offset) {
    normalized += cycle;
  }
  while (normalized >= offset + cycle) {
    normalized -= cycle;
  }
  return normalized;
};

export const unwrapWrappedDimensionValue = (
  value: number,
  anchor: number,
  cycle: number
): number => {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(anchor) ||
    !Number.isFinite(cycle) ||
    cycle <= 0
  ) {
    return Number.NaN;
  }

  let unwrapped = value;
  while (unwrapped - anchor > cycle / 2) {
    unwrapped -= cycle;
  }
  while (unwrapped - anchor < -cycle / 2) {
    unwrapped += cycle;
  }
  return unwrapped;
};

export const decodeCyclicalDimensionDisplayValue = (
  descriptor: Pick<
    DimensionRawDisplayDescriptor,
    "format" | "phaseRole" | "cycle" | "offset"
  >,
  primaryValue: number,
  companionValue: number
): number | null => {
  if (!isCyclicalDimensionRawDisplay(descriptor as DimensionRawDisplayDescriptor)) {
    return null;
  }

  const primary = Number(primaryValue);
  const companion = Number(companionValue);
  if (!Number.isFinite(primary) || !Number.isFinite(companion)) {
    return null;
  }

  const sinValue = descriptor.phaseRole === "sin" ? primary : companion;
  const cosValue = descriptor.phaseRole === "cos" ? primary : companion;
  const angle = Math.atan2(sinValue, cosValue);
  const normalizedAngle = angle >= 0 ? angle : angle + Math.PI * 2;
  const cycle = Number(descriptor.cycle ?? 0);
  const offset = Number(descriptor.offset ?? 0);

  return offset + (normalizedAngle / (Math.PI * 2)) * cycle;
};

const formatSigned = (value: number, body: string): string => {
  if (!Number.isFinite(value)) {
    return "\u2014";
  }
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${body}`;
};

const formatNumber = (value: number, digits = 3): string => {
  if (!Number.isFinite(value)) {
    return "\u2014";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
};

const formatHourPhase = (value: number, compact: boolean): string => {
  const normalized = normalizeWrappedDimensionValue(value, 24, 0);
  if (!Number.isFinite(normalized)) {
    return "\u2014";
  }

  let hour = Math.floor(normalized);
  let minute = Math.round((normalized - hour) * 60);
  if (minute >= 60) {
    hour = (hour + 1) % 24;
    minute = 0;
  }

  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  if (compact && minute === 0) {
    return `${hour12} ${meridiem}`;
  }
  if (minute === 0) {
    return `${hour12}:00 ${meridiem}`;
  }
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
};

const formatMinutePhase = (value: number, compact: boolean): string => {
  const normalized = normalizeWrappedDimensionValue(value, 60, 0);
  if (!Number.isFinite(normalized)) {
    return "\u2014";
  }
  const minute = Math.round(normalized) % 60;
  return compact ? `${minute}m` : `${minute} min`;
};

const formatMonthPhase = (value: number, compact: boolean): string => {
  const normalized = normalizeWrappedDimensionValue(value, 12, 1);
  if (!Number.isFinite(normalized)) {
    return "\u2014";
  }
  const monthIndex = ((Math.round(normalized) - 1) % 12 + 12) % 12;
  return compact ? MONTH_SHORT[monthIndex] : MONTH_LONG[monthIndex];
};

const formatWeekdayPhase = (value: number, compact: boolean): string => {
  const normalized = normalizeWrappedDimensionValue(value, 7, 0);
  if (!Number.isFinite(normalized)) {
    return "\u2014";
  }
  const weekdayIndex = ((Math.round(normalized) % 7) + 7) % 7;
  return compact ? WEEKDAY_SHORT[weekdayIndex] : WEEKDAY_LONG[weekdayIndex];
};

const formatDayOfYearPhase = (value: number, compact: boolean): string => {
  const normalized = normalizeWrappedDimensionValue(value, 366, 1);
  if (!Number.isFinite(normalized)) {
    return "\u2014";
  }

  const dayIndex = Math.max(1, Math.min(366, Math.round(normalized)));
  const date = new Date(Date.UTC(2024, 0, dayIndex));
  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: compact ? "short" : "long",
    day: "numeric"
  });
};

const formatWeekOfYearPhase = (value: number): string => {
  const normalized = normalizeWrappedDimensionValue(value, 53, 1);
  if (!Number.isFinite(normalized)) {
    return "\u2014";
  }

  const week = Math.max(1, Math.min(53, Math.round(normalized)));
  return `Week ${week}`;
};

export const formatDimensionRawValue = (
  value: number,
  descriptor: Pick<DimensionRawDisplayDescriptor, "format" | "cycle" | "offset">,
  options?: { compact?: boolean }
): string => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "\u2014";
  }

  const compact = options?.compact === true;

  switch (descriptor.format) {
    case "percent":
      return `${(numericValue * 100).toFixed(compact ? 0 : Math.abs(numericValue) >= 1 ? 1 : 2)}%`;
    case "signed_percent":
      return formatSigned(
        numericValue,
        `${Math.abs(numericValue * 100).toFixed(compact ? 0 : Math.abs(numericValue) >= 1 ? 1 : 2)}%`
      );
    case "ratio":
      return `${numericValue.toFixed(compact ? 1 : 2)}x`;
    case "flag":
      return numericValue >= 0.5 ? "On" : "Off";
    case "zscore":
      return `${numericValue.toFixed(compact ? 1 : 2)}z`;
    case "signed_number":
      return formatSigned(numericValue, formatNumber(Math.abs(numericValue), compact ? 2 : 3));
    case "month_phase":
      return formatMonthPhase(numericValue, compact);
    case "weekday_phase":
      return formatWeekdayPhase(numericValue, compact);
    case "hour_phase":
      return formatHourPhase(numericValue, compact);
    case "minute_phase":
      return formatMinutePhase(numericValue, compact);
    case "day_of_year_phase":
      return formatDayOfYearPhase(numericValue, compact);
    case "week_of_year_phase":
      return formatWeekOfYearPhase(numericValue);
    case "number":
    default:
      return formatNumber(numericValue, compact ? 2 : Math.abs(numericValue) >= 100 ? 2 : 4);
  }
};

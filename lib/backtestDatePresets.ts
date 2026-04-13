export type BacktestDatePreset =
  | "custom"
  | "pastWeek"
  | "past2Weeks"
  | "pastMonth"
  | "past3Months"
  | "past6Months"
  | "pastYear"
  | "past2Years"
  | "past5Years"
  | "pastDecade";

export type BacktestPresetRange = Exclude<BacktestDatePreset, "custom">;

const BACKTEST_DATE_PRESET_SET = new Set<BacktestDatePreset>([
  "custom",
  "pastWeek",
  "past2Weeks",
  "pastMonth",
  "past3Months",
  "past6Months",
  "pastYear",
  "past2Years",
  "past5Years",
  "pastDecade"
]);

const toLocalDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfLocalDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const shiftLocalDateByMonths = (value: Date, monthsDelta: number) => {
  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();
  const target = new Date(year, month + monthsDelta, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(day, maxDay));
};

const shiftLocalDateByYears = (value: Date, yearsDelta: number) => {
  return shiftLocalDateByMonths(value, yearsDelta * 12);
};

export const isBacktestDatePreset = (value: unknown): value is BacktestDatePreset => {
  return BACKTEST_DATE_PRESET_SET.has(value as BacktestDatePreset);
};

export const buildBacktestDateRangeFromPreset = (
  preset: BacktestPresetRange,
  now = new Date()
): { startDate: string; endDate: string } => {
  const endDate = startOfLocalDay(now);
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);

  switch (preset) {
    case "pastWeek":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "past2Weeks":
      startDate.setDate(startDate.getDate() - 14);
      break;
    case "pastMonth":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByMonths(endDate, -1)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past3Months":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByMonths(endDate, -3)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past6Months":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByMonths(endDate, -6)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "pastYear":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -1)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past2Years":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -2)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past5Years":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -5)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "pastDecade":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -10)),
        endDate: toLocalDateInputValue(endDate)
      };
    default:
      break;
  }

  return {
    startDate: toLocalDateInputValue(startDate),
    endDate: toLocalDateInputValue(endDate)
  };
};

export const resolveBacktestPresetDateRange = (args: {
  preset: BacktestDatePreset;
  startDate?: string | null;
  endDate?: string | null;
  now?: Date;
  preserveStoredStart?: boolean;
}) => {
  const {
    preset,
    startDate,
    endDate,
    now = new Date(),
    preserveStoredStart = true
  } = args;
  const storedStartDate = String(startDate ?? "").trim();
  const storedEndDate = String(endDate ?? "").trim();

  if (preset === "custom") {
    return {
      startDate: storedStartDate,
      endDate: storedEndDate
    };
  }

  const derivedRange = buildBacktestDateRangeFromPreset(preset, now);

  return {
    startDate:
      preserveStoredStart && storedStartDate ? storedStartDate : derivedRange.startDate,
    endDate: derivedRange.endDate
  };
};

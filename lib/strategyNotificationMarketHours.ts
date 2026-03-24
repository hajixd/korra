const NOTIFICATION_MARKET_TIME_ZONE = "America/New_York";

type MarketCloseReason = "weekend" | "rollover";

export type StrategyNotificationMarketWindow = {
  marketOpen: boolean;
  reason: MarketCloseReason | null;
  localTimeLabel: string;
  timeZone: string;
};

const marketTimePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NOTIFICATION_MARKET_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  month: "2-digit",
  day: "2-digit"
});

const getMarketTimeParts = (timestampMs: number) => {
  const parts = marketTimePartsFormatter.formatToParts(new Date(timestampMs));
  const weekdayLabel = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  const weekdayIndex =
    weekdayLabel === "Sun"
      ? 0
      : weekdayLabel === "Mon"
        ? 1
        : weekdayLabel === "Tue"
          ? 2
          : weekdayLabel === "Wed"
            ? 3
            : weekdayLabel === "Thu"
              ? 4
              : weekdayLabel === "Fri"
                ? 5
                : 6;

  return {
    weekdayIndex,
    minutesIntoDay: hour * 60 + minute,
    localTimeLabel: `${weekdayLabel} ${month}/${day} ${String(hour).padStart(2, "0")}:${String(
      minute
    ).padStart(2, "0")} ${NOTIFICATION_MARKET_TIME_ZONE}`
  };
};

// Twelve Data's XAU/USD feed is effectively 24/7, so notification sweeps use an
// explicit OTC gold session window instead of inferring closures from sparse bars.
export const getStrategyNotificationMarketWindow = (
  timestampMs = Date.now()
): StrategyNotificationMarketWindow => {
  const { weekdayIndex, minutesIntoDay, localTimeLabel } = getMarketTimeParts(timestampMs);
  const fridayCloseMinutes = 17 * 60;
  const sundayOpenMinutes = 18 * 60;
  const rolloverStartMinutes = 17 * 60;
  const rolloverEndMinutes = 18 * 60;

  if (weekdayIndex === 6) {
    return {
      marketOpen: false,
      reason: "weekend",
      localTimeLabel,
      timeZone: NOTIFICATION_MARKET_TIME_ZONE
    };
  }

  if (weekdayIndex === 0) {
    return {
      marketOpen: minutesIntoDay >= sundayOpenMinutes,
      reason: minutesIntoDay >= sundayOpenMinutes ? null : "weekend",
      localTimeLabel,
      timeZone: NOTIFICATION_MARKET_TIME_ZONE
    };
  }

  if (weekdayIndex === 5 && minutesIntoDay >= fridayCloseMinutes) {
    return {
      marketOpen: false,
      reason: "weekend",
      localTimeLabel,
      timeZone: NOTIFICATION_MARKET_TIME_ZONE
    };
  }

  if (
    weekdayIndex >= 1 &&
    weekdayIndex <= 4 &&
    minutesIntoDay >= rolloverStartMinutes &&
    minutesIntoDay < rolloverEndMinutes
  ) {
    return {
      marketOpen: false,
      reason: "rollover",
      localTimeLabel,
      timeZone: NOTIFICATION_MARKET_TIME_ZONE
    };
  }

  return {
    marketOpen: true,
    reason: null,
    localTimeLabel,
    timeZone: NOTIFICATION_MARKET_TIME_ZONE
  };
};

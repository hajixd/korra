const BROADCAST_ADMIN_HANDLE = "haji";

const normalizeHandle = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const getEmailHandle = (value: unknown): string => {
  const email = String(value ?? "").trim().toLowerCase();
  const atIndex = email.indexOf("@");
  return atIndex > 0 ? email.slice(0, atIndex) : "";
};

export const isNotificationBroadcastAdmin = (input: {
  displayName?: unknown;
  email?: unknown;
}): boolean => {
  return (
    normalizeHandle(input.displayName) === BROADCAST_ADMIN_HANDLE ||
    getEmailHandle(input.email) === BROADCAST_ADMIN_HANDLE
  );
};

// What the family jar takes. Plain constants, so the app can match them.

// Past this, a family's jar takes no more writes (507) until something is
// deleted. The Free plan's 5 GB is shared by every family; one object may hold
// 1 GB.
export const MAX_JAR_BYTES = 50 * 1024 * 1024;

// The app's fields allow 40 (kids) and 60 (the rest) characters.
export const MAX_NAME_LENGTH = 100;
export const MAX_LABEL_LENGTH = 60;
export const MAX_EMOJI_LENGTH = 32;
// A photo is a file path on phones and a data: URI on the web (up to 1024 px,
// usually a few hundred KB). A SQLite row in a Durable Object holds 2 MB.
export const MAX_PHOTO_URI_LENGTH = 1024 * 1024;

// Wishes can cost up to 6 digits in the app, tasks and consequences 5.
export const MAX_COINS = 999_999;
// The same top as the bonus stepper (src/kids/savings.ts).
export const MAX_BONUS_COINS = 999;

// One call carries at most a couple of photos.
export const MAX_CALL_BYTES = 4 * 1024 * 1024;
// An imported jar, photos included. Under the 32 MiB a Durable Object call
// may carry.
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS_PER_TABLE = 100_000;

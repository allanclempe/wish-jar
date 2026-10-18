// What the family jar takes. Plain constants, so the app can match them.

// Past this, a family's jar takes no more writes or photos (507) until
// something is deleted, and a jar brought along to start a family must fit
// (WJ-57). The Free plan's 5 GB is shared by every family; src/FamilyStarts.ts
// has what that adds up to. A photo is a JPEG up to 1024 px at 0.8
// (src/photos/shrink.ts in the app), 100 to 300 KB, and the 7 starter photos
// are 250 KB in all: three kids, ten tasks of their own and twenty wishes,
// all with photos, are about 5 MB at a typical 150 KB. A jar already bigger
// (the cap was 50 MB) keeps being read, and takes writes again once it's
// back under.
export const MAX_JAR_BYTES = 10 * 1024 * 1024;

// The app's fields allow 40 (kids) and 60 (the rest) characters.
export const MAX_NAME_LENGTH = 100;
export const MAX_LABEL_LENGTH = 60;
export const MAX_EMOJI_LENGTH = 32;
// A photo is the URL of one in the jar (WJ-49). Older jars also hold file
// paths from phones and data: URIs from the web (up to 1024 px, usually a few
// hundred KB), which the jar turns into photos of its own.
export const MAX_PHOTO_URI_LENGTH = 1024 * 1024;
// One photo in the jar: a JPEG up to 1024 px, usually 100 to 300 KB. A SQLite
// row in a Durable Object holds 2 MB.
export const MAX_JAR_PHOTO_BYTES = 1024 * 1024;

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

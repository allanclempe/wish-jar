// The family jar's API as the app sees it (WJ-46). Types only and no Workers
// imports, so the app can `import type` it from relay/src/jar/api.
//
// A call is POST /jar/call with { fn, args }: `args` are the arguments the app's
// src/db function of the same name takes, without the database. The reply is
// { result }, the same value that function returns (undefined comes back as
// null).

export type Icon = {
  emoji: string | null;
  photoUri: string | null;
};

export type Period = 'morning' | 'afternoon' | 'evening';

export type Kid = {
  id: number;
  name: string;
  photoUri: string | null;
  createdAt: number;
};

export type Task = {
  id: number;
  name: string;
  period: Period;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
};

export type ConsequenceType = {
  id: number;
  name: string;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
};

export type Consequence = {
  id: number;
  kidId: number;
  consequenceTypeId: number | null;
  name: string;
  coinAmount: number;
  icon: Icon;
  dayKey: string;
  createdAt: number;
};

export type Wish = {
  id: number;
  kidId: number;
  name: string;
  coinAmount: number;
  icon: Icon;
  createdAt: number;
  claimedAt: number | null;
};

export type KidInput = { name: string; photoUri: string | null };
export type TaskInput = { name: string; period: Period; coinAmount: number; icon: Icon };
export type ConsequenceTypeInput = { name: string; coinAmount: number; icon: Icon };
export type WishInput = { kidId: number; name: string; coinAmount: number; icon: Icon };

// coinAmount is kept so the app's calls look the same, but the jar ticks off
// the task's coins as it has them: another device may have changed them.
export type TaskCompletionInput = {
  kidId: number;
  taskId: number;
  dayKey: string;
  coinAmount: number;
  completed: boolean;
};

// `changed` is false when the tick was already in the requested state.
// `savings` is the kid's balance once the change was saved.
export type TaskCompletionChange = { changed: boolean; coins: number; savings: number };

// `changed` is false when nothing moved, such as a removal after the day ended.
export type ConsequenceChange = { changed: boolean; coins: number };

// `changed` is false when the wish was already claimed or the kid is short.
export type WishClaim = { changed: boolean; coins: number };

type Fn<Args extends unknown[], Result> = { args: Args; result: Result };

export type JarApi = {
  listKids: Fn<[], Kid[]>;
  getKid: Fn<[kidId: number], Kid | null>;
  insertKid: Fn<[input: KidInput], number>;
  // The previous photo. The jar deletes a photo of its own that nothing shows
  // any more itself (WJ-49), here and wherever a call returns photos.
  updateKid: Fn<[kidId: number, input: KidInput], string | null>;
  setKidPhoto: Fn<[kidId: number, photoUri: string | null], string | null>;
  // The photos left behind: the kid's and their wishes'.
  deleteKid: Fn<[kidId: number], string[]>;

  listTasks: Fn<[], Task[]>;
  getTask: Fn<[taskId: number], Task | null>;
  insertTask: Fn<[input: TaskInput], number>;
  updateTask: Fn<[taskId: number, input: TaskInput], string | null>;
  deleteTask: Fn<[taskId: number], string | null>;

  listCompletedTaskIds: Fn<[kidId: number, dayKey: string], number[]>;
  sumCoinsEarnedOn: Fn<[kidId: number, dayKey: string], number>;
  getKidSavings: Fn<[kidId: number], number>;
  setTaskCompletion: Fn<[input: TaskCompletionInput], TaskCompletionChange>;
  giveBonusCoins: Fn<[input: { kidId: number; coins: number }], null>;

  listConsequenceTypes: Fn<[], ConsequenceType[]>;
  getConsequenceType: Fn<[consequenceTypeId: number], ConsequenceType | null>;
  insertConsequenceType: Fn<[input: ConsequenceTypeInput], number>;
  updateConsequenceType: Fn<[consequenceTypeId: number, input: ConsequenceTypeInput], string | null>;
  deleteConsequenceType: Fn<[consequenceTypeId: number], string | null>;

  listConsequences: Fn<[kidId: number, dayKey: string], Consequence[]>;
  // The name and coins are the type's as the jar has it; only its id is read.
  addConsequence: Fn<
    [input: { kidId: number; consequenceType: ConsequenceType; dayKey: string }],
    ConsequenceChange
  >;
  removeConsequence: Fn<
    [input: { consequenceId: number; kidId: number; dayKey: string }],
    ConsequenceChange
  >;

  listWishes: Fn<[], Wish[]>;
  getWish: Fn<[wishId: number], Wish | null>;
  insertWish: Fn<[input: WishInput], number>;
  updateWish: Fn<[wishId: number, input: WishInput], string | null>;
  deleteWish: Fn<[wishId: number], string | null>;
  claimWish: Fn<[input: { wishId: number; kidId: number }], WishClaim>;

  getActiveKidId: Fn<[], number | null>;
  setActiveKidId: Fn<[kidId: number], null>;
  getParentPin: Fn<[], string>;
  setParentPin: Fn<[pin: string], null>;
  getSoundEnabled: Fn<[], boolean>;
  setSoundEnabled: Fn<[enabled: boolean], null>;

  // Points every kid, task, wish and consequence type showing `from` at
  // `to`: a photo kept on one phone, once that phone has put it in the jar
  // (WJ-49). How many changed; 0 when nothing shows `from` any more.
  replacePhoto: Fn<[from: string, to: string], number>;
};

export type JarFn = keyof JarApi;

export type JarCall<F extends JarFn = JarFn> = { fn: F; args: JarApi[F]['args'] };

export type JarReply<F extends JarFn = JarFn> = { result: JarApi[F]['result'] };

// An existing jar to start the family with: the rows of each table as the
// app's SQLite database (version 10) has them, column names and ids included,
// so references between them hold. Every table is optional. With `jar`, the
// starter consequence types are not added: the jar already had its chance.
export type JarImport = {
  kids?: { id: number; name: string; photo_uri: string | null; created_at: number }[];
  tasks?: {
    id: number;
    name: string;
    period: Period;
    coin_amount: number;
    icon_emoji: string | null;
    icon_photo_uri: string | null;
    created_at: number;
  }[];
  completions?: {
    kid_id: number;
    task_id: number;
    day_key: string;
    coin_amount: number;
    created_at: number;
  }[];
  kid_savings?: { kid_id: number; amount: number }[];
  wishes?: {
    id: number;
    kid_id: number;
    name: string;
    coin_amount: number;
    icon_emoji: string | null;
    icon_photo_uri: string | null;
    created_at: number;
    claimed_at: number | null;
  }[];
  consequence_types?: {
    id: number;
    name: string;
    coin_amount: number;
    icon_emoji: string | null;
    icon_photo_uri: string | null;
    created_at: number;
  }[];
  consequences?: {
    id: number;
    kid_id: number;
    consequence_type_id: number | null;
    name: string;
    coin_amount: number;
    day_key: string;
    created_at: number;
  }[];
  // Only the keys the app keeps: active_kid_id, parent_pin, sound_enabled.
  app_settings?: { key: string; value: string }[];
};

// POST /families
export type CreateFamilyRequest = { label?: string | null; jar?: JarImport };
export type CreateFamilyReply = { token: string; familyId: string };

// A family's devices (WJ-48). Each holds its own token; a parent adds one with
// a one-time code shown on a device already in the family, and can remove one.
//   POST   /devices/codes        → 201 JoinCode, 401
//   DELETE /devices/codes/:code  → 204, 401, 403 (another family's), 410
//   POST   /devices/join  JoinRequest → 201 CreateFamilyReply, 400, 410, 429
//   GET    /devices              → 200 DeviceList, 401
//   DELETE /devices/:id          → 204, 401, 404, 409 (the device asking)
export type JoinCode = {
  // 6 letters and digits, typed on the new device.
  code: string;
  expiresAt: number;
  // Wish Jar with the code filled in: what the QR code holds.
  url: string;
};

export type JoinRequest = { code: string; label?: string | null };

export type Device = {
  id: number;
  // What the device called itself when it joined ("Frameo frame"), if anything.
  label: string | null;
  addedAt: number;
  // Written at most every 10 minutes.
  lastSeenAt: number;
  // The device asking.
  thisDevice: boolean;
};

export type DeviceList = { devices: Device[] };

// The Echo Show (WJ-45), whose storage is wiped at the end of every Alexa
// skill session. Once in a family, it links its Alexa device id (32 to 512
// characters; only a hash is kept); at every launch after that it gets a new
// token for the same device row. Removing the device ends it.
//   POST /devices/echo-show/link  EchoShowRequest (device token) → 204, 400, 401
//   POST /devices/echo-show       EchoShowRequest → 200 CreateFamilyReply, 400,
//                                 404 (not linked, or removed from its family)
export type EchoShowRequest = { alexaDeviceId: string };

// The family's photos (WJ-49), kept in its jar. A photo column holds the
// photo's URL, GET /photos/<familyId>/<photo id>.jpg: the id is 32 random
// bytes, so the URL is all an <img> needs, and it never changes (a new photo
// gets a new URL). A photo nothing shows any more is deleted by the jar.
//   POST   /photos  (device token, image/jpeg, up to 1 MB) → 201 PhotoUpload,
//                   401, 413, 415 (not a JPEG), 507 (jar full)
//   GET    /photos/:familyId/:id.jpg → 200 the photo, 404
//   DELETE /photos/:familyId/:id.jpg (device token) → 204, 401, 404,
//                   409 (something still shows it)
export type PhotoUpload = { url: string };

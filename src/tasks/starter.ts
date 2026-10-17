import { Asset } from 'expo-asset';

import type { FamilyJar } from '../db/jar';
import { insertTask } from '../db/tasks';
import type { Period } from '../db/types';
import { storePhoto } from '../photos/photos';

type StarterTask = {
  name: string;
  period: Period;
  coinAmount: number;
  emoji: string;
  photo: number;
};

const STARTER_TASKS: StarterTask[] = [
  { name: 'Pack away', period: 'afternoon', coinAmount: 2, emoji: '🧸', photo: require('../../assets/tasks/pack-away.jpg') },
  { name: 'Dinner time', period: 'evening', coinAmount: 1, emoji: '🍽️', photo: require('../../assets/tasks/dinner-time.jpg') },
  { name: 'Brush teeth', period: 'morning', coinAmount: 1, emoji: '🪥', photo: require('../../assets/tasks/brush-teeth.jpg') },
  { name: 'Make bed', period: 'morning', coinAmount: 1, emoji: '🛏️', photo: require('../../assets/tasks/make-bed.jpg') },
  { name: 'Brekky', period: 'morning', coinAmount: 1, emoji: '🥣', photo: require('../../assets/tasks/brekky.jpg') },
  { name: 'Shower', period: 'evening', coinAmount: 1, emoji: '🚿', photo: require('../../assets/tasks/shower.jpg') },
  { name: 'Wash dishes', period: 'evening', coinAmount: 2, emoji: '🧽', photo: require('../../assets/tasks/wash-dishes.jpg') },
];

// The bundled picture put in the family jar like a picked photo, so every
// device shows it and it can be edited and removed the same way. Null when it
// can't be uploaded, and the task shows its emoji instead.
async function storeStarterPhoto(jar: FamilyJar, photo: number): Promise<string | null> {
  try {
    const asset = await Asset.fromModule(photo).downloadAsync();
    return await storePhoto(jar, asset.localUri ?? asset.uri);
  } catch {
    return null;
  }
}

// A new family gets the starter list, so the kids have something to tick off
// straight away. Only once, as the family is made (src/db/open.ts): a family
// that deleted them all doesn't get them back. Their photos go up into the
// new family's jar (WJ-49), once per family.
export async function addStarterTasks(jar: FamilyJar): Promise<void> {
  const photos = await Promise.all(STARTER_TASKS.map((task) => storeStarterPhoto(jar, task.photo)));
  // One at a time, so they keep the list's order.
  for (const [index, task] of STARTER_TASKS.entries()) {
    await insertTask(jar, {
      name: task.name,
      period: task.period,
      coinAmount: task.coinAmount,
      icon: { emoji: photos[index] ? null : task.emoji, photoUri: photos[index] },
    });
  }
}

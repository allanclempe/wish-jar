import { Asset } from 'expo-asset';
import type { SQLiteDatabase } from 'expo-sqlite';

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

// The bundled picture copied into the photo store like a picked photo, so the
// task's photo can be edited and removed the same way. Null when it can't be
// copied, and the task shows its emoji instead.
async function storeStarterPhoto(photo: number): Promise<string | null> {
  try {
    const asset = await Asset.fromModule(photo).downloadAsync();
    return await storePhoto(asset.localUri ?? asset.uri);
  } catch {
    return null;
  }
}

// Runs every time the app opens: a family with no tasks gets the starter list,
// so the kids have something to tick off straight away.
export async function addStarterTasks(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks');
  if ((row?.count ?? 0) > 0) return;

  const photos = await Promise.all(STARTER_TASKS.map((task) => storeStarterPhoto(task.photo)));
  await db.withTransactionAsync(async () => {
    for (const [index, task] of STARTER_TASKS.entries()) {
      await insertTask(db, {
        name: task.name,
        period: task.period,
        coinAmount: task.coinAmount,
        icon: { emoji: photos[index] ? null : task.emoji, photoUri: photos[index] },
      });
    }
  });
}

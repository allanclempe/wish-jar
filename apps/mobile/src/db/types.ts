import type { Period } from '@wish-jar/jar';

// The jar answers with these types (packages/jar), whichever database it is.
export type { Consequence, ConsequenceType, Icon, Kid, Period, Task, Wish } from '@wish-jar/jar';

export const PERIODS = ['morning', 'afternoon', 'evening'] as const satisfies readonly Period[];

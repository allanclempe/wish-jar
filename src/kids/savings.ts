// Ticking a task adds its coins to the kid's savings and un-ticking takes the
// same coins back out, so savings always match the completed tasks.
export function savingsAfterTask(savings: number, coinAmount: number, completed: boolean): number {
  return completed ? savings + coinAmount : savings - coinAmount;
}

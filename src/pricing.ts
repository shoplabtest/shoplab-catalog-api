export interface Tier {
  minQuantity: number;
  amount: number;
}

/** Unit price for a quantity: the tier with the highest `minQuantity` that the quantity reaches, else the base price. */
export function unitPriceFor(base: number, tiers: Tier[], quantity: number): number {
  let best: Tier | undefined;
  for (const t of tiers) if (t.minQuantity <= quantity && (!best || t.minQuantity > best.minQuantity)) best = t;
  return best ? best.amount : base;
}

/** Tiers must start above 1, be unique, and get strictly cheaper as the quantity grows; all below the base price. */
export function validateTiers(base: number, input: unknown): Tier[] | string {
  if (!Array.isArray(input) || input.length > 10) return 'tiers';
  const tiers: Tier[] = [];
  for (const t of input as { minQuantity?: unknown; amount?: unknown }[]) {
    if (!t || !Number.isInteger(t.minQuantity) || (t.minQuantity as number) < 2) return 'tiers';
    if (!Number.isInteger(t.amount) || (t.amount as number) < 0) return 'tiers';
    tiers.push({ minQuantity: t.minQuantity as number, amount: t.amount as number });
  }
  tiers.sort((a, b) => a.minQuantity - b.minQuantity);
  let previous = base;
  for (const [i, t] of tiers.entries()) {
    if (i > 0 && t.minQuantity === tiers[i - 1].minQuantity) return 'tiers';
    if (t.amount >= previous) return 'tiers';
    previous = t.amount;
  }
  return tiers;
}

import seedrandom from "seedrandom";

let rng: () => number = new seedrandom.alea({ entropy: true });

export function randomSeed(seed: string) {
  rng = new seedrandom.alea(seed);
}

export function randomInt(range: number): number {
  return Math.floor(rng() * range + 1);
}

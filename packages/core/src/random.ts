import seedrandom from "seedrandom";

let rng: () => number = seedrandom("", { entropy: true });

export function randomSeed(seed: string) {
  rng = seedrandom.alea(seed);
}

export function randomInt(range: number): number {
  return Math.floor(rng() * range + 1);
}

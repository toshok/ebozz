import seedrandom from "seedrandom";

let rng: () => number = new seedrandom.alea({ entropy: true });

export function randomSeed(seed: string) {
  console.log(`reseeding random number generator with ${seed}`);
  rng = new seedrandom.alea(seed);
}

export function randomInt(range: number): number {
  return Math.floor(rng() * range + 1);
}

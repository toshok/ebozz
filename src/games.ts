const GAMES: Record<string, { name: string; path: string }> = {
  zork1: {
    name: "Zork I: The Great Underground Empire",
    path: "./gamefiles/zork1-r119-s880429.z3",
  },
  zork2: {
    name: "Zork II: The Wizard of Frobozz",
    path: "./gamefiles/zork2-r63-s860811.z3",
  },
  zork3: {
    name: "Zork III: The Dungeon Master",
    path: "./gamefiles/zork3-r25-s860811.z3",
  },
  lgop: {
    name: "Leather Goddesses of Phobos",
    path: "./gamefiles/leathergoddesses-r59-s860730.z3",
  },
  hitchhikers: {
    name: "The Hitchhiker's Guide To The Galaxy",
    path: "./gamefiles/hitchhiker-r59-s851108.z3",
  },
  spellbreaker: {
    name: "Spellbreaker",
    path: "./gamefiles/spellbreaker-r87-s860904.z3",
  },
  stationfall: {
    name: "Stationfall",
    path: "./gamefiles/stationfall-r107-s870430.z3",
  },
  trinity: {
    name: "Trinity (doesn't work currently)",
    path: "./gamefiles/trinity-r15-s870628.z4",
  },
  wishbringer: {
    name: "Wishbringer",
    path: "./gamefiles/wishbringer-r69-s850920.z3",
  },
} as const;

export default GAMES;

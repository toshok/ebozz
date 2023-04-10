import { ZString } from "./types";
import Game from "./ebozz";

let alphabet_table = [
  /* A0 */ "abcdefghijklmnopqrstuvwxyz",
  /* A1 */ "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  /* A2 */ " \n0123456789.,!?_#'\"/\\-:()",
];

export default function zstringToAscii(
  s: Game,
  zstr: ZString,
  _expand: boolean
): string {
  // various state things, like alphabet
  let alphabet = 0;

  function shiftAlphabet(stype: number) {
    if (stype === 4) {
      alphabet = 1;
    } else if (stype === 5) {
      alphabet = 2;
    } else {
      throw new Error("unknown shift type");
    }
  }

  let rv: Array<string> = [];
  for (let i = 0; i < zstr.length; i++) {
    let z = zstr[i];
    if (z < 6) {
      switch (z) {
        case 0:
          rv.push(" ");
          break;
        case 1:
        case 2:
        case 3: {
          let x = zstr[++i];
          let entry = 32 * (z - 1) + x;
          let abbrev_addr = s.getWord(s._abbrevs + entry * 2) * 2;
          rv.push(zstringToAscii(s, s.getZString(abbrev_addr), false));
          break;
        }
        case 4:
        case 5:
          shiftAlphabet(z);
          break;
      }
    } else if (z == 6 && alphabet === 2) {
      // XXX Z-character 6 from A2 means that the two subsequent Z-characters specify a ten-bit ZSCII character code: the next Z-character gives the top 5 bits and the one after the bottom 5.
      // we ignore for now.
      let z1 = zstr[++i];
      let z2 = zstr[++i];

      let combined_char = (z1 << 5) + z2;
      rv.push(String.fromCharCode(combined_char));
      alphabet = 0;
    } else {
      rv.push(alphabet_table[alphabet][z - 6]);
      alphabet = 0;
    }
  }
  return rv.join("");
}

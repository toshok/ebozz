export function hex(v) {
  return v !== undefined ? v.toString(16) : "";
}

export function dumpHeader(s) {
  console.log("header:");
  console.log(`Z-code version:           ${s.getByte(0)}`);
  console.log(`Start PC:                 ${hex(s.getWord(0x06))}`);
  console.log(`Global variables address: ${hex(s.getWord(0x0c))}`);
  console.log(`Alphabet table address:   ${hex(s.getWord(0x34))}`);
  console.log(`Object table address:     ${hex(s.getWord(0x0a))}`);
  console.log();
}

export function dumpObjectTable(s) {
  let objects_without_parents = [];
  for (let i = 1; i < 255; i++) {
    let o = s.getObject(i);
    if (o.parent === null) objects_without_parents.push(o);
  }
  console.log(`${objects_without_parents.length} root objects`);
  objects_without_parents.forEach(o => o.dump());
  console.log();
}

export function dumpDictionary(s) {
  console.log("dictionary:");
  let p = s._dict;
  let num_sep = s.getByte(p++);
  let sep_zscii = [];
  for (let i = 0; i < num_sep; i++) sep_zscii.push(s.getByte(p++));

  console.log(
    `Separators: ${sep_zscii.map(ch => String.fromCharCode(ch)).join(" ")}`
  );

  let entry_length = s.getByte(p++);
  let num_entries = s.getWord(p);
  p += 2;

  for (let i = 0; i < num_entries; i++) {
    let entry_text = zstringToAscii(this, s.getZString(p), false);
    console.log(
      ` [${i}] ${entry_text} ${hex(s.getWord(p))} ${hex(s.getWord(p + 2))}`
    );
    p += entry_length; // we skip the data
  }

  console.log();
}

export function dumpParsebuffer(s, parsebuffer) {
  let max = s.getByte(parsebuffer);
  parsebuffer++;
  let count = s.getByte(parsebuffer);
  parsebuffer++;
  log.debug(` max = ${max}, count = ${count} tokens = [`);
  for (let i = 0; i < count; i++) {
    let addr = s.getWord(parsebuffer);
    parsebuffer += 2;
    let length = s.getByte(parsebuffer);
    parsebuffer++;
    let from = s.getByte(parsebuffer);
    parsebuffer++;
    log.debug(` (${hex(addr)}, ${hex(from)}, ${hex(length)})`);
  }
  log.debug(" ]");
}

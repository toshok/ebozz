import * as fs from "fs";
import * as readline from "readline-sync";

import GameObject from "./GameObject";
import zstringToAscii from "./zstringToAscii";

class SuspendForUserInput {
  constructor(state) {
    this._state = state;
  }
  get state() {
    return this._state;
  }
}

// XXX(toshok) ugh, module-level global for logging.
let log;

function hex(v) {
  return v !== undefined ? v.toString(16) : "";
}

function isZasciiInput(c) {
  return c >= 32 && c <= 126; // XXX only ascii for now.
}

function unimplemented(msg) {
  if (msg) {
    throw new Error(`unimplemented: ${msg}`);
  }
  throw new Error("unimplemented");
}

function illegalOpcode() {
  return opcode("???", () => {
    throw new Error("illegal opcode");
  });
}

function opcode(mnemonic, impl) {
  return { mnemonic, impl };
}

function unimplementedOpcode(mnemonic) {
  return opcode(mnemonic, () => unimplemented(`opcode: ${mnemonic}`));
}

function nopcode() {
  return opcode("nop", () => {});
}

function opcodeImpl(fn) {
  return opcode(fn.name, fn);
}

// actual opcodes
function je(s, a, b, c, d) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} je ${hex(a)} ${hex(b)} ${hex(c)} ${hex(
      d
    )} -> [${!condfalse}] ${hex(s.pc + offset - 2)}`
  );
  let cond =
    a === b || (c !== undefined && a === c) || (d !== undefined && a === d);
  s.doBranch(cond, condfalse, offset);
}

function jl(s, a, b) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} jl ${hex(a)} ${hex(b)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  s.doBranch(s.toI16(a) < s.toI16(b), condfalse, offset);
}

function jg(s, a, b) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} jg ${hex(a)} ${hex(b)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  s.doBranch(s.toI16(a) > s.toI16(b), condfalse, offset);
}

function dec_chk(s, variable, value) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} dec_chk ${hex(variable)} ${value} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  let new_val = s.toI16(s.loadVariable(variable)) - 1;
  s.storeVariable(variable, s.toU16(new_val));
  log.debug(`     ${new_val} <? ${value}`);
  s.doBranch(new_val < s.toI16(value), condfalse, offset);
}

function inc_chk(s, variable, value) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} inc_chk ${hex(variable)} ${value} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  let new_val = s.toI16(s.loadVariable(variable)) + 1;
  s.storeVariable(variable, s.toU16(new_val));
  log.debug(`     ${new_val} ?> ${value}`);
  s.doBranch(new_val > s.toI16(value), condfalse, offset);
}

function jin(s, obj1, obj2) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} jin ${hex(obj1)} ${hex(obj2)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  let o1 = s.getObject(obj1);
  if (o1 === null) {
    log.error("child object is null in jin");
    s.doBranch(false, condfalse, offset);
  } else {
    let parentObjNum = o1.parent ? o1.parent.objnum : 0;
    s.doBranch(parentObjNum === obj2, condfalse, offset);
  }
}

function test(s, bitmap, flags) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} test ${hex(bitmap)} ${hex(flags)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  s.doBranch((bitmap & flags) === flags, condfalse, offset);
}

function or(s, a, b) {
  s.storeVariable(s.readByte(), a | b);
}

function and(s, a, b) {
  s.storeVariable(s.readByte(), a & b);
}

function test_attr(s, obj, attribute) {
  //fs.writeSync(log_fp, `+  ${hex(obj)} / ${hex(attribute)}\n`);
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} test_attr ${hex(obj)} ${hex(
      attribute
    )} -> [${!condfalse}] ${hex(s.pc + offset - 2)}`
  );
  let o = s.getObject(obj);
  if (o === null) {
    log.error("object null in test_attr");
    s.doBranch(false, condfalse, offset);
  } else {
    s.doBranch(o.hasAttribute(attribute), condfalse, offset);
  }
}

function set_attr(s, obj, attribute) {
  log.debug(`${hex(s.op_pc)} set_attr ${obj} ${attribute}`);
  let o = s.getObject(obj);
  o.setAttribute(attribute);
}

function clear_attr(s, obj, attribute) {
  log.debug(`${hex(s.op_pc)} clear_attr ${obj} ${attribute}`);
  let o = s.getObject(obj);
  o.clearAttribute(attribute);
}

function store(s, variable, value) {
  log.debug(`${hex(s.op_pc)} store (${hex(variable)}) ${hex(value)}`);
  s.storeVariable(variable, value, true);
}

function insert_obj(s, obj, destination) {
  log.debug(`${hex(s.op_pc)} insert_obj ${obj} ${destination}`);
  let o = s.getObject(obj);
  let desto = s.getObject(destination);
  if (o.parent) {
    // need to unlink it from its current parent
    if (o.parent.child.objnum === o.objnum) {
      // it's the first child.  easy.
      o.parent.child = o.sibling;
    } else {
      let p = o.parent;
      let next;
      for (let c = p.child; c !== null; c = next) {
        next = c.sibling;
        if (next.objnum === o.objnum) {
          c.sibling = o.sibling;
          break;
        }
      }
    }

    o.sibling = desto.child;
  }

  // link it into its new parent's list
  o.sibling = desto.child;
  o.parent = desto;
  o.parent.child = o;
}

function loadw(s, array, word_index) {
  let resultVar = s.readByte();
  log.debug(
    `${hex(s.op_pc)} loadw ${hex(array)} ${hex(word_index)} -> (${hex(
      resultVar
    )})`
  );
  s.storeVariable(resultVar, s.getWord((array + 2 * word_index) & 0xffff));
}

function loadb(s, array, byte_index) {
  let resultVar = s.readByte();
  log.debug(
    `${hex(s.op_pc)} loadb ${hex(array)} ${hex(byte_index)} -> (${hex(
      resultVar
    )})`
  );
  s.storeVariable(resultVar, s.getByte((array + byte_index) & 0xffff));
}

function get_prop(s, obj, property) {
  let resultVar = s.readByte();
  log.debug(
    `${hex(s.op_pc)} get_prop ${hex(obj)} ${hex(property)} -> (${hex(
      resultVar
    )})`
  );
  let o = s.getObject(obj);
  if (o === null) {
    log.warn("get_prop called on null object");
    s.storeVariable(resultVar, 0);
    return;
  }
  s.storeVariable(resultVar, o.getProperty(property));
}

function get_prop_addr(s, obj, property) {
  //fs.writeSync(log_fp, ` get_prop_addr ${hex(obj)} ${hex(property)}`);
  let resultVar = s.readByte();
  log.debug(
    `${hex(s.op_pc)} get_prop_addr ${hex(obj)} ${hex(property)} -> (${hex(
      resultVar
    )})`
  );
  let o = s.getObject(obj);
  s.storeVariable(resultVar, o.getPropertyAddress(property));
}

function get_next_prop(s, obj, property) {
  let resultVar = s.readByte();
  log.debug(
    `${hex(s.op_pc)} get_next_prop ${hex(obj)} ${hex(property)} -> (${hex(
      resultVar
    )})`
  );
  let o = s.getObject(obj);
  s.storeVariable(resultVar, o.getNextProperty(property));
}

function add(s, a, b) {
  s.storeVariable(s.readByte(), s.toI16(a) + s.toI16(b));
}

function sub(s, a, b) {
  s.storeVariable(s.readByte(), s.toI16(a) - s.toI16(b));
}

function mul(s, a, b) {
  s.storeVariable(s.readByte(), s.toI16(a) * s.toI16(b));
}

function div(s, a, b) {
  s.storeVariable(s.readByte(), Math.floor(s.toI16(a) / s.toI16(b)));
}

function mod(s, a, b) {
  s.storeVariable(s.readByte(), s.toI16(a) % s.toI16(b));
}

function call_1s(s, routine) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  log.debug(`${hex(s.op_pc)} call_1s ${hex(routine)} -> (${hex(resultVar)})`);
  s.callRoutine(routine, resultVar);
}

function call_1n(s, routine) {
  if (routine === 0) {
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  log.debug(`${hex(s.op_pc)} call_1n ${hex(routine)}`);
  s.callRoutine(routine, null);
}

function call_2s(s, routine, arg1) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  log.debug(
    `${hex(s.op_pc)} call_2s ${hex(routine)} ${arg1} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar, arg1);
}

function call_2n(s, routine, arg1) {
  if (routine === 0) {
    return;
  }
  log.debug(`${hex(s.op_pc)} call_2n ${hex(routine)} ${arg1}`);
  routine = s.unpackRoutineAddress(routine);
  s.callRoutine(routine, null, arg1);
}

function set_color(s, foreground, background) {
  log.warn(
    `${hex(s.op_pc)} set_color ${foreground} ${background} -- not implemented`
  );
}

function jz(s, a) {
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} jz ${hex(a)} -> [${!condfalse}] ${hex(s.pc + offset - 2)}`
  );
  s.doBranch(a === 0, condfalse, offset);
}

function get_sibling(s, obj) {
  let resultVar = s.readByte();
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} get_sibling ${hex(obj)} -> (${hex(
      resultVar
    )}) ?[${!condfalse}] ${hex(offset)}`
  );

  let o = s.getObject(obj);
  let sibling = null;
  if (o) {
    sibling = o.sibling;
    if (sibling) {
      s.storeVariable(resultVar, sibling.objnum);
    } else {
      s.storeVariable(resultVar, 0);
    }
  } else {
    log.warn("object is 0 in get_sibling");
    s.storeVariable(resultVar, 0);
  }
  //fs.writeSync(log_fp, `+  sibling = ${sibling ? hex(sibling.objnum) : '0'}\n`);

  s.doBranch(sibling !== null, condfalse, offset);
}

function get_child(s, obj) {
  let resultVar = s.readByte();
  let [offset, condfalse] = s.readBranchOffset();
  log.debug(
    `${hex(s.op_pc)} get_child ${hex(obj)} -> (${hex(
      resultVar
    )}) ?[${!condfalse}] ${hex(offset)}`
  );

  let o = s.getObject(obj);
  let child = o.child;
  if (child) {
    s.storeVariable(resultVar, child.objnum);
  } else {
    s.storeVariable(resultVar, 0);
  }
  s.doBranch(child !== null, condfalse, offset);
}

function get_parent(s, obj) {
  let resultVar = s.readByte();
  log.debug(`${hex(s.op_pc)} get_parent ${hex(obj)} -> (${hex(resultVar)})`);
  let o = s.getObject(obj);
  if (o === null) log.error("object null in get_parent");
  let parent_objnum = o === null || o.parent === null ? 0 : o.parent.objnum;
  s.storeVariable(resultVar, parent_objnum);
}

function get_prop_len(s, propDataAddr) {
  let resultVar = s.readByte();
  log.debug(
    `${hex(s.op_pc)} get_prop_len ${hex(propDataAddr)} -> (${hex(resultVar)})`
  );
  let len = GameObject.getPropertyLength(s, propDataAddr);
  s.storeVariable(resultVar, len);
}

function inc(s, variable) {
  s.storeVariable(variable, s.toU16(s.toI16(s.loadVariable(variable)) + 1));
}

function dec(s, variable) {
  s.storeVariable(variable, s.toU16(s.toI16(s.loadVariable(variable)) - 1));
}

function print_addr(s, stringAddr) {
  log.debug(`${hex(s.op_pc)} print_addr ${hex(stringAddr)}`);
  s._screen.print(s, zstringToAscii(s, s.getZString(stringAddr), true));
}

function remove_obj(s, obj) {
  log.debug(`${hex(s.op_pc)} remove_obj ${hex(obj)}`);
  let o = s.getObject(obj);
  o.unlink();
}
function print_obj(s, obj) {
  log.debug(`${hex(s.op_pc)} print_obj ${hex(obj)}`);
  let o = s.getObject(obj);
  s._screen.print(s, `${o.name}`);
}

function ret(s, value) {
  s.returnFromRoutine(value);
}

function jump(s, addr) {
  s.pc = s.pc + s.toI16(addr) - 2;
}

function print_paddr(s, packed_addr) {
  s._screen.print(
    s,
    zstringToAscii(s, s.getZString(s.unpackStringAddress(packed_addr), true))
  );
}

function load(s, variable) {
  let resultVar = s.readByte();
  log.debug(`${hex(s.op_pc)} load ${hex(variable)} -> (${hex(resultVar)})`);
  s.storeVariable(resultVar, s.loadVariable(variable, false), false);
}

function not(s, value) {
  let resultVar = s.readByte();
  value = value ^ 0xffff;
  s.storeVariable(resultVar, value);
}

function rtrue(s) {
  s.returnFromRoutine(1);
}
function rfalse(s) {
  s.returnFromRoutine(0);
}
function print(s) {
  s._screen.print(s, zstringToAscii(s, s.readZString(), true));
}

function print_ret(s) {
  log.debug(`${hex(s.op_pc)} print_ret`);
  s._screen.print(s, zstringToAscii(s, s.readZString(), true));
  s.returnFromRoutine(1);
}

function save(s) {
  let [offset, condfalse] = s.readBranchOffset();

  let saved = s.saveGame();
  if (s._version < 5) {
    s.doBranch(saved, condfalse, offset);
  } else {
    throw new Error("unimplemented save for version 5+");
  }
}

function restore(s) {
  let [offset, condfalse] = s.readBranchOffset();

  let restored = s.restoreGame();
  if (s._version < 5) {
    s.doBranch(restored, condfalse, offset);
  } else {
    throw new Error("unimplemented restore for version 5+");
  }
}

function quit(s) {
  s._quit = true;
}

function ret_popped(s) {
  s.returnFromRoutine(s.popStack());
}

function new_line(s) {
  s._screen.print(s, "\n");
}

function show_status(s) {
  if (s._version >= 4) {
    return;
  }
  let location = s.getWord(s._global_vars + 0);
  let score = s.getWord(s._global_vars + 2); // if we're supposed to show time,
  let moves = s.getWord(s._global_vars + 4); // both of these contain the time.
  // XXX(toshok) more here.
}

function call(s, routine, ...args) {
  let resultVar = s.readByte();
  if (routine === 0) {
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  log.debug(
    `${hex(s.op_pc)} call ${hex(routine)} ${args} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar, ...args);
}
function storew(s, array, word_index, value) {
  log.debug(
    `${hex(s.op_pc)} storew ${hex(array)} ${hex(word_index)} ${hex(value)}`
  );
  s.setWord((array + 2 * word_index) & 0xffff, value);
}
function storeb(s, array, byte_index, value) {
  log.debug(
    `${hex(s.op_pc)} storeb ${hex(array)} ${hex(byte_index)} ${hex(value)}`
  );
  s.setByte((array + byte_index) & 0xffff, value);
}
function put_prop(s, obj, property, value) {
  log.debug(`put ${hex(obj)} ${hex(property)} ${hex(value)}`);
  let o = s.getObject(obj);
  if (o === null) {
    log.warn("put_prop called on null object");
    return;
  }
  o.putProperty(property, value);
}

function sread(s, textBuffer, parseBuffer, time, routine) {
  let max_input = s.getByte(textBuffer) + 1;
  log.debug(
    `sread max_input=${max_input}, text=${textBuffer}, parse=${parseBuffer}, time=${time}, routine=${routine}`
  );
  // XXX(toshok) we need to handle the initial contents of the buffer (only Shogun and Zork Zero use it?)
  throw new SuspendForUserInput({ textBuffer, parseBuffer, time, routine });
}
function print_char(s, ...chars) {
  log.debug(`print_char(${chars})`);
  s._screen.print(s, chars.map(c => String.fromCharCode(c)).join(""));
}
function print_num(s, value) {
  s._screen.print(s, s.toI16(value).toString());
}
function random(s, range) {
  log.debug(`random(${range})`);
  let resultVar = s.readByte();
  if (range <= 0) {
    // (XXX) can't seed in JS?
    s.storeVariable(resultVar, 0);
  } else {
    let rv = Math.floor(Math.random() * range + 1);
    s.storeVariable(resultVar, rv);
  }
}
function push(s, value) {
  s.pushStack(value);
}
function pull(s, variable) {
  s.storeVariable(variable, s.popStack());
}
function split_window(s, lines) {
  s._screen.splitWindow(s, lines);
}
function set_window(s, window) {
  s._screen.setOutputWindow(s, window);
}
function call_vs2(s, routine, ...args) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  log.debug(
    `${hex(s.op_pc)} call_vs2 ${hex(routine)} ${args} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar, ...args);
}
function erase_window(s, window) {
  s._screen.clearWindow(s, window);
}
function erase_line(s, value) {
  s._screen.clearLine(s, value);
}
function set_cursor(s, line, column, window) {
  if (s._version >= 6) {
    if (line === -1) {
      s._screen.hideCursor(s);
      return;
    }
    if (line === -2) {
      s._screen.showCursor(s);
      return;
    }
  }
  if (s._version < 6) {
    window = s._screen.getOutputWindow(s);
  }

  s._screen.setCursorPosition(s, line, column, window);
}
function get_cursor(s, array) {
  log.warn(`get_cursor ${array} -- not implemented`);
}
function set_text_style(s, style) {
  s._screen.setTextStyle(s, style);
}
function buffer_mode(s, flag) {
  s._screen.setBufferMode(s, flag);
}
function output_stream(s, number, table, width) {
  let streamNumber = s.toI16(number);
  if (streamNumber === 0) {
    // why emit this opcode at all?
    return;
  }
  if (streamNumber > 0) {
    s._screen.enableOutputStream(s, streamNumber, table, width);
    return;
  }
  s._screen.disableOutputStream(s, -streamNumber, table, width);
}
function input_stream(s, number) {
  s._screen.selectInputStream(s, s.toI16(number));
}
function sound_effect(s, number, effect, volume, routine) {
  log.warn(`sound_effect ${number} -- not implemented`);
}
function read_char(s, dev, time, routine) {
  let resultVar = s.readByte();
  //    readline.keyIn("{ hideEchoBack: true, mask: "" });
  s.storeVariable(resultVar, 32 /*XXX*/);
}
function scan_table(s, x, table, len, form = 0x82) {
  let resultVar = s.readByte();
  let [offset, condfalse] = s.readBranchOffset();

  log.debug(`scan_table ${hex(x)} ${hex(table)} ${hex(len)} ${hex(form)}`);

  // XXX can we verify that 'x' is the proper sized value?
  let searchForWord = (form & 0x80) === 80;
  let elementSize = form & 0x7f;

  let cur = table;
  let end = table + len;
  while (cur < end) {
    let table_element = searchForWord ? s.getWord(cur) : s.getByte(cur);
    if (table_element === x) {
      log.debug(`+ found element at ${hex(cur)}`);
      s.storeVariable(resultVar, cur);
      s.doBranch(true, condfalse, offset);
      return;
    }
    cur += elementSize;
  }

  log.debug(`+ didn't find element`);
  s.storeVariable(resultVar, 0);
  // don't branch
}
function call_vn2(s, routine, ...args) {
  if (routine === 0) {
    return;
  }
  log.debug(`${hex(s.op_pc)} call_2n ${hex(routine)} ${arg1}`);
  routine = s.unpackRoutineAddress(routine);
  s.callRoutine(routine, null, ...args);
}
function tokenise(s, text, tokenBuffer, dict = 0, flag = 0) {
  s.tokeniseLine(text, tokenBuffer, dict, flag != 0);
}
function print_table(s, zscii_text, width, height, skip) {
  log.debug("print_table");
  if (width) log.debug(`width = ${width}`);
  if (height) log.debug(`height = ${height}`);
  if (skip) log_debug(`skip = ${skip}`);
}
function check_arg_count(s, argNumber) {
  let [offset, condfalse] = s.readBranchOffset();

  s.doBranch(s.getArgCount() >= argNumber, condfalse, offset);
}

let op2 = [
  nopcode(),
  opcodeImpl(je),
  opcodeImpl(jl),
  opcodeImpl(jg),
  opcodeImpl(dec_chk),
  opcodeImpl(inc_chk),
  opcodeImpl(jin),
  opcodeImpl(test),
  opcodeImpl(or),
  opcodeImpl(and),
  opcodeImpl(test_attr),
  opcodeImpl(set_attr),
  opcodeImpl(clear_attr),

  opcodeImpl(store),
  opcodeImpl(insert_obj),

  opcodeImpl(loadw),
  opcodeImpl(loadb),

  opcodeImpl(get_prop),
  opcodeImpl(get_prop_addr),
  opcodeImpl(get_next_prop),

  opcodeImpl(add),
  opcodeImpl(sub),
  opcodeImpl(mul),
  opcodeImpl(div),
  opcodeImpl(mod),

  opcodeImpl(call_2s),
  opcodeImpl(call_2n),

  opcodeImpl(set_color),
  unimplementedOpcode("throw"),
  illegalOpcode(),
  illegalOpcode(),
  illegalOpcode()
];

let op1 = [
  opcodeImpl(jz),

  opcodeImpl(get_sibling),
  opcodeImpl(get_child),
  opcodeImpl(get_parent),

  opcodeImpl(get_prop_len),
  opcodeImpl(inc),
  opcodeImpl(dec),

  opcodeImpl(print_addr),
  opcodeImpl(call_1s),

  opcodeImpl(remove_obj),
  opcodeImpl(print_obj),

  opcodeImpl(ret),
  opcodeImpl(jump),

  opcodeImpl(print_paddr),
  opcodeImpl(load),
  opcodeImpl(not),
  opcodeImpl(call_1n)
];

let op0 = [
  opcodeImpl(rtrue),
  opcodeImpl(rfalse),
  opcodeImpl(print),
  opcodeImpl(print_ret),

  nopcode(),

  opcodeImpl(save),
  opcodeImpl(restore),

  unimplementedOpcode("restart"),
  opcodeImpl(ret_popped),
  unimplementedOpcode("pop"),
  opcodeImpl(quit),
  opcodeImpl(new_line),
  opcodeImpl(show_status),
  unimplementedOpcode("verify"),
  unimplementedOpcode("extended"),
  unimplementedOpcode("piracy")
];

let opv = [
  opcodeImpl(call),
  opcodeImpl(storew),
  opcodeImpl(storeb),
  opcodeImpl(put_prop),
  opcodeImpl(sread),
  opcodeImpl(print_char),
  opcodeImpl(print_num),
  opcodeImpl(random),

  opcodeImpl(push),
  opcodeImpl(pull),
  opcodeImpl(split_window),
  opcodeImpl(set_window),
  opcodeImpl(call_vs2),
  opcodeImpl(erase_window),
  opcodeImpl(erase_line),
  opcodeImpl(set_cursor),
  opcodeImpl(get_cursor),
  opcodeImpl(set_text_style),
  opcodeImpl(buffer_mode),
  opcodeImpl(output_stream),
  opcodeImpl(input_stream),
  opcodeImpl(sound_effect),
  opcodeImpl(read_char),
  opcodeImpl(scan_table),

  unimplementedOpcode("not"),
  unimplementedOpcode("call_vn"),

  opcodeImpl(call_vn2),
  opcodeImpl(tokenise),

  unimplementedOpcode("encode_text"),
  unimplementedOpcode("copy_table"),

  opcodeImpl(print_table),
  opcodeImpl(check_arg_count)
];

let op3 = [illegalOpcode(), op2[1]];

let op4 = [illegalOpcode(), op2[1]];

//  $$00    Large constant (0 to 65535)    2 bytes
//  $$01    Small constant (0 to 255)      1 byte
//  $$10    Variable                       1 byte
//  $$11    Omitted altogether             0 bytes
const OPERAND_TYPE_LARGE = 0;
const OPERAND_TYPE_SMALL = 1;
const OPERAND_TYPE_VARIABLE = 2;
const OPERAND_TYPE_OMITTED = 3;

const INSTRUCTION_FORM_LONG = 0;
const INSTRUCTION_FORM_SHORT = 1;
const INSTRUCTION_FORM_VARIABLE = 2;
const INSTRUCTION_FORM_EXTENDED = 3;

//let log_fp = fs.openSync('./ebozz_log', 'w');

function executeInstruction(s) {
  // If the top two bits of the opcode are $$11 the form is
  // variable; if $$10, the form is short. If the opcode is 190 ($BE
  // in hexadecimal) and the version is 5 or later, the form is
  // "extended". Otherwise, the form is "long".

  let op_pc = s.pc;
  let opcode = s.readByte();

  let operandTypes = [];
  let reallyVariable = false;
  let form;

  //log.debug("opbyte = " + opcode);

  //fs.writeSync(log_fp, `${hex(op_pc)} ${hex(opcode)}`);
  log.debug("opbyte = " + opcode);

  if ((opcode & 0xc0) === 0xc0) {
    form = INSTRUCTION_FORM_VARIABLE;

    if ((opcode & 0x20) !== 0) {
      reallyVariable = true;
    } else {
      // not really variable - 2 args
    }

    if (form === INSTRUCTION_FORM_VARIABLE) {
      let bits = s.readByte();
      for (let i = 0; i < 4; i++) {
        let optype = (bits >> ((3 - i) * 2)) & 0x03;
        if (optype !== OPERAND_TYPE_OMITTED) {
          operandTypes.push(optype);
        } else {
          break;
        }
      }
    }

    opcode = opcode & 0x1f;
  } else if ((opcode & 0x80) === 0x80) {
    form = INSTRUCTION_FORM_SHORT;

    let optype = (opcode & 0x30) >> 4;
    if (optype !== OPERAND_TYPE_OMITTED) operandTypes = [optype];

    opcode = opcode & 0x0f;
  }
  // XXX opcode == 190 and version >= 5
  else {
    form = INSTRUCTION_FORM_LONG;

    operandTypes.push(
      (opcode & 0x40) === 0x40 ? OPERAND_TYPE_VARIABLE : OPERAND_TYPE_SMALL
    );
    operandTypes.push(
      (opcode & 0x20) === 0x20 ? OPERAND_TYPE_VARIABLE : OPERAND_TYPE_SMALL
    );

    opcode = opcode & 0x1f;
  }

  //log.debug(`[${hex(op_pc)}] opcode ${opcode}`);

  let operands = [];
  for (let optype of operandTypes) {
    if (optype === OPERAND_TYPE_LARGE) {
      let op = s.readWord();
      //fs.writeSync(log_fp, ` ${hex(op)}`);
      //log.debug(`  large(${hex(op)})`);
      operands.push(op);
    } else if (optype === OPERAND_TYPE_SMALL) {
      let o = s.readByte();
      //fs.writeSync(log_fp, ` ${hex(o)}`);
      //log.debug(`  small(${hex(o)})`);
      operands.push(o);
    } else if (optype === OPERAND_TYPE_VARIABLE) {
      let varnum = s.readByte();
      let varval = s.loadVariable(varnum);
      //fs.writeSync(log_fp, ` ${hex(varval)}`);
      //log.debug(`  var_ref(${hex(varnum)}) = ${hex(varval)}`);
      operands.push(varval);
    } else {
      //log.debug(optype);
      throw new Error("XXX");
    }
  }

  let impl;
  try {
    if (reallyVariable) {
      impl = opv[opcode].impl;
    } else {
      switch (operands.length) {
        case 0:
          impl = op0[opcode].impl;
          break;
        case 1:
          impl = op1[opcode].impl;
          break;
        case 2:
          impl = op2[opcode].impl;
          break;
        case 3:
          impl = op3[opcode].impl;
          break;
        case 4:
          impl = op4[opcode].impl;
          break;
        default:
          throw new Error("unhandled number of operands");
      }
    }
  } catch (e) {
    console.error(e);
    log.error(
      `error at pc=${hex(op_pc)}, opcode=${hex(opcode)}: ${e.toString()}`
    );
    throw e;
  }
  impl(s, ...operands);

  //fs.writeSync(log_fp, '\n');
}

export default class Game {
  constructor(
    story_buffer,
    log_impl,
    screen,
    storage
    /*
    restore_fn
    */
  ) {
    // XXX(toshok) global log
    log = log_impl;

    this._mem = story_buffer;
    this._log = log_impl;
    this._screen = screen;
    this._storage = storage;
    this._quit = false;
    this._stack = [];
    this._callstack = [];
    this._version = this.getByte(0x00);
    this._highmem = this.getByte(0x04);
    this._global_vars = this.getWord(0x0c);
    this._abbrevs = this.getWord(0x18);
    this._object_table = this.getWord(0x0a);
    this._dict = this.getWord(0x08);

    log.info(`game version: ${this._version}`);

    if (this._version === 6 || this._version === 7) {
      this._routine_offset = this.getWord(0x28);
      this._strings_offset = this.getWord(0x2a);
    }

    let cvt_buffer = new ArrayBuffer(2);
    this._i16_array = new Int16Array(cvt_buffer);
    this._u16_array = new Uint16Array(cvt_buffer);

    this._game_objects = [];

    this._mem[0x20] = 0xff; // 255 = infinite height
    this._mem[0x21] = 80; // XXX 80-character wide terminal

    // turn off split screen

    // get the word separators out of the dictionary here so we don't have to do it
    // every time we tokenise below.
  }

  static fromSnapshot(snapshotBuffer, ...ctorArgs) {
    let { mem, stack, callstack, pc } = Game.readSnapshotFromBuffer(
      snapshotBuffer
    );
    let g = new Game(mem, ...ctorArgs);
    g._stack = stack;
    g._callstack = callstack;
    g._pc = pc;
    return g;
  }

  snapshotToBuffer() {
    console.log(
      `at snapshot time, mem is length ${this._mem.length}, and pc = ${this.pc}`
    );
    const chunkHeader = (type, length) => {
      let b = Buffer.alloc(8);
      b.writeUInt32LE(type, 0);
      b.writeUInt32LE(length, 4);
      return b;
    };

    let buffers = [];
    buffers.push(chunkHeader(1, this._mem.length));
    buffers.push(this._mem);

    let stackString = JSON.stringify(this._stack);
    buffers.push(chunkHeader(2, stackString.length));
    buffers.push(Buffer.from(stackString, "utf8"));

    let callstackString = JSON.stringify(this._callstack);
    buffers.push(chunkHeader(3, callstackString.length));
    buffers.push(Buffer.from(callstackString, "utf8"));

    buffers.push(chunkHeader(4, 4));
    let b = Buffer.alloc(4);
    b.writeUInt32LE(this._pc);
    buffers.push(b);

    return Buffer.concat(buffers);
  }

  static readSnapshotFromBuffer(b) {
    let mem, stack, callstack, pc;
    let p = 0;

    let readChunk = () => {
      let type = b.readUInt32LE(p);
      p += 4;
      let length = b.readUInt32LE(p);
      p += 4;

      switch (type) {
        case 1: // memory
          mem = b.slice(p, p + length);
          break;
        case 2: // stack
          stack = JSON.parse(b.toString("utf8", p, p + length));
          break;
        case 3: // callstack
          callstack = JSON.parse(b.toString("utf8", p, p + length));
          break;
        case 4: // registers
          pc = b.readUInt32LE(p);
          break;
      }
      p += length;
    };

    // we write four chunks so far
    readChunk();
    readChunk();
    readChunk();
    readChunk();

    console.log(
      `at snapshot time, mem is length ${mem.length}, and pc = ${pc}`
    );

    return {
      mem,
      stack,
      callstack,
      pc
    };
  }

  set pc(addr) {
    this._pc = addr;
  }
  get pc() {
    return this._pc;
  }

  get op_pc() {
    return this._op_pc;
  }

  saveGame() {
    try {
      this._storage.saveSnapshot(this, this._mem, this._stack, this._callstack);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  restoreGame() {
    try {
      let { mem, stack, callstack } = this._storage.loadSnapshot(this);
      this._mem = mem;
      this._stack = stack;
      this._callstack = callstack;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  dumpHeader() {
    console.log("header:");
    console.log(`Z-code version:           ${this.getByte(0)}`);
    console.log(`Start PC:                 ${hex(this.getWord(0x06))}`);
    console.log(`Global variables address: ${hex(this.getWord(0x0c))}`);
    console.log(`Alphabet table address:   ${hex(this.getWord(0x34))}`);
    console.log(`Object table address:     ${hex(this.getWord(0x0a))}`);
    console.log();
  }

  dumpObjectTable() {
    let objects_without_parents = [];
    for (let i = 1; i < 255; i++) {
      let o = this.getObject(i);
      if (o.parent === null) objects_without_parents.push(o);
    }
    console.log(`${objects_without_parents.length} root objects`);
    objects_without_parents.forEach(o => o.dump());
    console.log();
  }

  dumpDictionary() {
    console.log("dictionary:");
    let p = this._dict;
    let num_sep = this.getByte(p++);
    let sep_zscii = [];
    for (let i = 0; i < num_sep; i++) sep_zscii.push(this.getByte(p++));

    console.log(
      `Separators: ${sep_zscii.map(ch => String.fromCharCode(ch)).join(" ")}`
    );

    let entry_length = this.getByte(p++);
    let num_entries = this.getWord(p);
    p += 2;

    for (let i = 0; i < num_entries; i++) {
      let entry_text = zstringToAscii(this, this.getZString(p), false);
      console.log(
        ` [${i}] ${entry_text} ${hex(this.getWord(p))} ${hex(
          this.getWord(p + 2)
        )}`
      );
      p += entry_length; // we skip the data
    }

    console.log();
  }

  continueAfterUserInput(input_state, input) {
    // probably not fully necessary, but unwind back to the event loop before transfering
    // back to game code.
    let timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);

      input = input.toLowerCase();

      let { textBuffer, parseBuffer } = input_state;

      let max_input = this.getByte(textBuffer);
      if (this._version <= 4) {
        // we have to append a terminator character, so the amount of allowed user input is 1 less.
        max_input--;
      }
      input = input.slice(0, max_input);

      for (let i = 0, e = input.length; i < e; i++) {
        let c = input.charCodeAt(i);
        // XXX(toshok) convert `c` to zscii.  for now assume we're dealing with ascii anyway and just
        // pass it through.

        this.setByte(textBuffer + (this._version <= 4 ? 1 : 2) + i, c);
      }

      if (this._version <= 4) {
        // store our terminating \0
        this.setByte(textBuffer + 1 + input.length, 0);
      } else {
        // store the length of the string at offset 1.  no terminator in these versions.
        this.setByte(textBuffer + 1, input.length);
      }

      this.tokeniseLine(textBuffer, parseBuffer, 0, false);

      if (this._version >= 5) {
        log.error("sread doesn't store the last key (return) anywhere");
      }

      this.executeLoop();
    });
  }

  execute() {
    this._pc = this.getWord(6);
    this.executeLoop();
  }

  executeLoop() {
    try {
      while (!this._quit) {
        this._op_pc = this._pc;
        executeInstruction(this);
      }
    } catch (e) {
      if (e instanceof SuspendForUserInput) {
        // use setTimeout so we fully unwind before calling the input_cb
        let timeoutId = setTimeout(() => {
          clearTimeout(timeoutId);
          try {
            this._screen.getInputFromUser(this, e.state);
          } catch (e) {
            console.error(e);
          }
        });
      } else {
        console.error(e);
      }
    }
  }
  unpackRoutineAddress(addr) {
    if (this._version <= 3) return 2 * addr;
    else if (this._version <= 5) return 4 * addr;
    else if (this._version <= 7) return 4 * addr + this._routine_offset;
    else if (this._version == 8) return 8 * addr;
    else throw new Error("unknown version");
  }

  unpackStringAddress(addr, for_call) {
    if (this._version <= 3) return 2 * addr;
    else if (this._version <= 5) return 4 * addr;
    else if (this._version <= 7) return 4 * addr + this._strings_offset;
    else if (this._version == 8) return 8 * addr;
    else throw new Error("unknown version");
  }

  getObject(objnum) {
    if (objnum === 0) return null;

    if (
      (this._version <= 3 && objnum > 255) ||
      (this._version >= 4 && objnum > 65535)
    ) {
      throw new Error(`Invalid object number ${objnum}`);
    }

    let cached_obj = this._game_objects[objnum];
    if (!cached_obj)
      this._game_objects[objnum] = cached_obj = new GameObject(this, objnum);
    return cached_obj;
  }

  pushStack(v) {
    if (v === undefined || v === null) throw new Error("bad value on push");
    this._stack.push(v);
    log.debug(
      `     after pushStack(${hex(v)}): ${this._stack.map(el => hex(el))}`
    );
  }
  popStack() {
    log.debug(`     before popStack: ${this._stack.map(el => hex(el))}`);
    if (this._stack.length === 0) throw new Error("empty stack");
    return this._stack.pop();
  }
  peekStack() {
    log.debug(`     before peekStack: ${this._stack.map(el => hex(el))}`);
    if (this._stack.length === 0) throw new Error("empty stack");
    return this._stack[this._stack.length - 1];
  }

  storeVariable(v, value, replaceTop = false) {
    if (v === 0) {
      if (replaceTop) this.popStack();
      this.pushStack(value);
      return;
    }
    if (v < 16) {
      // local
      let cur_frame = this._callstack[this._callstack.length - 1];
      if (v > cur_frame.locals.length) {
        throw new Error(
          `local ${v} out of range.  there are ${
            cur_frame.locals.length
          } locals`
        );
      }
      cur_frame.locals[v - 1] = value;
    } else {
      // global
      this.setWord(this._global_vars + 2 * (v - 16), value);
    }
  }

  loadVariable(variable, peekTop = false) {
    if (variable === 0) {
      if (peekTop) return this.peekStack();
      return this.popStack();
    }
    if (variable < 16) {
      // local
      let cur_frame = this._callstack[this._callstack.length - 1];
      if (variable > cur_frame.locals.length) {
        throw new Error("no local");
      }
      return cur_frame.locals[variable - 1];
    } else {
      // global
      return this.getWord(this._global_vars + 2 * (variable - 16));
    }
  }

  readByte() {
    let rv = this.getByte(this._pc);
    this._pc++;
    return rv;
  }
  readWord() {
    let rv = this.getWord(this._pc);
    this._pc += 2;
    return rv;
  }
  readZString() {
    let rv = this.getZString(this._pc);
    this._pc += Math.floor((rv.length / 3) * 2);
    return rv;
  }

  getByte(addr) {
    if (addr < 0 || addr >= this._mem.length) throw new Error("segfault");
    return this._mem[addr];
  }
  setByte(addr, b) {
    if (addr < 0 || addr >= this._mem.length) throw new Error("segfault");
    this._mem[addr] = b;
  }
  getWord(addr) {
    if (addr < 0 || addr > this._mem.length) throw new Error("segfault");
    let ub = this._mem[addr + 0];
    let lb = this._mem[addr + 1];
    return ub * 256 + lb;
  }
  setWord(addr, value) {
    if (addr < 0 || addr > this._mem.length) throw new Error("segfault");
    let lb = value & 255;
    let ub = value >> 8;
    this._mem[addr + 0] = ub;
    this._mem[addr + 1] = lb;
  }
  getZString(addr) {
    let chars = [];
    while (true) {
      let w = this.getWord(addr);
      chars.push((w >> 10) & 0x1f, (w >> 5) & 0x1f, (w >> 0) & 0x1f);
      if ((w & 0x8000) !== 0) {
        break;
      }
      addr += 2;
    }
    return chars;
  }
  getLenZString(addr) {
    let len = this.getByte(addr);
    addr++;
    let chars = [];
    while (len-- > 0) {
      let w = this.getWord(addr);
      chars.push((w >> 10) & 0x1f, (w >> 5) & 0x1f, (w >> 0) & 0x1f);
      if ((w & 0x8000) !== 0) {
        log.warn("high bit found in length string.");
        break;
      }
      addr += 2;
    }
    return chars;
  }

  readBranchOffset() {
    let branchData = this.readByte();
    let off1 = branchData & 0x3f;
    let offset;
    if ((branchData & 0x40) == 0x40) {
      // 1 byte offset
      offset = off1;
    } else {
      // 2 byte offset
      // propagate sign bit
      if ((off1 & 0x20) !== 0) off1 |= 0xc0;

      offset = this.toI16((off1 << 8) | this.readByte());
    }
    return [offset, (branchData & 0x80) === 0x00];
  }

  doBranch(cond, condfalse, offset) {
    log.debug(`     ${cond} ${!condfalse} ${offset}`);
    if ((cond && !condfalse) || (!cond && condfalse)) {
      if (offset === 0) {
        log.debug("     returning false");
        this.returnFromRoutine(0);
      } else if (offset === 1) {
        log.debug("     returning true");
        this.returnFromRoutine(1);
      } else {
        this._pc = this._pc + offset - 2;
        log.debug(`     taking branch to ${this._pc}!`);
      }
    }
  }

  callRoutine(addr, rv_location, ...args) {
    if (addr === 0) {
      this.storeVariable(rv_location, 0);
      return;
    }
    // initialize locals
    let num_locals = this.getByte(addr++);
    let locals = Array(num_locals);
    if (this._version >= 5) {
      for (let i = 0; i < num_locals; i++) locals[i] = 0;
    } else {
      for (let i = 0; i < num_locals; i++) {
        locals[i] = this.getWord(addr);
        addr += 2;
      }
    }

    // args are passed by overwriting local
    for (let ai = 0; ai < Math.min(args.length, num_locals); ai++) {
      locals[ai] = args[ai];
    }

    let new_frame = {
      return_pc: this._pc,
      return_value_location: rv_location,
      locals,
      arg_count: args.length
    };

    this._callstack.push(new_frame);
    this._pc = addr;
  }
  returnFromRoutine(value) {
    let popped_frame = this._callstack.pop();
    if (popped_frame.return_value_location !== null) {
      this.storeVariable(popped_frame.return_value_location, value);
    }
    this._pc = popped_frame.return_pc;
  }

  getArgCount() {
    let cur_frame = this._callstack[this._callstack.length - 1];
    return cur_frame.arg_count;
  }

  toI16(_ui16) {
    this._u16_array[0] = _ui16;
    return this._i16_array[0];
  }

  toU16(_i16) {
    this._i16_array[0] = _i16;
    return this._u16_array[0];
  }

  lookupToken(dict, encoded_token_words) {
    // skip the separators
    let num_sep = this.getByte(dict);
    dict += num_sep + 1;

    let entry_len = this.getByte(dict);
    dict++;

    let num_entries = this.getWord(dict);
    dict += 2;
    if (num_entries < 0) {
      // the entries aren't sorted, linear search
      let lower = 0;
      let upper = -num_entries - 1;
      while (lower <= upper) {
        let entry_addr = dict + lower * entry_len;

        let c = this.getWord(entry_addr) - encoded_token_words[0];
        if (c === 0) c = this.getWord(entry_addr + 2) - encoded_token_words[1];
        if (this._version > 3 && c === 0) {
          c = this.getWord(entry_addr + 4) - encoded_token_words[2];
        }
        if (c === 0) {
          return entry_addr;
        }
      }
      return 0; // not found
    }

    // sorted case, binary search
    let lower = 0;
    let upper = num_entries - 1;
    while (lower <= upper) {
      let cmp_entry = Math.floor((lower + upper) / 2);
      let entry_addr = dict + cmp_entry * entry_len;

      let c = this.getWord(entry_addr) - encoded_token_words[0];
      if (c === 0) c = this.getWord(entry_addr + 2) - encoded_token_words[1];
      if (this._version > 3 && c === 0) {
        c = this.getWord(entry_addr + 4) - encoded_token_words[2];
      }
      if (c < 0) {
        // entry is < encoded, pick upper half
        lower = cmp_entry + 1;
      } else if (c > 0) {
        // entry is > encoded, pick lower half
        upper = cmp_entry - 1;
      }
      // entry === encoded, done.
      else return entry_addr;
    }
    return 0; // not found
  }

  // XXX(toshok) woefully inadequate, but should handle ascii + separators
  encodeToken(text, padding = 0x05) {
    log.debug(`encodeToken(${text})`);
    let resolution = this._version > 3 ? 3 : 2;

    // chop it off at 6 characters (the max)
    text = text.slice(0, 6);
    let zchars = [];

    for (let i = 0; i < text.length; i++) {
      if (text[i] < "a" || text[i] > "z")
        throw new Error("encodeToken is too dumb");
      zchars.push(text.charCodeAt(i) - "a".charCodeAt(0) + 6);
    }
    while (zchars.length < 6) {
      zchars.push(padding);
    }

    let zwords = [];

    for (let i = 0; i < resolution; i++) {
      zwords.push(
        (zchars[3 * i + 0] << 10) | (zchars[3 * i + 1] << 5) | zchars[3 * i + 2]
      );
    }
    zwords[resolution - 1] |= 0x8000;

    log.debug(`returning ${zwords}`);
    return zwords;
  }

  dumpParsebuffer(parsebuffer) {
    let max = this.getByte(parsebuffer);
    parsebuffer++;
    let count = this.getByte(parsebuffer);
    parsebuffer++;
    log.debug(` max = ${max}, count = ${count} tokens = [`);
    for (let i = 0; i < count; i++) {
      let addr = this.getWord(parsebuffer);
      parsebuffer += 2;
      let length = this.getByte(parsebuffer);
      parsebuffer++;
      let from = this.getByte(parsebuffer);
      parsebuffer++;
      log.debug(` (${hex(addr)}, ${hex(from)}, ${hex(length)})`);
    }
    log.debug(" ]");
  }

  tokenise_word(inputbuffer, start, end, parsebuffer) {
    // the parse buffer contains as the first two bytes
    // [0]: max tokens
    // [1]: count tokens
    // max tokens is supplied to us, and we fill in count tokens

    let max_tokens = this.getByte(parsebuffer);

    let count_tokens = this.getByte(parsebuffer + 1);
    if (count_tokens >= max_tokens) return;

    let wordtext = inputbuffer.slice(start, end).toLowerCase();
    let tokenword = this.encodeToken(wordtext);
    //log.warn(`tokenise_word "${wordtext} (${hex(tokenword[0])},${hex(tokenword[1])})"`);

    let token_addr = this.lookupToken(this._dict, tokenword);
    //log.warn(`address for ${wordtext} == ${hex(token_addr)}`);
    if (token_addr !== 0) {
      let token_storage = 4 * count_tokens + 2 + parsebuffer;
      this.setByte(parsebuffer + 1, ++count_tokens);
      this.setWord(token_storage, token_addr);
      this.setByte(token_storage + 2, end - start);
      this.setByte(token_storage + 3, start + 1);
    }
  }

  tokeniseText(textBuffer, length, from, parseBuffer, dict, flag) {
    let addr;
    let token_max, token_count;

    token_max = this.getByte(parseBuffer);
    token_count = this.getByte(parseBuffer + 1);

    if (token_count >= token_max) {
      // no space for more tokens
      return;
    }

    this.setByte(parseBuffer + 1, token_count + 1);

    // frotz decodes then encodes again.  not sure why.
    let wordZChars = [];
    for (let i = 0; i < length; i++) {
      wordZChars.push(String.fromCharCode(this.getByte(textBuffer + from + i)));
    }

    let tokenword = this.encodeToken(wordZChars.join(""));
    let token_addr = this.lookupToken(this._dict, tokenword);
    if (token_addr !== 0 || !flag) {
      let token_storage = 4 * token_count + parseBuffer + 2;
      this.setWord(token_storage, token_addr);
      this.setByte(token_storage + 2, length);
      this.setByte(token_storage + 3, from);
    }
  }

  tokeniseLine(textBuffer, parseBuffer, dict, flag) {
    // default to the standard dictionary
    if (dict === 0) {
      dict = this._dict;
    }

    // reset token count to 0
    this.setByte(parseBuffer + 1, 0);

    let addr1 = textBuffer;
    let addr2 = 0;
    let length = 0;

    if (this._version >= 5) {
      addr1++; // skip the max length byte
      length = this.getByte(addr1);
    }

    let c;
    do {
      let sep_addr;
      let sep_count;
      let separator;

      addr1++;

      // fetch next character
      if (this._version >= 5 && addr === textBuffer + 2 + length) {
        c = 0;
      } else {
        c = this.getByte(addr1);
      }

      // check for separator
      sep_addr = dict;
      sep_count = this.getByte(sep_addr++);
      do {
        separator = this.getByte(sep_addr++);
      } while (c != separator && --sep_count != 0);

      /* This could be the start or the end of a word */

      if (sep_count == 0 && c != 32 && c != 0) {
        if (addr2 == 0) {
          addr2 = addr1;
        }
      } else if (addr2 != 0) {
        this.tokeniseText(
          textBuffer,
          addr1 - addr2,
          addr2 - textBuffer,
          parseBuffer,
          dict,
          flag
        );

        addr2 = 0;
      }

      if (sep_count != 0) {
        this.tokeniseText(textBuffer, 1, addr1 - text, parseBuffer, dict, flag);
      }
    } while (c != 0);

    /*
    // dump out the contents of the parseBuffer
    console.log(`token_max = ${this.getByte(parseBuffer)}`);
    console.log(`token_count = ${this.getByte(parseBuffer + 1)}`);
    for (let i = 0; i < this.getByte(parseBuffer + 1); i++) {
      let addr = this.getWord(parseBuffer + 2 + 4 * i);
      let length = this.getByte(parseBuffer + 2 + 4 * i + 2);
      let from = this.getByte(parseBuffer + 2 + 4 * i + 3);
      console.log(` token[${i}] = ${addr} (from ${from}, length ${length})`);
    }
    */
  }

  tokenise(inputtext, parsebuffer) {
    // clean parsebuffer by setting count_tokens == 0
    this.setByte(parsebuffer + 1, 0);

    let num_sep = this.getByte(this._dict);
    let sep_zscii = [];
    for (let i = 0; i < num_sep; i++)
      sep_zscii.push(this.getByte(this._dict + 1 + i));

    log.debug(`sep_zscii = ${sep_zscii.map(ch => String.fromCharCode(ch))}`);

    function is_separator(c) {
      return sep_zscii.indexOf(c.charCodeAt(0)) !== -1;
    }

    const CHAR_CLASS_SPACE = 2;
    const CHAR_CLASS_SEP = 1;
    const CHAR_CLASS_WORD = 0;

    function char_class(c) {
      if (c === " ") return CHAR_CLASS_SPACE;
      if (is_separator(c)) return CHAR_CLASS_SEP;
      return CHAR_CLASS_WORD;
    }

    let split_string = inputtext.split("");
    let classes = split_string.map(char_class);
    for (let start = 0; start < classes.length; start++) {
      if (classes[start] === CHAR_CLASS_SPACE) {
        continue;
      }
      if (classes[start] === CHAR_CLASS_SEP) {
        this.tokenise_word(inputtext, start, start + 1, parsebuffer);
        continue;
      }

      let end;

      for (end = start + 1; end < classes.length; end++) {
        if (classes[end] !== CHAR_CLASS_WORD) {
          this.tokenise_word(inputtext, start, end, parsebuffer);
          start = end - 1;
          break;
        }
      }

      if (end === classes.length) {
        this.tokenise_word(inputtext, start, end, parsebuffer);
        break;
      }
    }

    this.dumpParsebuffer(parsebuffer);
  }
}

import zstringToAscii from "./zstringToAscii";
import GameObject from "./GameObject";
import SuspendForUserInput from "./SuspendForUserInput";
import { hex } from "./debug-helpers";
import { toI16, toU16 } from "./cast16";

// function isZasciiInput(c) {
//   return c >= 32 && c <= 126; // XXX only ascii for now.
// }

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

// branch opcodes
function je(s, a, b, c, d) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
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
  s._log.debug(
    `${hex(s.op_pc)} jl ${hex(a)} ${hex(b)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  s.doBranch(toI16(a) < toI16(b), condfalse, offset);
}

function jg(s, a, b) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} jg ${hex(a)} ${hex(b)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  s.doBranch(toI16(a) > toI16(b), condfalse, offset);
}

function jin(s, obj1, obj2) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} jin ${hex(obj1)} ${hex(obj2)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  let o1 = s.getObject(obj1);
  if (o1 === null) {
    s._log.error("child object is null in jin");
    s.doBranch(false, condfalse, offset);
  } else {
    let parentObjNum = o1.parent ? o1.parent.objnum : 0;
    s.doBranch(parentObjNum === obj2, condfalse, offset);
  }
}

function jz(s, a) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} jz ${hex(a)} -> [${!condfalse}] ${hex(s.pc + offset - 2)}`
  );
  /*
  if (a === 2) {
    console.log(s._callstack[s._callstack.length - 1]);
  }
  console.log(` jz arg = ${a}`);
  */
  s.doBranch(a === 0, condfalse, offset);
}

function jump(s, addr) {
  s.pc = s.pc + toI16(addr) - 2;
}

function test(s, bitmap, flags) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} test ${hex(bitmap)} ${hex(flags)} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  s.doBranch((bitmap & flags) === flags, condfalse, offset);
}

function check_arg_count(s, argNumber) {
  let [offset, condfalse] = s.readBranchOffset();

  s.doBranch(s.getArgCount() >= argNumber, condfalse, offset);
}

// math opcodes
function or(s, a, b) {
  s.storeVariable(s.readByte(), a | b);
}

function and(s, a, b) {
  s.storeVariable(s.readByte(), a & b);
}

function add(s, a, b) {
  s.storeVariable(s.readByte(), toI16(a) + toI16(b));
}

function sub(s, a, b) {
  s.storeVariable(s.readByte(), toI16(a) - toI16(b));
}

function mul(s, a, b) {
  s.storeVariable(s.readByte(), toI16(a) * toI16(b));
}

function div(s, a, b) {
  s.storeVariable(s.readByte(), Math.floor(toI16(a) / toI16(b)));
}

function mod(s, a, b) {
  s.storeVariable(s.readByte(), toI16(a) % toI16(b));
}

function not(s, value) {
  s.storeVariable(s.readByte(), value ^ 0xffff);
}

// object/attribute related opcodes
function test_attr(s, obj, attribute) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} test_attr ${hex(obj)} ${hex(
      attribute
    )} -> [${!condfalse}] ${hex(s.pc + offset - 2)}`
  );
  let o = s.getObject(obj);
  if (o === null) {
    s._log.error("object null in test_attr");
    s.doBranch(false, condfalse, offset);
  } else {
    s.doBranch(o.hasAttribute(attribute), condfalse, offset);
  }
}

function set_attr(s, obj, attribute) {
  s._log.debug(`${hex(s.op_pc)} set_attr ${obj} ${attribute}`);
  let o = s.getObject(obj);
  o.setAttribute(attribute);
}

function clear_attr(s, obj, attribute) {
  s._log.debug(`${hex(s.op_pc)} clear_attr ${obj} ${attribute}`);
  let o = s.getObject(obj);
  o.clearAttribute(attribute);
}

function insert_obj(s, obj, destination) {
  s._log.debug(`${hex(s.op_pc)} insert_obj ${obj} ${destination}`);
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

function get_prop(s, obj, property) {
  let resultVar = s.readByte();
  s._log.debug(
    `${hex(s.op_pc)} get_prop ${hex(obj)} ${hex(property)} -> (${hex(
      resultVar
    )})`
  );
  let o = s.getObject(obj);
  if (o === null) {
    s._log.warn("get_prop called on null object");
    s.storeVariable(resultVar, 0);
    return;
  }
  s.storeVariable(resultVar, o.getProperty(property));
}

function get_prop_addr(s, obj, property) {
  let resultVar = s.readByte();
  s._log.debug(
    `${hex(s.op_pc)} get_prop_addr ${hex(obj)} ${hex(property)} -> (${hex(
      resultVar
    )})`
  );
  let o = s.getObject(obj);
  s.storeVariable(resultVar, o.getPropertyAddress(property));
}

function get_next_prop(s, obj, property) {
  let resultVar = s.readByte();
  s._log.debug(
    `${hex(s.op_pc)} get_next_prop ${hex(obj)} ${hex(property)} -> (${hex(
      resultVar
    )})`
  );
  let o = s.getObject(obj);
  s.storeVariable(resultVar, o.getNextProperty(property));
}

function get_sibling(s, obj) {
  let resultVar = s.readByte();
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
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
    s._log.warn("object is 0 in get_sibling");
    s.storeVariable(resultVar, 0);
  }

  s.doBranch(sibling !== null, condfalse, offset);
}

function get_child(s, obj) {
  let resultVar = s.readByte();
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
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
  s._log.debug(`${hex(s.op_pc)} get_parent ${hex(obj)} -> (${hex(resultVar)})`);
  let o = s.getObject(obj);
  if (o === null) {
    s._log.error("object null in get_parent");
  }
  let parent_objnum = o === null || o.parent === null ? 0 : o.parent.objnum;
  s.storeVariable(resultVar, parent_objnum);
}

function remove_obj(s, obj) {
  s._log.debug(`${hex(s.op_pc)} remove_obj ${hex(obj)}`);
  let o = s.getObject(obj);
  o.unlink();
}

function put_prop(s, obj, property, value) {
  s._log.debug(`put ${hex(obj)} ${hex(property)} ${hex(value)}`);
  let o = s.getObject(obj);
  if (o === null) {
    s._log.warn("put_prop called on null object");
    return;
  }
  o.putProperty(property, value);
}

function get_prop_len(s, propDataAddr) {
  let resultVar = s.readByte();
  s._log.debug(
    `${hex(s.op_pc)} get_prop_len ${hex(propDataAddr)} -> (${hex(resultVar)})`
  );
  let len = GameObject.getPropertyLength(s, propDataAddr);
  s.storeVariable(resultVar, len);
}

// stack manipulation
function push(s, value) {
  s.pushStack(value);
}

function pop(s) {
  s.popStack();
}

function pull(s, variable) {
  s.storeVariable(variable, s.popStack());
}

// increment/decrement variables
function dec_chk(s, variable, value) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} dec_chk ${hex(variable)} ${value} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  let new_val = toI16(s.loadVariable(variable, true)) - 1;
  s.storeVariable(variable, toU16(new_val), true);
  s._log.debug(`     ${new_val} <? ${value}`);
  s.doBranch(new_val < toI16(value), condfalse, offset);
}

function inc_chk(s, variable, value) {
  let [offset, condfalse] = s.readBranchOffset();
  s._log.debug(
    `${hex(s.op_pc)} inc_chk ${hex(variable)} ${value} -> [${!condfalse}] ${hex(
      s.pc + offset - 2
    )}`
  );
  let new_val = toI16(s.loadVariable(variable, true)) + 1;
  s.storeVariable(variable, toU16(new_val), true);
  s._log.debug(`     ${new_val} ?> ${value}`);
  s.doBranch(new_val > toI16(value), condfalse, offset);
}

function inc(s, variable) {
  s.storeVariable(
    variable,
    toU16(toI16(s.loadVariable(variable, true)) + 1),
    true
  );
}

function dec(s, variable) {
  s.storeVariable(
    variable,
    toU16(toI16(s.loadVariable(variable, true)) - 1),
    true
  );
}

// load/store variables
function store(s, variable, value) {
  s._log.debug(`${hex(s.op_pc)} store (${hex(variable)}) ${hex(value)}`);
  s.storeVariable(variable, value, true);
}

function storew(s, array, word_index, value) {
  s._log.debug(
    `${hex(s.op_pc)} storew ${hex(array)} ${hex(word_index)} ${hex(value)}`
  );
  s.setWord((array + 2 * word_index) & 0xffff, value);
}
function storeb(s, array, byte_index, value) {
  s._log.debug(
    `${hex(s.op_pc)} storeb ${hex(array)} ${hex(byte_index)} ${hex(value)}`
  );
  s.setByte((array + byte_index) & 0xffff, value);
}

function load(s, variable) {
  let resultVar = s.readByte();
  s._log.debug(`${hex(s.op_pc)} load ${hex(variable)} -> (${hex(resultVar)})`);
  s.storeVariable(resultVar, s.loadVariable(variable, true), true);
}

function loadw(s, array, word_index) {
  let resultVar = s.readByte();
  s._log.debug(
    `${hex(s.op_pc)} loadw ${hex(array)} ${hex(word_index)} -> (${hex(
      resultVar
    )})`
  );
  s.storeVariable(resultVar, s.getWord((array + 2 * word_index) & 0xffff));
}

function loadb(s, array, byte_index) {
  let resultVar = s.readByte();
  s._log.debug(
    `${hex(s.op_pc)} loadb ${hex(array)} ${hex(byte_index)} -> (${hex(
      resultVar
    )})`
  );
  s.storeVariable(resultVar, s.getByte((array + byte_index) & 0xffff));
}

// opcodes dealing with function calls/returns
function call_1s(s, routine) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  s._log.debug(
    `${hex(s.op_pc)} call_1s ${hex(routine)} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar);
}

function call_1n(s, routine) {
  if (routine === 0) {
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  s._log.debug(`${hex(s.op_pc)} call_1n ${hex(routine)}`);
  s.callRoutine(routine, null);
}

function call_2s(s, routine, arg1) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  s._log.debug(
    `${hex(s.op_pc)} call_2s ${hex(routine)} ${arg1} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar, arg1);
}

function call_2n(s, routine, arg1) {
  if (routine === 0) {
    return;
  }
  s._log.debug(`${hex(s.op_pc)} call_2n ${hex(routine)} ${arg1}`);
  routine = s.unpackRoutineAddress(routine);
  s.callRoutine(routine, null, arg1);
}

function call_vs2(s, routine, ...args) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  s._log.debug(
    `${hex(s.op_pc)} call_vs2 ${hex(routine)} ${args} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar, ...args);
}

function call(s, routine, ...args) {
  let resultVar = s.readByte();
  if (routine === 0) {
    s.storeVariable(resultVar, 0);
    return;
  }
  routine = s.unpackRoutineAddress(routine);
  s._log.debug(
    `${hex(s.op_pc)} call ${hex(routine)} ${args} -> (${hex(resultVar)})`
  );
  s.callRoutine(routine, resultVar, ...args);
}

function call_vn2(s, routine, ...args) {
  if (routine === 0) {
    return;
  }
  s._log.debug(`${hex(s.op_pc)} call_2n ${hex(routine)} ${arg1}`);
  routine = s.unpackRoutineAddress(routine);
  s.callRoutine(routine, null, ...args);
}

function ret(s, value) {
  s.returnFromRoutine(value);
}

function rtrue(s) {
  s.returnFromRoutine(1);
}

function rfalse(s) {
  s.returnFromRoutine(0);
}

function ret_popped(s) {
  s.returnFromRoutine(s.popStack());
}

function print_ret(s) {
  s._log.debug(`${hex(s.op_pc)} print_ret`);
  s._screen.print(s, zstringToAscii(s, s.readZString(), true));
  s.returnFromRoutine(1);
}

// screen-related opcodes
function set_color(s, foreground, background, window) {
  if (s._version <= 5) {
    window = 0;
  }
  // XXX(toshok) we need to flush whatever text is buffered before changing the colors
  s._screen.setTextColors(s, window, foreground, background);
}

function print_addr(s, stringAddr) {
  s._log.debug(`${hex(s.op_pc)} print_addr ${hex(stringAddr)}`);
  s._screen.print(s, zstringToAscii(s, s.getZString(stringAddr), true));
}

function print_obj(s, obj) {
  s._log.debug(`${hex(s.op_pc)} print_obj ${hex(obj)}`);
  let o = s.getObject(obj);
  s._screen.print(s, `${o.name}`);
}

function print_paddr(s, packed_addr) {
  s._screen.print(
    s,
    zstringToAscii(s, s.getZString(s.unpackStringAddress(packed_addr), true))
  );
}

function new_line(s) {
  s._screen.print(s, "\n");
}

function show_status(s) {
  if (s._version >= 4) {
    return;
  }
  //   let location = s.getWord(s._global_vars + 0);
  //   let score = s.getWord(s._global_vars + 2); // if we're supposed to show time,
  //   let moves = s.getWord(s._global_vars + 4); // both of these contain the time.
  // XXX(toshok) more here.
}

function print(s) {
  s._screen.print(s, zstringToAscii(s, s.readZString(), true));
}

function split_window(s, lines) {
  s._screen.splitWindow(s, lines);
}
function set_window(s, window) {
  s._screen.setOutputWindow(s, window);
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
  s._log.warn(`get_cursor ${array} -- not implemented`);
}

function set_text_style(s, style) {
  s._screen.setTextStyle(s, style);
}

function buffer_mode(s, flag) {
  s._screen.setBufferMode(s, flag);
}

function output_stream(s, number, table, width) {
  let streamNumber = toI16(number);
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
  s._screen.selectInputStream(s, toI16(number));
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

function sread(s, textBuffer, parseBuffer, time, routine) {
  let resultVar;

  if (s._version >= 5) {
    resultVar = s.readByte();
  }

  let max_input = s.getByte(textBuffer) + 1;
  s._log.debug(
    `sread max_input=${max_input}, text=${textBuffer}, parse=${parseBuffer}, time=${time}, routine=${routine}`
  );
  // XXX(toshok) we need to handle the initial contents of the buffer (only Shogun and Zork Zero use it?)
  throw new SuspendForUserInput({
    textBuffer,
    parseBuffer,
    time,
    routine,
    resultVar
  });
}
function print_char(s, ...chars) {
  s._log.debug(`print_char(${chars})`);
  s._screen.print(s, chars.map(c => String.fromCharCode(c)).join(""));
}
function print_num(s, value) {
  s._screen.print(s, toI16(value).toString());
}
function random(s, range) {
  s._log.debug(`random(${range})`);
  let resultVar = s.readByte();
  if (range <= 0) {
    // (XXX) can't seed in JS?
    s.storeVariable(resultVar, 0);
  } else {
    let rv = Math.floor(Math.random() * range + 1);
    s.storeVariable(resultVar, rv);
  }
}

function sound_effect(s, number, _effect, _volume, _routine) {
  s._log.warn(`sound_effect ${number} -- not implemented`);
}
function read_char(s, _dev, _time, _routine) {
  let resultVar = s.readByte();
  //    readline.keyIn("{ hideEchoBack: true, mask: "" });
  s.storeVariable(resultVar, 32 /*XXX*/);
}
function scan_table(s, x, table, len, form = 0x82) {
  let resultVar = s.readByte();
  let [offset, condfalse] = s.readBranchOffset();

  s._log.debug(`scan_table ${hex(x)} ${hex(table)} ${hex(len)} ${hex(form)}`);

  // XXX can we verify that 'x' is the proper sized value?
  let searchForWord = (form & 0x80) === 80;
  let elementSize = form & 0x7f;

  let cur = table;
  let end = table + len;
  while (cur < end) {
    let table_element = searchForWord ? s.getWord(cur) : s.getByte(cur);
    if (table_element === x) {
      s._log.debug(`+ found element at ${hex(cur)}`);
      s.storeVariable(resultVar, cur);
      s.doBranch(true, condfalse, offset);
      return;
    }
    cur += elementSize;
  }

  s._log.debug(`+ didn't find element`);
  s.storeVariable(resultVar, 0);
  // don't branch
}

function tokenise(s, text, tokenBuffer, dict = 0, flag = 0) {
  s.tokeniseLine(text, tokenBuffer, dict, flag != 0);
}

function print_table(s, zscii_text, width, height, skip) {
  s._log.debug("print_table");
  if (width) {
    s._log.debug(`width = ${width}`);
  }
  if (height) {
    s._log.debug(`height = ${height}`);
  }
  if (skip) {
    s._log.debug(`skip = ${skip}`);
  }
}

function piracy(s) {
  let [offset, condfalse] = s.readBranchOffset();
  // we are gullible and assume everything is okay.
  s.doBranch(true, condfalse, offset);
}

function zCatch(s) {
  let resultVar = s.readByte();
  s.storeVariable(resultVar, s._callstack.length - 1);
}

function zThrow(s, returnVal, frameNum) {
  if (frameNum >= s._callstack.length) {
    throw new Error("bad frame number");
  }
  s._callstack = s._callstack.slice(0, frameNum + 1);

  s.returnFromRoutine(returnVal);
}

export const op2 = [
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
  opcodeImpl(zThrow),
  illegalOpcode(),
  illegalOpcode(),
  illegalOpcode()
];

export const op1 = [
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
  opcodeImpl(call_1n)
];

export const op0 = [
  opcodeImpl(rtrue),
  opcodeImpl(rfalse),
  opcodeImpl(print),
  opcodeImpl(print_ret),

  nopcode(),

  opcodeImpl(save),
  opcodeImpl(restore),
  unimplementedOpcode("restart"),

  opcodeImpl(ret_popped),
  opcodeImpl(pop),

  opcodeImpl(quit),
  opcodeImpl(new_line),
  opcodeImpl(show_status),
  opcodeImpl(zCatch),
  unimplementedOpcode("verify"),
  unimplementedOpcode("extended"), // not actually an instruction
  opcodeImpl(piracy)
];

export const opv = [
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
  opcodeImpl(not),
  unimplementedOpcode("call_vn"),
  opcodeImpl(call_vn2),
  opcodeImpl(tokenise),

  unimplementedOpcode("encode_text"),
  unimplementedOpcode("copy_table"),

  opcodeImpl(print_table),
  opcodeImpl(check_arg_count)
];

export const op3 = [illegalOpcode(), op2[1]];

export const op4 = [illegalOpcode(), op2[1]];

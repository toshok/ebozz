import type Game from "./ebozz.js";
import type { Address } from "./types.js";
import zstringToAscii from "./zstringToAscii.js";
import { hex } from "./debug-helpers.js";

export default class GameObject {
  private state: Game;
  /*private*/ objnum: number;
  private objaddr: Address;

  constructor(state: Game, objnum: number) {
    this.state = state;
    this.objnum = objnum;

    if (this.state._version <= 3) {
      this.objaddr = state._object_table + 31 * 2 + (objnum - 1) * 9;
    } else {
      this.objaddr = state._object_table + 63 * 2 + (objnum - 1) * 14;
    }
  }

  dumpPropData(entry: number) {
    let propDataPtr = this._propDataPtr(entry);
    let propDataLen = GameObject._propDataLen(this.state, entry);
    let data: Array<number> = [];
    for (let i = 0; i < propDataLen; i++) {
      data.push(this.state.getByte(propDataPtr + i));
    }
    return data.map(el => hex(el)).join(" ");
  }
  dump(indent = 0) {
    let _indent = " . ".repeat(indent);

    console.log(`${_indent}[${this.objnum}] "${this.name}"`);
    console.log(`${_indent}  Properties:`);
    let entry = this._firstPropEntry();
    for (;;) {
      let propNum = this._propEntryNum(entry);
      if (propNum === 0) {
        break;
      }
      console.log(
        `${_indent}   ${hex(entry)} [${propNum}] ${this.dumpPropData(entry)}`
      );
      entry = this._nextPropEntry(entry);
    }
    for (let c = this.child; c !== null; c = c.sibling) {
      c.dump(indent + 1);
    }
  }

  get name() {
    return zstringToAscii(
      this.state,
      this.state.getZString(this.propertyTableAddr + 1),
      false
    );
  }

  get parent() {
    return this.state.getObject(
      this.state._version <= 3
        ? this.state.getByte(this.objaddr + 4)
        : this.state.getWord(this.objaddr + 6)
    );
  }
  set parent(po) {
    let pobjnum = po === null ? 0 : po.objnum;
    if (this.state._version <= 3) {
      this.state.setByte(this.objaddr + 4, pobjnum);
    } else {
      this.state.setWord(this.objaddr + 6, pobjnum);
    }
  }
  get child() {
    return this.state.getObject(
      this.state._version <= 3
        ? this.state.getByte(this.objaddr + 6)
        : this.state.getWord(this.objaddr + 10)
    );
  }
  set child(co) {
    let cobjnum = co === null ? 0 : co.objnum;
    if (this.state._version <= 3) {
      this.state.setByte(this.objaddr + 6, cobjnum);
    } else {
      this.state.setWord(this.objaddr + 10, cobjnum);
    }
  }
  get sibling() {
    return this.state.getObject(
      this.state._version <= 3
        ? this.state.getByte(this.objaddr + 5)
        : this.state.getWord(this.objaddr + 8)
    );
  }
  set sibling(so) {
    let sobjnum = so === null ? 0 : so.objnum;
    if (this.state._version <= 3) {
      this.state.setByte(this.objaddr + 5, sobjnum);
    } else {
      this.state.setWord(this.objaddr + 8, sobjnum);
    }
  }
  get propertyTableAddr() {
    return this.state.getWord(
      this.objaddr + (this.state._version <= 3 ? 7 : 12)
    );
  }

  hasAttribute(attr: number) {
    if (this.state._version <= 3) {
      if (attr >= 32) {
        throw new Error("attribute number out of range");
      }
    } else {
      if (attr >= 48) {
        throw new Error("attribute number out of range");
      }
    }
    let byte_index = Math.floor(attr / 8);
    let value = this.state.getByte(this.objaddr + byte_index);
    return (value & (0x80 >> (attr & 7))) !== 0;
  }
  setAttribute(attr: number) {
    if (this.state._version <= 3) {
      if (attr >= 32) {
        throw new Error("attribute number out of range");
      }
    } else {
      if (attr >= 48) {
        throw new Error("attribute number out of range");
      }
    }
    let byte_index = Math.floor(attr / 8);
    let value = this.state.getByte(this.objaddr + byte_index);
    value |= 0x80 >> (attr & 7);
    this.state.setByte(this.objaddr + byte_index, value);
  }
  clearAttribute(attr: number) {
    if (this.state._version <= 3) {
      if (attr >= 32) {
        throw new Error("attribute number out of range");
      }
    } else {
      if (attr >= 48) {
        throw new Error("attribute number out of range");
      }
    }
    let byte_index = Math.floor(attr / 8);
    let value = this.state.getByte(this.objaddr + byte_index);
    value &= ~(0x80 >> (attr & 7));
    this.state.setByte(this.objaddr + byte_index, value);
  }

  unlink() {
    // get our parent object, since we clear it below
    const parent = this.parent;
    if (!parent) {
      // no parent, nothing to be done
      return;
    }

    const sibling = this.sibling;

    this.parent = null;
    this.sibling = null;

    // if we're the first child, it's easy
    if (parent.child?.objnum == this.objnum) {
      parent.child = sibling;
      return;
    }

    // otherwise loop through children looking for the child before us
    for (let c = parent.child; c !== null; c = c.sibling) {
      if (c.sibling && c.sibling.objnum === this.objnum) {
        // found the previous node.  skip ourselves and return.
        c.sibling = sibling;
        return;
      }
    }

    // if we didn't find the previous child, something is definitely wrong
    throw new Error("sibling list is in a bad state, couldn't find prev node");
  }

  _nextPropEntry(propAddr: Address) {
    return propAddr + this._propEntrySize(propAddr);
  }

  _propEntrySize(propAddr: Address) {
    return GameObject._propDataLen(this.state, propAddr) + 1;
  }

  _propEntryNum(entryAddr: Address) {
    let mask = this.state._version <= 3 ? 0x1f : 0x3f;
    let sizeByte = this.state.getByte(entryAddr);
    return sizeByte & mask;
  }

  static _propDataLen(state: Game, propAddr: Address) {
    let size = state.getByte(propAddr);

    if (state._version <= 3) {
      size >>= 5;
    } else {
      if (!(size & 0x80)) {
        size >>= 6;
      } else {
        size = state.getByte(propAddr + 1);
        size &= 0x3f;
        if (size === 0) {
          size = 64;
        } /* demanded by Spec 1.0 */
      }
    }

    return size + 1;
  }

  _propDataPtr(propAddr: Address) {
    if (this.state._version <= 3) {
      return propAddr + 1;
    } else {
      let size = this.state.getByte(propAddr);
      if (!(size & 0x80)) {
        return propAddr + 1;
      } else {
        return propAddr + 2;
      }
    }
  }

  _firstPropEntry() {
    let addr = this.propertyTableAddr;
    // skip the name
    let nameLen = this.state.getByte(addr);
    return addr + 1 + 2 * nameLen;
  }

  _getPropEntry(prop: number) {
    let entry = this._firstPropEntry();
    let propNum;
    do {
      propNum = this._propEntryNum(entry);
      if (propNum === prop) {
        return entry;
      }
      entry = this._nextPropEntry(entry);
    } while (propNum > prop);
    return 0;
  }

  getProperty(prop: number) {
    let propAddr = this._getPropEntry(prop);
    if (propAddr === null) {
      throw new Error("default property values not supported");
    }
    let propLen = GameObject._propDataLen(this.state, propAddr);
    switch (propLen) {
      case 1:
        return this.state.getByte(this._propDataPtr(propAddr));
      case 2:
        return this.state.getWord(this._propDataPtr(propAddr));
      default:
        throw new Error(`invalid property length in getProperty: ${propLen}`);
    }
  }

  putProperty(prop: number, value: number) {
    let propAddr = this._getPropEntry(prop);
    if (propAddr === 0) {
      throw new Error(`missing property ${prop}`);
    }
    let propLen = GameObject._propDataLen(this.state, propAddr);
    switch (propLen) {
      case 1:
        return this.state.setByte(this._propDataPtr(propAddr), value & 0xff);
      case 2:
        return this.state.setWord(this._propDataPtr(propAddr), value & 0xffff);
      default:
        throw new Error(`invalid property length in getProperty: ${propLen}`);
    }
  }

  getPropertyAddress(prop: number) {
    let propAddr = this._getPropEntry(prop);
    if (propAddr === 0) {
      return 0;
    }
    return this._propDataPtr(propAddr);
  }

  static entryFromDataPtr(dataAddr: Address) {
    return dataAddr - 1;
  }

  static getPropertyLength(state: Game, dataAddr: Address) {
    if (dataAddr === 0) {
      return 0;
    }
    let entry = GameObject.entryFromDataPtr(dataAddr);

    return GameObject._propDataLen(state, entry);
  }

  getNextProperty(prop: number) {
    let propAddr;
    if (prop === 0) {
      propAddr = this._firstPropEntry();
    } else {
      propAddr = this._getPropEntry(prop);
    }
    if (propAddr === 0) {
      throw new Error("propAddr === null");
    }
    propAddr = this._nextPropEntry(propAddr);
    if (propAddr === 0) {
      return 0;
    }
    return this._propEntryNum(propAddr);
  }
}

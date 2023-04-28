const cvt_buffer = new ArrayBuffer(2);
const i16_array = new Int16Array(cvt_buffer);
const u16_array = new Uint16Array(cvt_buffer);

export function toI16(ui16: number): number {
  u16_array[0] = ui16;
  return i16_array[0];
}

export function toU16(i16: number): number {
  i16_array[0] = i16;
  return u16_array[0];
}

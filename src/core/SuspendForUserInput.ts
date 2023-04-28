import { InputState } from "./types.js";
export default class SuspendForUserInput {
  private _state: InputState;
  constructor(state: InputState) {
    this._state = state;
  }
  get state() {
    return this._state;
  }
}

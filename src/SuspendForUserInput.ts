type SuspendState = {
  textBuffer: number;
  parseBuffer: number;
  time: unknown;
  routine: unknown;
  resultVar: number;
};

export default class SuspendForUserInput {
  private _state: SuspendState;
  constructor(state: SuspendState) {
    this._state = state;
  }
  get state() {
    return this._state;
  }
}

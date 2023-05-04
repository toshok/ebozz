export interface ChatBot {
  debugChannel(msg: string): Promise<void>;
  postMessageToChannel(channel: string, msg: string): Promise<void>;
  setTopic(channel: string, topic: string): Promise<void>;
}

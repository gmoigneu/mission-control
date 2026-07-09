export const MAX_CHAT_MESSAGE_CHARS = 20_000;

export function chatMessageTooLongText(length: number): string {
  return `Chat messages can be up to ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} characters. This draft is ${length.toLocaleString()} characters.`;
}

import type { ChatBubbleMessage, ChatMessage, ReasoningMessage } from "./types";

function isAssistantBubble(msg: ChatMessage): msg is ChatBubbleMessage {
  const kind = (msg as { kind?: string }).kind;
  return msg.role === "agent" && (!kind || kind === "assistant");
}

function latestUserIndex(messages: ReadonlyArray<ChatMessage>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

export function upsertLiveReasoningChunk(
  messages: ReadonlyArray<ChatMessage>,
  chunk: string,
  now = Date.now(),
  forceNewSegment = false,
): ChatMessage[] {
  if (!chunk) return [...messages];

  const turnStart = latestUserIndex(messages) + 1;
  const last = messages[messages.length - 1];
  const insertAt =
    messages.length > turnStart && last && isAssistantBubble(last)
      ? messages.length - 1
      : messages.length;
  const previous = messages[insertAt - 1];

  if (
    !forceNewSegment &&
    previous &&
    previous.role === "agent" &&
    "kind" in previous &&
    previous.kind === "reasoning"
  ) {
    const updated: ReasoningMessage = {
      ...previous,
      text: previous.text + chunk,
    };
    return [
      ...messages.slice(0, insertAt - 1),
      updated,
      ...messages.slice(insertAt),
    ];
  }

  const row: ReasoningMessage = {
    id: `reasoning-${now}-${messages.length}`,
    kind: "reasoning",
    role: "agent",
    text: chunk,
  };
  return [...messages.slice(0, insertAt), row, ...messages.slice(insertAt)];
}

const MAX_LEN = 220;

export function createSentenceChunker() {
  let buffer = "";
  return {
    push(token: string): string[] {
      buffer += token;
      const out: string[] = [];
      const re = /[^.!?]*[.!?]+(?:\s+|$)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(buffer)) !== null) {
        out.push(match[0]);
        buffer = buffer.slice(match.index + match[0].length);
        re.lastIndex = 0;
      }
      if (buffer.length >= MAX_LEN) {
        out.push(buffer);
        buffer = "";
      }
      return out;
    },
    flush(): string[] {
      const trimmed = buffer.trim();
      buffer = "";
      return trimmed ? [trimmed] : [];
    },
  };
}

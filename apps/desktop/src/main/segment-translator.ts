export interface SegmentTranslator {
  translateChineseToJapanese(text: string): Promise<string | null>;
}

export class PassthroughSegmentTranslator implements SegmentTranslator {
  async translateChineseToJapanese(_text: string): Promise<null> {
    return null;
  }
}

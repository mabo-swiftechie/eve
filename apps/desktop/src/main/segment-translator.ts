export interface SegmentTranslator {
  translateChineseToJapanese(text: string): Promise<string>;
}

export class PassthroughSegmentTranslator implements SegmentTranslator {
  async translateChineseToJapanese(text: string): Promise<string> {
    return text;
  }
}

// Minimal ambient types for the (untyped) `troika-three-text` package. We only
// use `configureTextBuilder` to disable its Web Worker; drei provides the
// React <Text> component, so the rest does not need typing here.
declare module "troika-three-text" {
  export function configureTextBuilder(config: {
    useWorker?: boolean;
    sdfGlyphSize?: number;
    defaultFontURL?: string;
  }): void;
}

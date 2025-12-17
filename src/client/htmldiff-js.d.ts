declare module 'htmldiff-js' {
  interface HtmlDiff {
    execute(oldHtml: string, newHtml: string): string;
  }
  interface HtmlDiffModule {
    default: HtmlDiff;
  }
  const htmldiffModule: HtmlDiffModule;
  export default htmldiffModule;
}

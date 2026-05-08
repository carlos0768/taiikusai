declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: { mode?: string | string[]; before?: string; after?: string; avoid?: string };
  }

  interface Html2PdfWorker {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(src: string | HTMLElement, type?: "string" | "element"): Html2PdfWorker;
    to(target: "container" | "canvas" | "img" | "pdf"): Html2PdfWorker;
    save(filename?: string): Promise<void>;
    output(type: "blob"): Promise<Blob>;
    output(type: "datauristring" | "dataurlstring"): Promise<string>;
    output(type: "arraybuffer"): Promise<ArrayBuffer>;
    output<T = unknown>(type: string, options?: unknown): Promise<T>;
    outputPdf(type?: string): Promise<unknown>;
    then<TResult = void>(onFulfilled?: (value: void) => TResult): Promise<TResult>;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(src: HTMLElement | string, options?: Html2PdfOptions): Html2PdfWorker;

  export default html2pdf;
}

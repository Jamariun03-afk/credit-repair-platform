import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 64;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;

/**
 * Renders plain letter text into a clean, printable single/multi-page
 * PDF. No layout library dependency — wraps text manually so this has
 * no external service dependency at generation time.
 */
export async function textToPdf(text: string, title?: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const lines = wrapText(text, font, FONT_SIZE, maxWidth);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  if (title) {
    pdfDoc.setTitle(title);
  }

  for (const line of lines) {
    if (y < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(line, {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= LINE_HEIGHT;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const outputLines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      outputLines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(attempt, fontSize);
      if (width > maxWidth && current) {
        outputLines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    if (current) outputLines.push(current);
  }

  return outputLines;
}

/**
 * Merges multiple existing PDFs (letter + supporting documents) into
 * one package PDF, in the order given. Used by the package builder —
 * documents that aren't already PDFs (e.g. photographed IDs saved as
 * JPG) should be converted before reaching this function.
 */
export async function mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDocuments } from '@/context/DocumentContext';
import { calculateSubtotal, calculateTax } from '@/types/document';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Image, Scissors } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { recordDownload } from '@/lib/downloadHistory';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_FOOTER = {
  footer_line_1: '{business_name}',
  footer_line_2: '{business_phone}  •  {business_email}  •  {business_address}',
  footer_reference: '{doc_label} {doc_number}',
  footer_page_format: 'Page {page} of {total}',
};

function formatCurrency(n: number) {
  return `E${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DocumentPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { documents } = useDocuments();
  const docRef = useRef<HTMLDivElement>(null);
  const [footerCfg, setFooterCfg] = useState(DEFAULT_FOOTER);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [showBreaks, setShowBreaks] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('footer_line_1, footer_line_2, footer_reference, footer_page_format')
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFooterCfg({
          footer_line_1: (data as any).footer_line_1 || DEFAULT_FOOTER.footer_line_1,
          footer_line_2: (data as any).footer_line_2 || DEFAULT_FOOTER.footer_line_2,
          footer_reference: (data as any).footer_reference || DEFAULT_FOOTER.footer_reference,
          footer_page_format: (data as any).footer_page_format || DEFAULT_FOOTER.footer_page_format,
        });
      });
  }, []);

  const doc = documents.find(d => d.id === id);

  const subtotal = doc ? calculateSubtotal(doc.items) : 0;
  const tax = doc ? calculateTax(subtotal, doc.taxRate) : 0;
  const grandTotal = subtotal + tax;

  const docNumber = doc ? (doc.type === 'receipt' ? doc.receiptNumber : doc.type === 'invoice' ? doc.invoiceNumber : doc.quoteNumber) : '';
  const docLabel = doc ? doc.type.charAt(0).toUpperCase() + doc.type.slice(1) : '';

  const safeFileName = (str: string) => str.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
  const fileDate = doc ? format(new Date(doc.issueDate || doc.createdAt), 'yyyy-MM-dd') : '';
  const fileNameBase = doc ? `${safeFileName(doc.clientInfo.name)}-${docLabel}-${docNumber}-${fileDate}` : '';

  // Reserve bottom space (mm) on every PDF page for the footer
  const FOOTER_HEIGHT_MM = 16;
  // Breathing room at the top of every PDF page (matches reference proportions)
  const PAGE_TOP_MM = 20;
  // Extra gap kept above the footer divider so content never hugs the footer
  const FOOTER_GAP_MM = 12;
  // Even, generous side margins on every PDF page (applied identically left & right)
  const PAGE_SIDE_MM = 22;
  // Top padding applied to pages 2+ so continuation content doesn't hug the top edge
  const PAGE_CONTINUATION_TOP_MM = 14;

  // A4 dimensions in mm
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;

  // Compute on-screen page-break positions (in CSS px relative to docRef top)
  // using the same slicing logic as the PDF exporter.
  useEffect(() => {
    if (!doc) return;
    const compute = () => {
      const el = docRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const pxPerMm = rect.width / A4_WIDTH_MM;
      const contentH = rect.height;
      const usableFirst = (A4_HEIGHT_MM - PAGE_TOP_MM - FOOTER_HEIGHT_MM - FOOTER_GAP_MM) * pxPerMm;
      const usableCont = usableFirst - PAGE_CONTINUATION_TOP_MM * pxPerMm;

      // nobreak block ranges relative to docRef top
      const ranges = Array.from(
        el.querySelectorAll<HTMLElement>('[data-pdf-nobreak]')
      )
        .map((n) => {
          const r = n.getBoundingClientRect();
          if (r.height === 0) return null;
          return { top: r.top - rect.top, bottom: r.bottom - rect.top };
        })
        .filter((r): r is { top: number; bottom: number } => r !== null);

      const breaks: number[] = [];
      let cursor = 0;
      let i = 0;
      while (cursor < contentH) {
        const pageH = i === 0 ? usableFirst : usableCont;
        let end = Math.min(cursor + pageH, contentH);
        if (end < contentH) {
          let earliest: number | null = null;
          for (const r of ranges) {
            if (r.top > cursor + 1 && r.top < end && r.bottom > end) {
              if (earliest === null || r.top < earliest) earliest = r.top;
            }
          }
          if (earliest !== null) end = Math.floor(earliest);
        }
        if (end <= cursor) break;
        if (end < contentH) breaks.push(end);
        cursor = end;
        i++;
        if (i > 50) break;
      }
      setPageBreaks(breaks);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (docRef.current) ro.observe(docRef.current);
    window.addEventListener('resize', compute);
    const t = setTimeout(compute, 300);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
      clearTimeout(t);
    };
  }, [doc]);

  const drawFooter = (pdf: jsPDF) => {
    if (!doc) return;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const total = pdf.getNumberOfPages();
    const biz = doc.businessInfo;
    const fillTokens = (tpl: string, page?: number) =>
      tpl
        .replace(/\{business_name\}/g, biz.name || '')
        .replace(/\{business_phone\}/g, biz.phone || '')
        .replace(/\{business_email\}/g, biz.email || '')
        .replace(/\{business_address\}/g, biz.address || '')
        .replace(/\{doc_label\}/g, docLabel)
        .replace(/\{doc_number\}/g, docNumber || '')
        .replace(/\{page\}/g, String(page ?? ''))
        .replace(/\{total\}/g, String(total));
    const line1 = fillTokens(footerCfg.footer_line_1);
    const line2 = fillTokens(footerCfg.footer_line_2);
    const ref = fillTokens(footerCfg.footer_reference);
    // Align footer with the body's side margins so left/right padding matches
    const footerLeft = PAGE_SIDE_MM;
    const footerRight = pageW - PAGE_SIDE_MM;
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      // Divider
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.2);
      pdf.line(footerLeft, pageH - FOOTER_HEIGHT_MM + 2, footerRight, pageH - FOOTER_HEIGHT_MM + 2);
      // Footer text
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(60, 60, 60);
      if (line1) pdf.text(line1, footerLeft, pageH - FOOTER_HEIGHT_MM + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(110, 110, 110);
      if (line2) pdf.text(line2, footerLeft, pageH - FOOTER_HEIGHT_MM + 10);
      // Doc reference (right side, top line)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(60, 60, 60);
      if (ref) pdf.text(ref, footerRight, pageH - FOOTER_HEIGHT_MM + 6, { align: 'right' });
      // Page numbers (right side, bottom line)
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(110, 110, 110);
      const pageText = fillTokens(footerCfg.footer_page_format, i);
      if (pageText) pdf.text(pageText, footerRight, pageH - FOOTER_HEIGHT_MM + 10, { align: 'right' });
    }
  };

  const exportPDF = async () => {
    if (!docRef.current || !doc) return;
    toast.loading('Generating PDF...');
    // Force a fixed width for consistent PDF output regardless of screen size
    const originalStyle = docRef.current.style.cssText;
    docRef.current.style.width = '794px'; // A4 width at 96dpi
    docRef.current.style.maxWidth = '794px';
    docRef.current.style.padding = '0';

    // Zero horizontal padding on the inner content wrapper so content
    // (cards, items table) spans the full canvas width — letting the
    // PDF page margins (PAGE_SIDE_MM) be the only side gutter. This makes
    // the items table align edge-to-edge with the footer.
    const innerContent = docRef.current.querySelector<HTMLElement>('[data-pdf-content]');
    const innerOriginalStyle = innerContent?.style.cssText ?? '';
    if (innerContent) {
      innerContent.style.paddingLeft = '0px';
      innerContent.style.paddingRight = '0px';
    }

    const canvas = await html2canvas(docRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794 });

    // Capture nobreak block positions (in canvas px relative to docRef) BEFORE restoring styles
    const containerRect = docRef.current.getBoundingClientRect();
    const cssToCanvas = canvas.width / containerRect.width;
    const nobreakRanges = Array.from(
      docRef.current.querySelectorAll<HTMLElement>('[data-pdf-nobreak]')
    )
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.height === 0) return null; // hidden at this width
        return {
          top: (r.top - containerRect.top) * cssToCanvas,
          bottom: (r.bottom - containerRect.top) * cssToCanvas,
        };
      })
      .filter((r): r is { top: number; bottom: number } => r !== null);

    // Restore original styles
    docRef.current.style.cssText = originalStyle;
    if (innerContent) innerContent.style.cssText = innerOriginalStyle;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const w = pageW - PAGE_SIDE_MM * 2;
    const fullPageH = pdf.internal.pageSize.getHeight();
    // Usable vertical space between top padding and footer
    const pageH = fullPageH - FOOTER_HEIGHT_MM - FOOTER_GAP_MM - PAGE_TOP_MM;
    const imgH = (canvas.height * w) / canvas.width;

    if (imgH <= pageH) {
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', PAGE_SIDE_MM, PAGE_TOP_MM, w, imgH);
    } else {
      // Multi-page: slice vertically into A4-height chunks, avoiding cuts
      // through any [data-pdf-nobreak] block (table rows, totals, headings, etc.)
      const pxPerMm = canvas.width / w;
      const firstPageHeightPx = Math.floor(pageH * pxPerMm);
      const continuationPageHeightPx = Math.floor((pageH - PAGE_CONTINUATION_TOP_MM) * pxPerMm);
      let renderedPx = 0;
      let pageIndex = 0;
      while (renderedPx < canvas.height) {
        const thisPageHeightPx = pageIndex === 0 ? firstPageHeightPx : continuationPageHeightPx;
        let sliceEnd = Math.min(renderedPx + thisPageHeightPx, canvas.height);

        if (sliceEnd < canvas.height) {
          // Find earliest nobreak block whose top is inside this page
          // but whose bottom would be cut. Break the page just above it.
          let earliestBreak: number | null = null;
          for (const range of nobreakRanges) {
            if (
              range.top > renderedPx + 1 &&
              range.top < sliceEnd &&
              range.bottom > sliceEnd
            ) {
              if (earliestBreak === null || range.top < earliestBreak) {
                earliestBreak = range.top;
              }
            }
          }
          if (earliestBreak !== null) {
            sliceEnd = Math.floor(earliestBreak);
          }
        }

        let sliceHeight = sliceEnd - renderedPx;
        // Fallback: if a single block is taller than a full page, do a hard slice
        if (sliceHeight <= 0) {
          sliceHeight = Math.min(thisPageHeightPx, canvas.height - renderedPx);
        }

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) break;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0, renderedPx, canvas.width, sliceHeight,
          0, 0, canvas.width, sliceHeight
        );
        const pageImg = pageCanvas.toDataURL('image/png');
        const sliceHeightMm = sliceHeight / pxPerMm;
        if (pageIndex > 0) pdf.addPage();
        const topMm = PAGE_TOP_MM + (pageIndex === 0 ? 0 : PAGE_CONTINUATION_TOP_MM);
        pdf.addImage(pageImg, 'PNG', PAGE_SIDE_MM, topMm, w, sliceHeightMm);
        renderedPx += sliceHeight;
        pageIndex += 1;
      }
    }
    drawFooter(pdf);
    pdf.save(`${fileNameBase}.pdf`);
    recordDownload(doc.id, { type: 'pdf', filename: `${fileNameBase}.pdf` });
    toast.dismiss();
    toast.success('PDF downloaded');
  };

  const exportJPEG = async () => {
    if (!docRef.current || !doc) return;
    toast.loading('Generating images...');
    const originalStyle = docRef.current.style.cssText;
    docRef.current.style.width = '794px';
    docRef.current.style.maxWidth = '794px';
    docRef.current.style.padding = '0';

    const canvas = await html2canvas(docRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794 });

    // Capture nobreak block positions before restoring styles
    const containerRect = docRef.current.getBoundingClientRect();
    const cssToCanvas = canvas.width / containerRect.width;
    const nobreakRanges = Array.from(
      docRef.current.querySelectorAll<HTMLElement>('[data-pdf-nobreak]')
    )
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.height === 0) return null;
        return {
          top: (r.top - containerRect.top) * cssToCanvas,
          bottom: (r.bottom - containerRect.top) * cssToCanvas,
        };
      })
      .filter((r): r is { top: number; bottom: number } => r !== null);

    docRef.current.style.cssText = originalStyle;

    // Compute A4 page slicing identical to PDF export
    const w = A4_WIDTH_MM - PAGE_SIDE_MM * 2;
    const pageH = A4_HEIGHT_MM - FOOTER_HEIGHT_MM - FOOTER_GAP_MM - PAGE_TOP_MM;
    const pxPerMm = canvas.width / w;
    const a4WidthPx = Math.round(A4_WIDTH_MM * pxPerMm);
    const a4HeightPx = Math.round(A4_HEIGHT_MM * pxPerMm);
    const sidePadPx = Math.round(PAGE_SIDE_MM * pxPerMm);
    const topPadPx = Math.round(PAGE_TOP_MM * pxPerMm);
    const contTopPadPx = Math.round((PAGE_TOP_MM + PAGE_CONTINUATION_TOP_MM) * pxPerMm);
    const firstPageHeightPx = Math.floor(pageH * pxPerMm);
    const continuationPageHeightPx = Math.floor((pageH - PAGE_CONTINUATION_TOP_MM) * pxPerMm);

    const imgH = canvas.height;
    const singlePage = imgH <= firstPageHeightPx;

    const downloadCanvas = (c: HTMLCanvasElement, name: string) => {
      const link = document.createElement('a');
      link.download = name;
      link.href = c.toDataURL('image/jpeg', 0.95);
      link.click();
    };

    if (singlePage) {
      const page = document.createElement('canvas');
      page.width = a4WidthPx;
      page.height = a4HeightPx;
      const ctx = page.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      ctx.drawImage(canvas, sidePadPx, topPadPx, canvas.width, canvas.height);
      const name = `${fileNameBase}.jpeg`;
      downloadCanvas(page, name);
      recordDownload(doc.id, { type: 'jpeg', filename: name });
    } else {
      let renderedPx = 0;
      let pageIndex = 0;
      while (renderedPx < imgH) {
        const thisPageHeightPx = pageIndex === 0 ? firstPageHeightPx : continuationPageHeightPx;
        let sliceEnd = Math.min(renderedPx + thisPageHeightPx, imgH);
        if (sliceEnd < imgH) {
          let earliest: number | null = null;
          for (const r of nobreakRanges) {
            if (r.top > renderedPx + 1 && r.top < sliceEnd && r.bottom > sliceEnd) {
              if (earliest === null || r.top < earliest) earliest = r.top;
            }
          }
          if (earliest !== null) sliceEnd = Math.floor(earliest);
        }
        let sliceHeight = sliceEnd - renderedPx;
        if (sliceHeight <= 0) sliceHeight = Math.min(thisPageHeightPx, imgH - renderedPx);

        const page = document.createElement('canvas');
        page.width = a4WidthPx;
        page.height = a4HeightPx;
        const ctx = page.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, page.width, page.height);
        const destTop = pageIndex === 0 ? topPadPx : contTopPadPx;
        ctx.drawImage(
          canvas,
          0, renderedPx, canvas.width, sliceHeight,
          sidePadPx, destTop, canvas.width, sliceHeight
        );
        const name = `${fileNameBase}-page-${pageIndex + 1}.jpeg`;
        downloadCanvas(page, name);
        recordDownload(doc.id, { type: 'jpeg', filename: name });
        renderedPx += sliceHeight;
        pageIndex += 1;
        if (pageIndex > 50) break;
      }
    }
    toast.dismiss();
    toast.success('Image(s) downloaded');
  };

  // Auto-trigger re-download when arriving with ?download=pdf|jpeg
  useEffect(() => {
    if (!doc) return;
    const want = searchParams.get('download');
    if (!want) return;
    const t = setTimeout(async () => {
      if (want === 'pdf') await exportPDF();
      else if (want === 'jpeg') await exportJPEG();
      setSearchParams({}, { replace: true });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  if (!doc) return <div className="p-8 text-center">Document not found</div>;

  return (
    <div className="min-h-screen bg-muted">
      {/* Header - responsive */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between py-3 sm:py-4 px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base sm:text-lg font-heading font-bold">Preview</h1>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <Button
              variant={showBreaks ? 'secondary' : 'outline'}
              onClick={() => setShowBreaks((v) => !v)}
              size="sm"
              className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
              title="Toggle page break preview"
            >
              <Scissors className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Breaks</span>
            </Button>
            <Button onClick={exportPDF} size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> PDF
            </Button>
            <Button variant="outline" onClick={exportJPEG} size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <Image className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> JPEG
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto px-1 xs:px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-10 flex justify-center max-w-screen-xl">
        <div ref={docRef} className="relative bg-card w-full max-w-[210mm] shadow-lg sm:shadow-xl lg:shadow-2xl rounded-md sm:rounded-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {showBreaks && pageBreaks.map((y, i) => (
            <div
              key={i}
              className="pointer-events-none absolute left-0 right-0 z-20"
              style={{ top: `${y}px` }}
            >
              <div className="border-t-2 border-dashed border-accent/70" />
              <div className="absolute -top-3 right-2 bg-accent text-accent-foreground text-[10px] font-semibold px-2 py-0.5 rounded shadow">
                Page {i + 2} ↓
              </div>
            </div>
          ))}
          {/* Document Content - fully responsive padding */}
          <div data-pdf-content className="p-6 xs:p-7 sm:p-10 md:p-12 lg:p-14">
            {/* Header — Title left, logo right (if present) */}
            <div data-pdf-nobreak className="flex justify-between items-start gap-6 mb-5 sm:mb-7">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl xs:text-3xl sm:text-4xl md:text-[2.5rem] font-normal tracking-tight font-heading text-accent leading-tight break-words">
                  {doc.title}
                </h2>
                <div className="mt-4 sm:mt-5 grid grid-cols-[auto_1fr] gap-x-4 sm:gap-x-6 gap-y-1.5 text-xs sm:text-sm">
                  <span className="text-muted-foreground">{docLabel} No</span>
                  <span className="font-semibold text-foreground">{docNumber}</span>
                  <span className="text-muted-foreground">{docLabel} Date</span>
                  <span className="font-semibold text-foreground">{format(new Date(doc.issueDate || doc.createdAt), 'MMM d, yyyy')}</span>
                  {doc.type === 'invoice' && doc.dueDate && (
                    <>
                      <span className="text-muted-foreground">Due Date</span>
                      <span className="font-semibold text-foreground">{format(new Date(doc.dueDate), 'MMM d, yyyy')}</span>
                    </>
                  )}
                  {doc.type === 'quote' && doc.dueDate && (
                    <>
                      <span className="text-muted-foreground">Valid Till Date</span>
                      <span className="font-semibold text-foreground">{format(new Date(doc.dueDate), 'MMM d, yyyy')}</span>
                    </>
                  )}
                </div>
              </div>
              {doc.businessInfo.logo && (
                <div className="flex-shrink-0">
                  <img src={doc.businessInfo.logo} alt="Logo" className="h-12 sm:h-16 w-auto object-contain" />
                </div>
              )}
            </div>

            {/* From / For cards */}
            <div data-pdf-nobreak className="grid grid-cols-2 sm:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
              <div className="rounded-lg p-4 sm:p-5 bg-gold-light">
                <p className="text-base sm:text-lg font-heading text-accent mb-2">{docLabel} From</p>
                <p className="font-bold text-sm sm:text-[15px]">{doc.businessInfo.name}</p>
                <div className="text-xs sm:text-sm mt-1 space-y-0.5 text-muted-foreground">
                  {doc.businessInfo.address && <p>{doc.businessInfo.address}</p>}
                  {doc.businessInfo.phone && <p>{doc.businessInfo.phone}</p>}
                  {doc.businessInfo.email && <p>{doc.businessInfo.email}</p>}
                </div>
              </div>
              <div className="rounded-lg p-4 sm:p-5 bg-gold-light">
                <p className="text-base sm:text-lg font-heading text-accent mb-2">{docLabel} For</p>
                <p className="font-bold text-sm sm:text-[15px]">{doc.clientInfo.name}</p>
                <div className="text-xs sm:text-sm mt-1 space-y-0.5 text-muted-foreground">
                  {doc.clientInfo.address && <p>{doc.clientInfo.address}</p>}
                  {doc.clientInfo.phone && <p>{doc.clientInfo.phone}</p>}
                  {doc.clientInfo.email && <p>{doc.clientInfo.email}</p>}
                </div>
              </div>
            </div>

            {/* Items table */}
            <div className="mb-6 sm:mb-8 rounded-lg overflow-hidden border border-border">
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr data-pdf-nobreak className="bg-accent text-accent-foreground">
                    <th className="text-left px-3 py-3 text-xs sm:text-sm font-semibold w-8">#</th>
                    <th className="text-left px-3 py-3 text-xs sm:text-sm font-semibold">Item</th>
                    <th className="text-center px-2 py-3 text-xs sm:text-sm font-semibold w-16">Qty</th>
                    <th className="text-right px-3 py-3 text-xs sm:text-sm font-semibold w-24">Rate</th>
                    <th className="text-right px-3 py-3 text-xs sm:text-sm font-semibold w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((item, idx) => (
                    <tr
                      key={item.id}
                      data-pdf-nobreak
                      className={idx % 2 === 0 ? 'bg-card' : 'bg-gold-light/40'}
                    >
                      <td className="px-3 py-3 text-xs sm:text-sm text-muted-foreground align-top">{idx + 1}.</td>
                      <td className="px-3 py-3 text-xs sm:text-sm align-top">{item.description}</td>
                      <td className="px-2 py-3 text-xs sm:text-sm text-center align-top">{item.quantity}</td>
                      <td className="px-3 py-3 text-xs sm:text-sm text-right align-top">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-3 py-3 text-xs sm:text-sm text-right font-medium align-top">{formatCurrency(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div data-pdf-nobreak className="flex justify-end mb-6 sm:mb-8">
              <div className="w-full sm:w-80 space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {doc.taxRate > 0 && (
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">Tax ({doc.taxRate}%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-border">
                  <span className="font-heading text-base sm:text-lg">Total</span>
                  <span className="font-bold text-base sm:text-lg">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Terms */}
            {doc.termsAndConditions && (
              <div data-pdf-nobreak className="mb-4">
                <h3 className="text-sm sm:text-base font-heading text-accent mb-2">Terms and Conditions</h3>
                <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{doc.termsAndConditions}</p>
              </div>
            )}

            {/* Receipt Thank You */}
            {doc.type === 'receipt' && (
              <div data-pdf-nobreak className="text-center py-4 sm:py-6 rounded-lg bg-success/10">
                <p className="font-semibold text-base sm:text-lg text-success font-heading">
                  Thank you for your business.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

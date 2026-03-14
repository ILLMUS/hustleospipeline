import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDocuments } from '@/context/DocumentContext';
import { calculateSubtotal, calculateTax } from '@/types/document';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Image } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

function formatCurrency(n: number) {
  return `E${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DocumentPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents } = useDocuments();
  const docRef = useRef<HTMLDivElement>(null);

  const doc = documents.find(d => d.id === id);
  if (!doc) return <div className="p-8 text-center">Document not found</div>;

  const subtotal = calculateSubtotal(doc.items);
  const tax = calculateTax(subtotal, doc.taxRate);
  const grandTotal = subtotal + tax;

  const docNumber = doc.type === 'receipt' ? doc.receiptNumber : doc.type === 'invoice' ? doc.invoiceNumber : doc.quoteNumber;
  const docLabel = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);

  const exportPDF = async () => {
    if (!docRef.current) return;
    toast.loading('Generating PDF...');
    // Force a fixed width for consistent PDF output regardless of screen size
    const originalStyle = docRef.current.style.cssText;
    docRef.current.style.width = '794px'; // A4 width at 96dpi
    docRef.current.style.maxWidth = '794px';
    docRef.current.style.padding = '0';

    const canvas = await html2canvas(docRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794 });
    
    // Restore original styles
    docRef.current.style.cssText = originalStyle;

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    pdf.save(`${docLabel}-${docNumber}.pdf`);
    toast.dismiss();
    toast.success('PDF downloaded');
  };

  const exportJPEG = async () => {
    if (!docRef.current) return;
    toast.loading('Generating image...');
    const originalStyle = docRef.current.style.cssText;
    docRef.current.style.width = '794px';
    docRef.current.style.maxWidth = '794px';
    docRef.current.style.padding = '0';

    const canvas = await html2canvas(docRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794 });
    
    docRef.current.style.cssText = originalStyle;

    const link = document.createElement('a');
    link.download = `${docLabel}-${docNumber}.jpeg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    toast.dismiss();
    toast.success('Image downloaded');
  };

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
        <div ref={docRef} className="bg-card w-full max-w-[210mm] shadow-lg sm:shadow-xl lg:shadow-2xl rounded-md sm:rounded-lg overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {/* Document Content - fully responsive padding */}
          <div className="p-3 xs:p-4 sm:p-8 md:p-10 lg:p-14">
            {/* Header */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-start gap-3 sm:gap-6 mb-5 sm:mb-8 lg:mb-10">
              <div className="w-full sm:w-auto">
                <h2 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-[2rem] font-bold tracking-tight font-heading text-foreground">
                  {doc.title}
                </h2>
                <div className="mt-1.5 sm:mt-3 space-y-0.5 sm:space-y-1 text-[11px] xs:text-xs sm:text-sm text-muted-foreground">
                  <p>{docLabel} #: <span className="font-semibold text-foreground">{docNumber}</span></p>
                  <p>Issue Date: {format(new Date(doc.issueDate || doc.createdAt), 'dd MMM yyyy')}</p>
                  {doc.type === 'invoice' && doc.dueDate && <p>Due Date: {format(new Date(doc.dueDate), 'dd MMM yyyy')}</p>}
                </div>
              </div>
              {doc.businessInfo.logo && (
                <div className="flex-shrink-0">
                  <img src={doc.businessInfo.logo} alt="Logo" className="h-8 xs:h-10 sm:h-14 md:h-16 w-auto object-contain" />
                </div>
              )}
            </div>

            {/* Billing Section - stacks on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 rounded-md sm:rounded-lg p-3 xs:p-4 sm:p-6 mb-5 sm:mb-8 bg-gold-light">
              <div>
                <p className="text-[9px] xs:text-[10px] sm:text-xs uppercase tracking-widest font-semibold mb-1 sm:mb-2 text-accent">Billed To</p>
                <p className="font-semibold text-xs xs:text-sm sm:text-base">{doc.clientInfo.name}</p>
                <div className="text-[11px] xs:text-xs sm:text-sm mt-1 space-y-0.5 text-muted-foreground">
                  <p>{doc.clientInfo.address}</p>
                  <p>{doc.clientInfo.phone}</p>
                  <p>{doc.clientInfo.email}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] xs:text-[10px] sm:text-xs uppercase tracking-widest font-semibold mb-1 sm:mb-2 text-accent">Billed By</p>
                <p className="font-semibold text-xs xs:text-sm sm:text-base">{doc.businessInfo.name}</p>
                <div className="text-[11px] xs:text-xs sm:text-sm mt-1 space-y-0.5 text-muted-foreground">
                  <p>{doc.businessInfo.address}</p>
                  <p>{doc.businessInfo.phone}</p>
                  <p>{doc.businessInfo.email}</p>
                </div>
              </div>
            </div>

            {/* Items - card layout on mobile, table on desktop */}
            <div className="mb-5 sm:mb-8">
              {/* Desktop table */}
              <table className="w-full hidden sm:table" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="border-b-2 border-foreground">
                    <th className="text-left py-2.5 sm:py-3 text-[10px] sm:text-xs uppercase tracking-widest font-semibold">Description</th>
                    <th className="text-center py-2.5 sm:py-3 text-[10px] sm:text-xs uppercase tracking-widest font-semibold w-14 md:w-20">Qty</th>
                    <th className="text-right py-2.5 sm:py-3 text-[10px] sm:text-xs uppercase tracking-widest font-semibold w-20 md:w-28">Unit Price</th>
                    <th className="text-right py-2.5 sm:py-3 text-[10px] sm:text-xs uppercase tracking-widest font-semibold w-20 md:w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((item) => (
                    <tr key={item.id} className="border-b border-border">
                      <td className="py-2.5 sm:py-3 text-xs sm:text-sm">{item.description}</td>
                      <td className="py-2.5 sm:py-3 text-xs sm:text-sm text-center">{item.quantity}</td>
                      <td className="py-2.5 sm:py-3 text-xs sm:text-sm text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-2.5 sm:py-3 text-xs sm:text-sm text-right font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile card layout */}
              <div className="sm:hidden space-y-2">
                <div className="pb-1.5 border-b-2 border-foreground">
                  <p className="text-[9px] xs:text-[10px] uppercase tracking-widest font-semibold">Items</p>
                </div>
                {doc.items.map((item) => (
                  <div key={item.id} className="rounded-md p-2.5 xs:p-3 bg-background border-b border-border">
                    <p className="text-xs xs:text-sm font-medium mb-1">{item.description}</p>
                    <div className="flex justify-between text-[11px] xs:text-xs text-muted-foreground">
                      <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                      <span className="font-semibold text-foreground">{formatCurrency(item.quantity * item.unitPrice)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-5 sm:mb-8">
              <div className="w-full sm:w-64 space-y-1 sm:space-y-2">
                <div className="flex justify-between text-[11px] xs:text-xs sm:text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {doc.taxRate > 0 && (
                  <div className="flex justify-between text-[11px] xs:text-xs sm:text-sm">
                    <span className="text-muted-foreground">Tax ({doc.taxRate}%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm xs:text-base sm:text-lg pt-2 border-t-2 border-foreground font-heading">
                  <span>Grand Total</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Terms */}
            {doc.termsAndConditions && (
              <div className="mb-5 sm:mb-8">
                <h3 className="text-[9px] xs:text-[10px] sm:text-xs uppercase tracking-widest font-semibold mb-1 sm:mb-2 text-accent">Terms and Conditions</h3>
                <p className="text-[11px] xs:text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{doc.termsAndConditions}</p>
              </div>
            )}

            {/* Receipt Thank You */}
            {doc.type === 'receipt' && (
              <div className="text-center py-3 sm:py-6 rounded-md sm:rounded-lg bg-success/10">
                <p className="font-semibold text-sm xs:text-base sm:text-lg text-success font-heading">
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

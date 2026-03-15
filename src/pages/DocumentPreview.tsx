import { useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDocuments } from "@/context/DocumentContext";
import { calculateSubtotal, calculateTax } from "@/types/document";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Image } from "lucide-react";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

function formatCurrency(n: number) {
  return `E${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function DocumentPreview() {

  const { id } = useParams();
  const navigate = useNavigate();
  const { documents } = useDocuments();

  const docRef = useRef<HTMLDivElement>(null);

  const doc = documents.find((d) => d.id === id);

  if (!doc) {
    return <div className="p-8 text-center">Document not found</div>;
  }

  const subtotal = calculateSubtotal(doc.items);
  const tax = calculateTax(subtotal, doc.taxRate);
  const grandTotal = subtotal + tax;

  const autoNumber = `DOC-${doc.createdAt?.slice(0,10).replace(/-/g,"")}-${doc.id?.slice(0,4)}`;

  const docNumber =
    doc.type === "receipt"
      ? doc.receiptNumber || autoNumber
      : doc.type === "invoice"
      ? doc.invoiceNumber || autoNumber
      : doc.quoteNumber || autoNumber;

  const docLabel = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);

  const footerMessage =
    doc.type === "quote"
      ? "This quotation is valid for 14 days from the issue date."
      : doc.type === "invoice"
      ? "Payment is due according to the terms stated above."
      : "Thank you for your payment. We appreciate your business.";

  const paymentURL = `https://pay.yourcompany.com/invoice/${docNumber}`;

  const qrCode =
    `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(paymentURL)}`;

  /* PDF EXPORT */

  const exportPDF = async () => {

    if (!docRef.current) return;

    toast.loading("Generating PDF...");

    const canvas = await html2canvas(docRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 794,
      windowWidth: 794,
      scrollX: 0,
      scrollY: -window.scrollY
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.85);

    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = (canvas.height * pageWidth) / canvas.width;

    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);

    pdf.save(`${docLabel}-${docNumber}.pdf`);

    toast.dismiss();
    toast.success("PDF downloaded");
  };

  /* JPEG EXPORT */

  const exportJPEG = async () => {

    if (!docRef.current) return;

    toast.loading("Generating image...");

    const canvas = await html2canvas(docRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 794
    });

    const link = document.createElement("a");

    link.download = `${docLabel}-${docNumber}.jpeg`;
    link.href = canvas.toDataURL("image/jpeg", 0.95);

    link.click();

    toast.dismiss();
    toast.success("Image downloaded");
  };

  return (

    <div className="min-h-screen bg-muted">

      {/* NAVBAR */}

      <header className="border-b bg-card sticky top-0 z-10">

        <div className="container mx-auto flex items-center justify-between py-4 px-4">

          <div className="flex items-center gap-4">

            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="text-lg font-bold">Preview</h1>

          </div>

          <div className="flex gap-2">

            <Button onClick={exportPDF} className="gap-2">
              <Download className="h-4 w-4" />
              PDF
            </Button>

            <Button variant="outline" onClick={exportJPEG} className="gap-2">
              <Image className="h-4 w-4" />
              JPEG
            </Button>

          </div>

        </div>

      </header>

      {/* PREVIEW AREA */}

      <main className="w-full overflow-x-auto flex justify-center py-10">

        {/* DOCUMENT CANVAS */}

        <div
          ref={docRef}
          className="bg-white shadow-xl relative flex flex-col"
          style={{
            width: "794px",
            minHeight: "1123px",
            fontFamily: "'DM Sans', sans-serif"
          }}
        >

          {/* WATERMARK */}

          {doc.type === "quote" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
              <h1 className="text-[120px] font-black rotate-[-25deg]">
                QUOTE
              </h1>
            </div>
          )}

          {/* PAID STAMP */}

          {doc.type === "receipt" && (
            <div className="absolute top-24 right-16 rotate-[-20deg] border-4 border-green-600 text-green-600 px-6 py-2 text-2xl font-bold opacity-70">
              PAID
            </div>
          )}

          {/* CONTENT */}

          <div className="flex-1 p-12 pb-6">

            {/* HEADER */}

            <div className="flex justify-between items-start mb-12 border-b pb-6">

              <div>

                <h2 className="text-3xl font-bold tracking-tight">
                  {doc.title}
                </h2>

                <div className="mt-3 space-y-1 text-sm text-muted-foreground">

                  <p>
                    {docLabel} #:
                    <span className="font-semibold text-foreground ml-1">
                      {docNumber}
                    </span>
                  </p>

                  <p>
                    Issue Date:
                    {" "}
                    {format(new Date(doc.issueDate || doc.createdAt),"dd MMM yyyy")}
                  </p>

                </div>

              </div>

              {doc.businessInfo.logo && (
                <img
                  src={doc.businessInfo.logo}
                  alt="Logo"
                  className="h-14 object-contain"
                />
              )}

            </div>

            {/* BILLING */}

            <div className="grid grid-cols-1 gap-10 p-6 mb-10 bg-muted rounded-lg">

              <div>

                <p className="text-xs uppercase tracking-widest font-semibold mb-2">
                  Billed To
                </p>

                <p className="font-semibold">{doc.clientInfo.name}</p>

                <div className="text-sm text-muted-foreground">

                  <p>{doc.clientInfo.address}</p>
                  <p>{doc.clientInfo.phone}</p>
                  <p>{doc.clientInfo.email}</p>

                </div>

              </div>

              <div>

                <p className="text-xs uppercase tracking-widest font-semibold mb-2">
                  Billed By
                </p>

                <p className="font-semibold">{doc.businessInfo.name}</p>

                <div className="text-sm text-muted-foreground">

                  <p>{doc.businessInfo.address}</p>
                  <p>{doc.businessInfo.phone}</p>
                  <p>{doc.businessInfo.email}</p>

                </div>

              </div>

            </div>

            {/* ITEMS */}

            <table className="w-full mb-8 border-collapse">

              <thead>

                <tr className="border-b-2 border-foreground">

                  <th className="text-left py-3 text-xs uppercase tracking-widest">
                    Description
                  </th>

                  <th className="text-center py-3 text-xs uppercase w-20">
                    Qty
                  </th>

                  <th className="text-right py-3 text-xs uppercase w-28">
                    Unit
                  </th>

                  <th className="text-right py-3 text-xs uppercase w-28">
                    Total
                  </th>

                </tr>

              </thead>

              <tbody>

                {doc.items.map((item) => (

                  <tr
                    key={item.id}
                    className="border-b"
                    style={{ pageBreakInside: "avoid" }}
                  >

                    <td className="py-3 text-sm">
                      {item.description}
                    </td>

                    <td className="py-3 text-sm text-center">
                      {item.quantity}
                    </td>

                    <td className="py-3 text-sm text-right">
                      {formatCurrency(item.unitPrice)}
                    </td>

                    <td className="py-3 text-sm text-right font-medium">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            {/* TOTALS */}

            <div className="flex justify-end mb-10">

              <div className="w-64 space-y-2">

                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>

                {doc.taxRate > 0 && (

                  <div className="flex justify-between text-sm">

                    <span>Tax ({doc.taxRate}%)</span>

                    <span>{formatCurrency(tax)}</span>

                  </div>

                )}

                <div className="flex justify-between font-bold text-lg border-t pt-2">

                  <span>Grand Total</span>

                  <span>{formatCurrency(grandTotal)}</span>

                </div>

              </div>

            </div>

            {/* QR PAYMENT */}

            {doc.type === "invoice" && (

              <div className="flex items-center gap-6 mb-10">

                <img src={qrCode} alt="QR Payment" className="w-28 h-28"/>

                <div>

                  <p className="text-sm font-semibold">
                    Scan to Pay
                  </p>

                  <p className="text-xs text-muted-foreground break-all">
                    {paymentURL}
                  </p>

                </div>

              </div>

            )}

          </div>

          {/* FOOTER (STICKY BOTTOM) */}

          <div className="border-t text-center p-6">

            <p className="text-sm text-muted-foreground">
              {footerMessage}
            </p>

            <p className="text-[10px] text-muted-foreground opacity-70">
              Generated digitally • No signature required
            </p>

            <p className="text-[10px] text-muted-foreground opacity-70">
              {doc.businessInfo.name} • {doc.businessInfo.email}
            </p>

          </div>

        </div>

      </main>

    </div>
  );
}
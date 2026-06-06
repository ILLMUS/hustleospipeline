import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  try {
    const body = await req.json();

    const response = await fetch(
      "https://agfrlpezlldodhvprxsw.supabase.co/functions/v1/quote-builder-api?job_id=" +
        encodeURIComponent(body.id),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Deno.env.get("RST_SOP_API_KEY")!,
        },
        body: JSON.stringify({
          type: body.type,
          quote_ref: body.quoteNumber,
          quote_amount: body.total,
          tax_amount: body.tax,
          title: body.title,
          client: body.clientInfo,
          business: body.businessInfo,
          items: body.items,
          terms: body.termsAndConditions,
          created_at: body.createdAt,
        }),
      }
    );

    const result = await response.text();

    return new Response(result, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: String(err),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});
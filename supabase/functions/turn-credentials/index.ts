import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID");
    const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET");

    if (!accountSid || !apiKeySid || !apiKeySecret) {
      // Fallback to free STUN servers if Twilio not configured
      return new Response(
        JSON.stringify({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request TURN credentials from Twilio
    const credentials = btoa(`${apiKeySid}:${apiKeySecret}`);
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "Ttl=86400",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TURN] Twilio error:", response.status, errorText);
      throw new Error(`Twilio API error: ${response.status}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        iceServers: data.ice_servers,
        ttl: data.ttl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[TURN] Error:", error);
    // Fallback
    return new Response(
      JSON.stringify({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

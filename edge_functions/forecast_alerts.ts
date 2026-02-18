import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";
import nodemailer from "npm:nodemailer@6.9.13";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Credenciais do Gmail
const GMAIL_USER = Deno.env.get("GMAIL_USER"); 
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD"); 

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not configured.");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Calculate target date (today + 15 days)
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 15);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    console.log(`Fetching projects with previous_start_date == ${targetDateStr}`);

    // Query now includes forecast_contract_steps to get teams
    const { data: projects, error } = await supabase
      .from("forecast_data")
      .select(`
        cliente, 
        job_site, 
        previous_start_date, 
        status, 
        address,
        type,
        lote_bld,
        forecast_contract_steps (
          team
        )
      `)
      .eq("previous_start_date", targetDateStr)
      .order("cliente", { ascending: true });

    if (error) throw new Error(`Error fetching data: ${error.message}`);

    if (!projects || projects.length === 0) {
      return new Response(JSON.stringify({ message: "No projects starting in 15 days.", count: 0 }), { headers: corsHeaders, status: 200 });
    }

    const activeProjects = projects.filter(p => {
      const s = (p.status || '').toLowerCase();
      return s !== 'closed' && s !== 'completed';
    });

    if (activeProjects.length === 0) {
      return new Response(JSON.stringify({ message: "No active projects starting in 15 days.", count: 0 }), { headers: corsHeaders, status: 200 });
    }

    // Helper to format date as "MM/DD/YYYY" (e.g., "10/15/2023")
    const formatDateUS = (dateStr: string) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      // Using UTC methods to prevent timezone shifts
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      const year = date.getUTCFullYear();
      return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
    };

    const cardsHtml = activeProjects.map(p => {
      // Extract unique teams
      const teams = p.forecast_contract_steps
        ? [...new Set(p.forecast_contract_steps.map((step: any) => step.team).filter((t: any) => t && t.trim() !== ''))]
        : [];
      const workforce = teams.length > 0 ? teams.join(', ') : 'Not Assigned';

      return `
        <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="background-color: #f8f9fa; padding: 12px 16px; border-bottom: 1px solid #e0e0e0;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="left" style="font-weight: bold; color: #555; font-size: 14px;">${formatDateUS(p.previous_start_date)}</td>
                <td align="right" style="font-size: 12px; color: #888; text-transform: uppercase; font-weight: 600;">${p.status || 'Unknown Status'}</td>
              </tr>
            </table>
          </div>
          <div style="padding: 16px;">
            <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">${p.job_site || 'No Job Site'}</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
              <div>
                <span style="display: block; font-size: 11px; color: #888; text-transform: uppercase;">Client</span>
                <span style="font-size: 14px; color: #333;">${p.cliente || '-'}</span>
              </div>
              <div>
                <span style="display: block; font-size: 11px; color: #888; text-transform: uppercase;">Type</span>
                <span style="font-size: 14px; color: #333;">${p.type || '-'}</span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
              <div>
                <span style="display: block; font-size: 11px; color: #888; text-transform: uppercase;">Lot Number</span>
                <span style="font-size: 14px; color: #333;">${p.lote_bld || '-'}</span>
              </div>
              <div>
                <span style="display: block; font-size: 11px; color: #888; text-transform: uppercase;">Workforce</span>
                <span style="font-size: 14px; color: #333; font-weight: 500;">${workforce}</span>
              </div>
            </div>

             <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee;">
                <span style="display: block; font-size: 11px; color: #888; text-transform: uppercase;">Address</span>
                <span style="font-size: 13px; color: #555;">${p.address || '-'}</span>
             </div>
          </div>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h2 style="text-align: center; color: #333; margin-bottom: 24px;">Project Alerts: Starting in 15 Days</h2>
          <p style="text-align: center; color: #666; margin-bottom: 30px;">
            The following projects are scheduled to start on <strong>${formatDateUS(targetDateStr)}</strong>.
          </p>
          
          ${cardsHtml}
          
          <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
            <p>Automated alert sent via Gmail System.</p>
          </div>
        </div>
      </div>
    `;

    // Resolver DNS manualmente para evitar erro de dns.lookup do Node
    const ips = await Deno.resolveDns("smtp.gmail.com", "A");
    const ip = ips[0]; // Usar o primeiro IP retornado

    console.log(`Resolved smtp.gmail.com to ${ip}`);

    const transporter = nodemailer.createTransport({
      host: ip, // Usar IP em vez de hostname
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
      tls: {
        servername: 'smtp.gmail.com' // Necessário para validação do certificado SSL
      }
    });

    const info = await transporter.sendMail({
      from: `"Forecast Alerts" <${GMAIL_USER}>`,
      to: "natalia@premiumgrpinc.com",
      subject: `[Alert] ${activeProjects.length} Projects Starting in 15 Days`,
      html: htmlContent,
    });

    console.log("Email sent: ", info.messageId);

    return new Response(JSON.stringify({
      success: true,
      message: `Email sent via Gmail with ${activeProjects.length} projects.`,
      projects_count: activeProjects.length,
      messageId: info.messageId
    }), { headers: corsHeaders, status: 200 });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { headers: corsHeaders, status: 500 });
  }
});

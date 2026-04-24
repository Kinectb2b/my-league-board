import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invitation_id } = await req.json();
    if (!invitation_id) {
      return Response.json(
        { success: false, error: "invitation_id is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("INVITATION_FROM_EMAIL") ||
      "invites@myleagueboard.com";
    const siteUrl =
      Deno.env.get("SITE_URL") || "https://www.myleagueboard.com";

    if (!resendApiKey) {
      return Response.json(
        { success: false, error: "RESEND_API_KEY not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch invitation with org name, inviter name, and board position
    const { data: invitation, error: fetchErr } = await supabase
      .from("invitations")
      .select(
        "*, organizations(name), inviter:invited_by(full_name), board_positions(title)"
      )
      .eq("id", invitation_id)
      .single();

    if (fetchErr || !invitation) {
      return Response.json(
        { success: false, error: fetchErr?.message || "Invitation not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Fetch team name separately when invitation is team-scoped
    // (scope_id has no FK to teams, so we can't use a Supabase join)
    let teamName: string | null = null;
    if (invitation.scope_type === "team" && invitation.scope_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", invitation.scope_id)
        .single();
      teamName = team?.name || null;
    }

    const orgName = invitation.organizations?.name || "your league";
    const inviterName = invitation.inviter?.full_name || "A league admin";
    const recipientName = invitation.full_name || "there";
    const boardPosition = invitation.board_positions?.title || null;
    const welcomeMessage = invitation.welcome_message || null;
    const inviteUrl = `${siteUrl}/accept-invite?token=${invitation.token}`;
    const isTeamInvite = !!teamName;

    // Build HTML email — team-scoped invitations get team-specific messaging
    const positionLine = isTeamInvite
      ? ""
      : boardPosition
        ? ` as <strong>${boardPosition}</strong>`
        : "";
    const messagBlock = welcomeMessage
      ? `<div style="margin:20px 0;padding:16px;background:#f9fafb;border-left:3px solid #16a34a;border-radius:4px;">
           <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Message from ${inviterName}:</p>
           <p style="margin:0;font-style:italic;color:#374151;">"${welcomeMessage}"</p>
         </div>`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#16a34a;padding:24px 32px;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:600;">My League Board</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${recipientName},</p>
      <p style="margin:0 0 16px;font-size:16px;color:#111827;">
        ${isTeamInvite
          ? `${inviterName} has invited you to assistant coach <strong>${teamName}</strong> for ${orgName} on My League Board.`
          : `${inviterName} has invited you to join <strong>${orgName}</strong> on My League Board${positionLine}.`
        }
      </p>
      ${messagBlock}
      <div style="margin:28px 0;text-align:center;">
        <a href="${inviteUrl}" style="display:inline-block;background:#16a34a;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">
          Accept invitation
        </a>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
        This invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">My League Board &mdash; Youth sports league management</p>
    </div>
  </div>
</body>
</html>`;

    const text = `Hi ${recipientName},

${isTeamInvite
  ? `${inviterName} has invited you to assistant coach ${teamName} for ${orgName} on My League Board.`
  : `${inviterName} has invited you to join ${orgName} on My League Board${boardPosition ? ` as ${boardPosition}` : ""}.`
}
${welcomeMessage ? `\nMessage from ${inviterName}:\n"${welcomeMessage}"\n` : ""}
Accept your invitation: ${inviteUrl}

This invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.

— The My League Board team`;

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [invitation.email],
        subject: isTeamInvite
          ? `${inviterName} invited you to assistant coach ${teamName}`
          : `You're invited to join ${orgName} on My League Board`,
        html,
        text,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return Response.json(
        { success: false, error: resendData.message || "Resend API error" },
        { status: 502, headers: corsHeaders }
      );
    }

    // Mark email as sent
    await supabase
      .from("invitations")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", invitation_id);

    return Response.json(
      { success: true, email_id: resendData.id },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { success: false, error: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
});

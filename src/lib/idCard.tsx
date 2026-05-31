import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
const logoLight = "/admeasy-logo-dark.png";

export interface IDCardSubject {
  kind: "student" | "teacher";
  id: string; // db UUID
  display_id?: string | null; // student_id / teacher_id
  name: string;
  photo_url?: string | null;
  class?: string | null;
  section?: string | null;
  subject?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  dob?: string | null;
  blood_group?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  valid_till?: string | null;
  school_name?: string | null;
}

const CARD_W = 638; // 86mm @ ~188dpi (downscaled for performance, rendered at 2x)
const CARD_H = 1012; // 54mm portrait orientation

function IDCardFront({ s }: { s: IDCardSubject }) {
  const initials = (s.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const qrPayload = JSON.stringify({
    kind: s.kind,
    id: s.display_id || s.id,
    name: s.name,
  });
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        background: "linear-gradient(155deg,#FFFFFF 0%,#F4F1FE 65%,#EDE6FF 100%)",
        color: "#0A0A0F",
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
        borderRadius: 32,
        border: "1px solid #E5E1F5",
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "radial-gradient(circle,#A78BFA55,transparent 70%)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={logoLight} alt="" style={{ height: 32, width: "auto" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
            {s.school_name || "Admeasy School"}
          </div>
          <div style={{ fontSize: 11, color: "#6B6B7B", textTransform: "uppercase", letterSpacing: 2 }}>
            {s.kind === "student" ? "Student Identity" : "Staff Identity"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 30,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 24,
            background: "linear-gradient(135deg,#7C3AED,#A78BFA)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 64,
            fontWeight: 600,
            boxShadow: "0 12px 30px rgba(124,58,237,0.35)",
            overflow: "hidden",
          }}
        >
          {s.photo_url ? (
            <img src={s.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initials
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{s.name}</div>
          <div style={{ fontSize: 12, color: "#6B6B7B", marginTop: 2, letterSpacing: 1 }}>
            {s.kind === "student"
              ? `Class ${s.class || "—"}${s.section ? " · " + s.section : ""}`
              : s.subject || "Faculty"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          background: "#FFFFFFAA",
          border: "1px solid #E5E1F5",
          borderRadius: 16,
          padding: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          rowGap: 10,
          columnGap: 12,
          fontSize: 12,
        }}
      >
        <Field label="ID" value={s.display_id || "—"} />
        <Field label="DOB" value={s.dob || "—"} />
        {s.kind === "student" ? (
          <>
            <Field label="Parent" value={s.parent_name || "—"} />
            <Field label="Phone" value={s.parent_phone || "—"} />
          </>
        ) : (
          <>
            <Field label="Email" value={s.email || "—"} />
            <Field label="Phone" value={s.phone || "—"} />
          </>
        )}
        <Field label="Blood" value={s.blood_group || "—"} />
        <Field label="Valid till" value={s.valid_till || nextMarch()} />
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#6B6B7B", textTransform: "uppercase", letterSpacing: 2 }}>
            Signature
          </div>
          <div
            style={{
              marginTop: 22,
              borderTop: "1px solid #0A0A0F",
              width: 140,
              fontSize: 10,
              color: "#6B6B7B",
              paddingTop: 4,
            }}
          >
            Principal
          </div>
        </div>
        <div style={{ background: "#fff", padding: 6, borderRadius: 10, border: "1px solid #E5E1F5" }}>
          <QRCodeSVG value={qrPayload} size={96} fgColor="#0A0A0F" />
        </div>
      </div>
    </div>
  );
}

function IDCardBack({ s }: { s: IDCardSubject }) {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        background: "linear-gradient(155deg,#0A0A0F 0%,#1A1530 100%)",
        color: "#fff",
        fontFamily: "Inter, system-ui, sans-serif",
        borderRadius: 32,
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 14, color: "#A78BFA", letterSpacing: 4, textTransform: "uppercase" }}>
        If found, please return
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
        {s.school_name || "Admeasy School"}
      </div>
      <div style={{ height: 1, background: "#ffffff22" }} />
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "#D6D2EF" }}>
        {s.address ||
          "School address not configured. Set it from Settings → School to print on cards."}
      </div>

      <div
        style={{
          marginTop: 14,
          background: "#ffffff10",
          border: "1px solid #ffffff20",
          borderRadius: 16,
          padding: 14,
          fontSize: 12,
          lineHeight: 1.6,
          color: "#D6D2EF",
        }}
      >
        <div style={{ fontWeight: 600, color: "#fff", marginBottom: 6 }}>Terms</div>
        1. This card is the property of the school and must be returned upon request.
        <br />
        2. Loss or damage must be reported immediately.
        <br />
        3. Card must be carried at all times within school premises.
        <br />
        4. Misuse will lead to disciplinary action.
      </div>

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, opacity: 0.7 }}>
        <img src={logoLight} alt="" style={{ height: 22, width: "auto", filter: "invert(1)" }} />
        <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Powered by Admeasy</span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: "#6B6B7B",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0A0A0F", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function nextMarch() {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  return `Mar ${m >= 3 ? y + 1 : y}`;
}

async function renderToPng(node: React.ReactElement): Promise<string> {
  // Mount off-screen, snapshot, unmount.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.top = "-10000px";
  host.style.left = "-10000px";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(node);
  // give React + fonts + images a moment
  await new Promise((r) => setTimeout(r, 250));
  try {
    const dataUrl = await toPng(host.firstElementChild as HTMLElement, {
      pixelRatio: 2,
      cacheBust: true,
    });
    return dataUrl;
  } finally {
    root.unmount();
    host.remove();
  }
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function exportIdCardPng(s: IDCardSubject) {
  const front = await renderToPng(<IDCardFront s={s} />);
  triggerDownload(front, `${slug(s.name)}-id-front.png`);
  const back = await renderToPng(<IDCardBack s={s} />);
  triggerDownload(back, `${slug(s.name)}-id-back.png`);
}

export async function exportIdCardPdf(s: IDCardSubject) {
  const front = await renderToPng(<IDCardFront s={s} />);
  const back = await renderToPng(<IDCardBack s={s} />);
  // A4 portrait, place both cards stacked, centered horizontally.
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const cardW = 86; // CR80-ish wider; using portrait orientation
  const cardH = 54 * (CARD_H / CARD_W) * (cardW / 54); // preserve aspect
  // simpler: fix dimensions as 60 x 95 mm
  const w = 60;
  const h = 95;
  const x = (pageW - w) / 2;
  pdf.addImage(front, "PNG", x, 20, w, h);
  pdf.addImage(back, "PNG", x, 20 + h + 10, w, h);
  pdf.save(`${slug(s.name)}-id-card.pdf`);
}

function slug(s: string) {
  return (s || "id").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

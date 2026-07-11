import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export type PasswordResetEmailProps = {
  userName: string;
  companyName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

// Token dasar warna diambil manual dari globals.css (--color-sage-deep dll) —
// email client TIDAK bisa baca CSS custom property/Tailwind kita, jadi nilai
// hex-nya harus disalin literal ke sini, bukan di-reuse lewat import.
const COLORS = {
  bgBase: "#FAF9F6",
  surface: "#FFFFFF",
  sageDeep: "#4A6741",
  ink: "#33393B",
  inkMuted: "#6B7280",
};

export function PasswordResetEmail({ userName, companyName, resetUrl, expiresInMinutes }: PasswordResetEmailProps) {
  return (
    <Html lang="id">
      <Head />
      <Preview>Reset password akun {companyName} Anda</Preview>
      <Body style={{ backgroundColor: COLORS.bgBase, fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: COLORS.surface, borderRadius: 14, padding: "32px 28px", maxWidth: 480 }}>
          <Heading style={{ fontSize: 17, fontWeight: 800, color: COLORS.ink, margin: "0 0 16px" }}>
            Reset Password
          </Heading>

          <Text style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.6, margin: "0 0 12px" }}>
            Halo {userName},
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.6, margin: "0 0 20px" }}>
            Kami menerima permintaan reset password untuk akun Anda di <strong>{companyName}</strong> (Sistem Manajemen
            Sapta). Klik tombol di bawah untuk membuat password baru.
          </Text>

          <Section style={{ textAlign: "center", margin: "0 0 20px" }}>
            <Button
              href={resetUrl}
              style={{
                backgroundColor: COLORS.sageDeep,
                color: "#FFFFFF",
                fontSize: 13,
                fontWeight: 700,
                padding: "10px 24px",
                borderRadius: 9,
                textDecoration: "none",
              }}
            >
              Reset Password
            </Button>
          </Section>

          <Text style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.6, margin: "0 0 8px" }}>
            Link ini berlaku selama {expiresInMinutes} menit dan hanya bisa dipakai sekali. Kalau Anda tidak meminta
            reset password, abaikan saja email ini — password Anda tidak akan berubah.
          </Text>

          <Hr style={{ borderColor: "rgba(51,57,59,0.1)", margin: "20px 0" }} />

          <Text style={{ fontSize: 10.5, color: COLORS.inkMuted, lineHeight: 1.6, margin: 0 }}>
            Kalau tombol di atas tidak berfungsi, salin dan tempel link berikut ke browser Anda:
            <br />
            <span style={{ wordBreak: "break-all" }}>{resetUrl}</span>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Video Review Studio", description: "எந்த மொழி வீடியோவையும் தமிழ் AI review video-ஆக மாற்றுங்கள்." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ta"><body>{children}</body></html>; }
